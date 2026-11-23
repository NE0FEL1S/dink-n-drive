import "server-only";

import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";

/**
 * Guest device token (SPEC §5): a long random secret in an httpOnly cookie that links
 * guest bookings to this browser. The database stores only its sha-256 hash and
 * checks it inside the booking functions; the raw token never reaches client code.
 */
export const DEVICE_COOKIE = "dnd_device";
const MAX_AGE = 400 * 24 * 60 * 60; // the longest browsers allow
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

/** The token from the cookie, if there is a valid one. */
export async function readDeviceToken(): Promise<string | null> {
  const value = (await cookies()).get(DEVICE_COOKIE)?.value;
  return value && TOKEN_RE.test(value) ? value : null;
}

/** Reads the token, or creates and stores a new one. Server Actions / Route Handlers only. */
export async function ensureDeviceToken(): Promise<string> {
  const existing = await readDeviceToken();
  if (existing) return existing;
  const token = randomBytes(32).toString("base64url"); // 43 chars
  (await cookies()).set(DEVICE_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
  return token;
}
