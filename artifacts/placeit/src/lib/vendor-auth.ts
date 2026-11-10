type VendorSession = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
};

const SESSION_KEY = "placeit-vendor-session";

function authConfig() {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim();
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) throw new Error("Vendor sign-in is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
  return { url: url.replace(/\/$/, ""), anonKey };
}

function readSession(): VendorSession | null {
  const raw = sessionStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const session: unknown = JSON.parse(raw);
    if (
      typeof session === "object" &&
      session !== null &&
      "access_token" in session &&
      typeof session.access_token === "string" &&
      "refresh_token" in session &&
      typeof session.refresh_token === "string" &&
      "expires_at" in session &&
      typeof session.expires_at === "number"
    ) {
      return session as VendorSession;
    }
  } catch {
    sessionStorage.removeItem(SESSION_KEY);
  }
  return null;
}

function saveSession(session: VendorSession) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function sessionFromResponse(value: unknown): VendorSession {
  if (
    typeof value !== "object" ||
    value === null ||
    !("access_token" in value) ||
    typeof value.access_token !== "string" ||
    !("refresh_token" in value) ||
    typeof value.refresh_token !== "string" ||
    !("expires_in" in value) ||
    typeof value.expires_in !== "number"
  ) {
    throw new Error("Supabase returned an invalid sign-in response.");
  }
  return {
    access_token: value.access_token,
    refresh_token: value.refresh_token,
    expires_at: Date.now() + value.expires_in * 1000,
  };
}

async function requestToken(path: string, body: Record<string, string>) {
  const { url, anonKey } = authConfig();
  const response = await fetch(`${url}/auth/v1/token?grant_type=${path}`, {
    method: "POST",
    headers: { apikey: anonKey, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const result: unknown = await response.json();
  if (!response.ok) {
    const message =
      typeof result === "object" && result !== null && "msg" in result && typeof result.msg === "string"
        ? result.msg
        : typeof result === "object" && result !== null && "message" in result && typeof result.message === "string"
          ? result.message
          : "Sign-in failed. Check your email and password.";
    throw new Error(message);
  }
  return sessionFromResponse(result);
}

export async function signInVendor(email: string, password: string) {
  const session = await requestToken("password", { email, password });
  saveSession(session);
}

export async function getVendorAccessToken(): Promise<string | null> {
  const session = readSession();
  if (!session) return null;
  if (session.expires_at > Date.now() + 60_000) return session.access_token;
  try {
    const refreshed = await requestToken("refresh_token", { refresh_token: session.refresh_token });
    saveSession(refreshed);
    return refreshed.access_token;
  } catch {
    signOutVendor();
    return null;
  }
}

export function signOutVendor() {
  sessionStorage.removeItem(SESSION_KEY);
}
