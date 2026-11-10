import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomInt,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";

const ORDER_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const ORDER_NUMBER_PREFIX = "PIT";
const MAX_ORDER_NUMBER_ATTEMPTS = 8;
export const MAX_PICKUP_CODE_ATTEMPTS = 5;

export function generateOrderNumber(random = randomBytes): string {
  const bytes = random(5);
  let suffix = "";
  for (const byte of bytes) suffix += ORDER_ALPHABET[byte % ORDER_ALPHABET.length];
  return `${ORDER_NUMBER_PREFIX}-${suffix}`;
}

export function generatePickupCode(random = randomInt): string {
  return random(0, 10_000).toString().padStart(4, "0");
}

export function hashPickupCode(code: string, salt = randomBytes(16).toString("hex")): string {
  const hash = scryptSync(code, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPickupCode(code: string, storedHash: string): boolean {
  if (!/^\d{4}$/.test(code)) return false;
  const [salt, expectedHex] = storedHash.split(":");
  if (!salt || !expectedHex || !/^[a-f0-9]{64}$/i.test(expectedHex)) return false;
  const expected = Buffer.from(expectedHex, "hex");
  const actual = scryptSync(code, salt, expected.length);
  return timingSafeEqual(actual, expected);
}

export function checkPickupCodeAttempt(
  code: string,
  storedHash: string,
  attempts: number,
): { result: "verified" } | { result: "incorrect"; attemptsRemaining: number } | { result: "locked" } {
  if (attempts >= MAX_PICKUP_CODE_ATTEMPTS) return { result: "locked" };
  if (verifyPickupCode(code, storedHash)) return { result: "verified" };
  const attemptsRemaining = MAX_PICKUP_CODE_ATTEMPTS - attempts - 1;
  return attemptsRemaining === 0
    ? { result: "locked" }
    : { result: "incorrect", attemptsRemaining };
}

export function encryptPickupCode(code: string, encryptionKey: string): string {
  const key = createHash("sha256").update(encryptionKey).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(code, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64url")).join(".");
}

export function decryptPickupCode(encryptedValue: string, encryptionKey: string): string {
  const [ivValue, tagValue, ciphertextValue] = encryptedValue.split(".");
  if (!ivValue || !tagValue || !ciphertextValue) throw new Error("Invalid encrypted pickup code.");
  const key = createHash("sha256").update(encryptionKey).digest();
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

type UniqueViolation = Error & { code?: string; constraint?: string };

function isOrderNumberCollision(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const databaseError = error as UniqueViolation;
  return databaseError.code === "23505" && databaseError.constraint === "orders_order_number_unique";
}

export async function retryOrderNumberCollision<T>(
  persist: (orderNumber: string) => Promise<T>,
  options: {
    generate?: () => string;
    maxAttempts?: number;
  } = {},
): Promise<T> {
  const generate = options.generate ?? generateOrderNumber;
  const maxAttempts = options.maxAttempts ?? MAX_ORDER_NUMBER_ATTEMPTS;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return await persist(generate());
    } catch (error) {
      if (!isOrderNumberCollision(error) || attempt === maxAttempts - 1) throw error;
    }
  }

  throw new Error("Could not generate a unique order number.");
}
