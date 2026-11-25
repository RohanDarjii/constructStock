import { afterAll, beforeAll, afterEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { AuditLog } from "@/modules/audit/models/audit-log";
import { AuthSession, User } from "@/modules/auth/models/identity";
import { PasswordResetToken } from "@/modules/auth/models/password-reset-token";
import { identityFromSessionToken, login, registerCompany } from "@/modules/auth/services/auth-service";
import { requestPasswordReset, resetPassword } from "@/modules/auth/services/password-reset-service";
import { hashToken, randomToken } from "@/modules/auth/services/security";
import { POST as forgotPasswordPost } from "@/app/api/v1/auth/forgot-password/route";
import { POST as resetPasswordPost } from "@/app/api/v1/auth/reset-password/route";

let replicaSet: MongoMemoryReplSet;
const oldPassword = "strong-password-123";

beforeAll(async () => {
  replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = replicaSet.getUri();
  process.env.MONGODB_DB_NAME = "constructstock_password_reset_test";
  process.env.APP_URL = "http://localhost:3000";
  process.env.TOKEN_PEPPER = "test-only-pepper-with-more-than-thirty-two-characters";
  process.env.RESEND_API_KEY = "test-only-key";
  process.env.EMAIL_FROM = "ConstructStock <security@example.com>";
});

afterEach(() => vi.unstubAllGlobals());
afterAll(async () => {
  await mongoose.disconnect();
  globalThis.constructStockMongoose = undefined;
  await replicaSet?.stop();
});

function mockEmail(status = 200) {
  const sent: { to: string[]; text: string }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as { to: string[]; text: string };
    sent.push(body);
    return Response.json(status === 200 ? { id: "email_test" } : { message: "provider failure" }, { status });
  }));
  return sent;
}

function tokenFromEmail(text: string): string {
  const link = text.match(/https?:\/\/[^\s]+/)?.[0];
  if (!link) throw new Error("Reset email did not contain a link.");
  return new URL(link).searchParams.get("token") ?? "";
}

describe("password recovery", () => {
  it("exposes the public API with a generic request result and rejects invalid reset links", async () => {
    const sent = mockEmail();
    const forgotResponse = await forgotPasswordPost(new Request("http://localhost:3000/api/v1/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
      body: JSON.stringify({ email: "not-registered@example.com" }),
    }));
    expect(forgotResponse.status).toBe(200);
    expect((await forgotResponse.json()).data.message).toContain("If an active account uses that address");
    expect(sent).toHaveLength(0);

    const resetResponse = await resetPasswordPost(new Request("http://localhost:3000/api/v1/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
      body: JSON.stringify({ token: "A".repeat(43), password: "another-strong-password-789" }),
    }));
    expect(resetResponse.status).toBe(400);
    expect((await resetResponse.json()).error.code).toBe("INVALID_RESET_TOKEN");
  });

  it("does not reveal whether an email is registered", async () => {
    const sent = mockEmail();
    await expect(requestPasswordReset({ email: "unknown@example.com" }, "192.0.2.51")).resolves.toBeNull();
    expect(sent).toHaveLength(0);
  });

  it("sends a single-use link, changes the password, and revokes existing sessions", async () => {
    const sent = mockEmail();
    const email = "reset-owner@example.com";
    const owner = await registerCompany({ companyName: "Reset Yard", ownerName: "Reset Owner", email, password: oldPassword, currencyCode: "EUR" }, null);
    const signedIn = await login({ email, password: oldPassword }, null, null);
    await User.collection.updateOne({ _id: new mongoose.Types.ObjectId(owner.user.id) }, { $unset: { credentialVersion: "" } });
    await AuthSession.collection.updateOne({ sessionTokenHash: hashToken(signedIn.sessionToken) }, { $unset: { credentialVersion: "" } });
    expect(await identityFromSessionToken(signedIn.sessionToken)).not.toBeNull();

    const deliver = await requestPasswordReset({ email }, "192.0.2.52");
    expect(sent).toHaveLength(0);
    await deliver?.();
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toEqual([email]);
    const token = tokenFromEmail(sent[0].text);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const record = await PasswordResetToken.findOne({ tokenHash: hashToken(token) }).select("+tokenHash");
    expect(record?.deliveryStatus).toBe("SENT");
    expect(record?.tokenHash).not.toBe(token);

    const newPassword = "a-new-strong-password-456";
    await resetPassword({ token, password: newPassword }, "192.0.2.52");
    expect(await identityFromSessionToken(signedIn.sessionToken)).toBeNull();
    expect(await AuthSession.countDocuments({ userId: new mongoose.Types.ObjectId(owner.user.id), revokedAt: null })).toBe(0);
    const lateSessionToken = randomToken();
    await AuthSession.create({
      userId: new mongoose.Types.ObjectId(owner.user.id),
      activeOrganizationId: new mongoose.Types.ObjectId(owner.organization.id),
      sessionTokenHash: hashToken(lateSessionToken),
      credentialVersion: 0,
      expiresAt: new Date(Date.now() + 60_000),
    });
    expect(await identityFromSessionToken(lateSessionToken)).toBeNull();
    await expect(login({ email, password: oldPassword }, null, null)).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
    const newSession = await login({ email, password: newPassword }, null, null);
    expect(await identityFromSessionToken(newSession.sessionToken)).not.toBeNull();
    await expect(resetPassword({ token, password: "another-strong-password-789" }, null)).rejects.toMatchObject({ code: "INVALID_RESET_TOKEN" });
    expect(await AuditLog.countDocuments({ action: "auth.password_reset", entityId: owner.user.id })).toBe(1);
  });

  it("rejects expired links and keeps earlier links usable until a reset succeeds", async () => {
    const sent = mockEmail();
    const email = "expiry-owner@example.com";
    await registerCompany({ companyName: "Expiry Yard", ownerName: "Expiry Owner", email, password: oldPassword, currencyCode: "EUR" }, null);
    await (await requestPasswordReset({ email }, null))?.();
    const oldToken = tokenFromEmail(sent[0].text);
    await (await requestPasswordReset({ email }, null))?.();
    const newestToken = tokenFromEmail(sent[1].text);
    await PasswordResetToken.updateOne({ tokenHash: hashToken(newestToken) }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    await expect(resetPassword({ token: newestToken, password: "a-new-strong-password-456" }, null)).rejects.toMatchObject({ code: "INVALID_RESET_TOKEN" });
    await expect(resetPassword({ token: oldToken, password: "a-new-strong-password-456" }, null)).resolves.toBeUndefined();
  });

  it("retains a failed delivery record and allows a fresh request", async () => {
    const email = "delivery-owner@example.com";
    await registerCompany({ companyName: "Delivery Yard", ownerName: "Delivery Owner", email, password: oldPassword, currencyCode: "EUR" }, null);
    const first = mockEmail();
    await (await requestPasswordReset({ email }, null))?.();
    const firstToken = tokenFromEmail(first[0].text);
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const failed = mockEmail(503);
      await (await requestPasswordReset({ email }, null))?.();
      const failedToken = tokenFromEmail(failed[0].text);
      const failedRecord = await PasswordResetToken.findOne({ tokenHash: hashToken(failedToken) });
      expect(failedRecord?.deliveryStatus).toBe("FAILED");
      await expect(resetPassword({ token: failedToken, password: "a-new-strong-password-456" }, null)).rejects.toMatchObject({ code: "INVALID_RESET_TOKEN" });
      expect(JSON.stringify(warning.mock.calls)).not.toContain(failedToken);
      expect(JSON.parse(String(warning.mock.calls[0]?.[0]))).toMatchObject({ event: "password_reset_email_failed", statusCode: 503 });
      await expect(resetPassword({ token: firstToken, password: "a-new-strong-password-456" }, null)).resolves.toBeUndefined();

      const sent = mockEmail();
      await (await requestPasswordReset({ email }, null))?.();
      expect(sent).toHaveLength(1);
      expect((await PasswordResetToken.findOne({ tokenHash: hashToken(tokenFromEmail(sent[0].text)) }))?.deliveryStatus).toBe("SENT");
    } finally {
      warning.mockRestore();
    }
  });
});
