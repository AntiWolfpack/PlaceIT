import assert from "node:assert/strict";
import test from "node:test";
import {
  checkPickupCodeAttempt,
  decryptPickupCode,
  encryptPickupCode,
  generateOrderNumber,
  generatePickupCode,
  hashPickupCode,
  retryOrderNumberCollision,
} from "./order-identifiers.ts";

test("generated order numbers use the public format and are unique in a batch", () => {
  const orderNumbers = Array.from({ length: 1000 }, () => generateOrderNumber());
  assert.equal(new Set(orderNumbers).size, orderNumbers.length);
  assert.ok(orderNumbers.every((value) => /^PIT-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{5}$/.test(value)));
});

test("order number assignment retries a database unique collision", async () => {
  const attemptedNumbers = ["PIT-23456", "PIT-23456", "PIT-34567"];
  const used = new Set(["PIT-23456"]);
  let generated = 0;
  const assigned = await retryOrderNumberCollision(async (number) => {
    if (used.has(number)) {
      const error = new Error("duplicate order number") as Error & { code: string; constraint: string };
      error.code = "23505";
      error.constraint = "orders_order_number_unique";
      throw error;
    }
    used.add(number);
    return number;
  }, { generate: () => attemptedNumbers[generated++] ?? "PIT-45678" });

  assert.equal(assigned, "PIT-34567");
  assert.equal(generated, 3);
});

test("order number collision retry stops at its configured attempt limit", async () => {
  const error = Object.assign(new Error("duplicate order number"), {
    code: "23505",
    constraint: "orders_order_number_unique",
  });
  let generated = 0;
  await assert.rejects(
    retryOrderNumberCollision(async () => {
      throw error;
    }, { generate: () => `PIT-${generated++}`, maxAttempts: 3 }),
    (actual: unknown) => actual === error,
  );
  assert.equal(generated, 3);
});

test("pickup codes are four digits and can be verified without storing plaintext", () => {
  const code = generatePickupCode();
  assert.match(code, /^\d{4}$/);
  const hash = hashPickupCode(code, "fixed-salt-for-test");
  assert.equal(verifyCode(code, hash), true);
  assert.equal(verifyCode("0000", hash), code === "0000");
});

test("pickup-code attempts lock after five wrong entries and accept a correct code before lockout", () => {
  const correctHash = hashPickupCode("4826", "fixed-salt-for-attempt-test");
  assert.deepEqual(checkPickupCodeAttempt("4826", correctHash, 0), { result: "verified" });
  assert.deepEqual(checkPickupCodeAttempt("0000", correctHash, 0), { result: "incorrect", attemptsRemaining: 4 });
  assert.deepEqual(checkPickupCodeAttempt("0000", correctHash, 3), { result: "incorrect", attemptsRemaining: 1 });
  assert.deepEqual(checkPickupCodeAttempt("0000", correctHash, 4), { result: "locked" });
  assert.deepEqual(checkPickupCodeAttempt("4826", correctHash, 5), { result: "locked" });
});

test("pickup code encryption is authenticated and decryptable with the configured secret", () => {
  const encrypted = encryptPickupCode("0931", "a-long-test-secret");
  assert.equal(decryptPickupCode(encrypted, "a-long-test-secret"), "0931");
  assert.throws(() => decryptPickupCode(encrypted, "incorrect-secret"));
});

function verifyCode(code: string, hash: string) {
  return checkPickupCodeAttempt(code, hash, 0).result === "verified";
}
