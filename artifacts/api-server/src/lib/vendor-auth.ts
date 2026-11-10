import type { RequestHandler } from "express";
import { eq } from "drizzle-orm";
import { db, vendorsTable } from "@workspace/db";
import { logger } from "./logger";

export const requireVendor: RequestHandler = async (req, res, next) => {
  const authorization = req.header("authorization");
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY?.trim();

  if (!supabaseUrl || !supabaseAnonKey) {
    res.status(503).json({ error: "Vendor sign-in is not configured." });
    return;
  }
  if (!token) {
    res.status(401).json({ error: "Sign in with your vendor account to continue." });
    return;
  }

  try {
    const authResponse = await fetch(`${supabaseUrl.replace(/\/$/, "")}/auth/v1/user`, {
      headers: {
        apikey: supabaseAnonKey,
        authorization: `Bearer ${token}`,
      },
    });
    if (authResponse.status === 401 || authResponse.status === 403) {
      res.status(401).json({ error: "Your vendor session has expired. Please sign in again." });
      return;
    }
    if (!authResponse.ok) {
      logger.error({ status: authResponse.status }, "Supabase vendor token verification failed");
      res.status(503).json({ error: "Vendor authentication is temporarily unavailable." });
      return;
    }

    const user: unknown = await authResponse.json();
    if (typeof user !== "object" || user === null || !("id" in user) || typeof user.id !== "string") {
      logger.error("Supabase returned a malformed user identity");
      res.status(503).json({ error: "Vendor authentication returned an invalid response." });
      return;
    }

    const [vendor] = await db
      .select({ id: vendorsTable.id })
      .from(vendorsTable)
      .where(eq(vendorsTable.supabaseUserId, user.id));
    if (!vendor) {
      res.status(403).json({ error: "This Supabase account is not linked to a vendor." });
      return;
    }

    res.locals.vendorId = vendor.id;
    next();
  } catch (error) {
    logger.error({ err: error }, "Supabase vendor authentication request failed");
    res.status(503).json({ error: "Vendor authentication is temporarily unavailable." });
  }
};

export function getAuthenticatedVendorId(res: Parameters<RequestHandler>[1]): string {
  const vendorId: unknown = res.locals.vendorId;
  if (typeof vendorId !== "string") throw new Error("Vendor auth middleware did not set a vendor ID.");
  return vendorId;
}
