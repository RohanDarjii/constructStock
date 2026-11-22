import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import argon2 from "argon2";
import { getAuthEnv } from "@/server/config/env";
import { AppError } from "@/shared/errors/app-error";
import { AuthRateLimit } from "../models/identity";

export const SESSION_DAYS = 7;

export function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  return argon2.verify(hash, password);
}

export function csrfToken(sessionToken: string): string {
  return createHmac("sha256", getAuthEnv().TOKEN_PEPPER).update(sessionToken).digest("base64url");
}

export function verifyCsrf(sessionToken: string, submitted: string | null): void {
  const expected = Buffer.from(csrfToken(sessionToken));
  const actual = Buffer.from(submitted ?? "");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new AppError("CSRF_VALIDATION_FAILED", "The security token is invalid.", 403);
  }
}

/** MongoDB's atomic increment keeps limits consistent across Vercel instances. */
export async function enforceRateLimit(action: string, identifier: string, limit: number, windowMs: number): Promise<void> {
  await AuthRateLimit.init();
  const windowStart = Math.floor(Date.now() / windowMs) * windowMs;
  const key = hashToken([action, identifier, windowStart].join(":"));
  const update = { $inc: { count: 1 }, $setOnInsert: { key, expiresAt: new Date(windowStart + windowMs) } };
  let record;
  try {
    record = await AuthRateLimit.findOneAndUpdate({ key }, update, { upsert: true, returnDocument: "after" });
  } catch (error) {
    if (!isDuplicateKey(error)) throw error;
    record = await AuthRateLimit.findOneAndUpdate({ key }, { $inc: { count: 1 } }, { returnDocument: "after" });
  }
  if (record && record.count > limit) {
    throw new AppError("RATE_LIMIT_EXCEEDED", "Too many attempts. Please try again later.", 429);
  }
}

export function isDuplicateKey(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === 11000;
}
