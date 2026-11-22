import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { AuthSession, Membership, Organization, User } from "@/modules/auth/models/identity";
import { identityFromSessionToken, login, logout, registerCompany } from "@/modules/auth/services/auth-service";
import { csrfToken, enforceRateLimit, verifyCsrf } from "@/modules/auth/services/security";
import { assertAllowedOrigin, authRoute, parseBody } from "@/server/http/auth-route";
import { getAuthEnv } from "@/server/config/env";
import { loginSchema } from "@/modules/auth/schemas/auth";

let replicaSet: MongoMemoryReplSet;

beforeAll(async () => {
  replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = replicaSet.getUri();
  process.env.MONGODB_DB_NAME = "constructstock_auth_test";
  process.env.APP_URL = "http://localhost:3000";
  process.env.TOKEN_PEPPER = "test-only-pepper-with-more-than-thirty-two-characters";
  process.env.EMAIL_DELIVERY_MODE = "resend";
  process.env.EMAIL_API_KEY = "";
  process.env.EMAIL_FROM = "";
});

afterAll(async () => {
  await mongoose.disconnect();
  globalThis.constructStockMongoose = undefined;
  await replicaSet?.stop();
});

describe("company onboarding and server-side sessions", () => {
  it("registers atomically and allows immediate sign-in without email delivery", async () => {
    const owner = { companyName: "Northgate Builders", ownerName: "Alex Owner", email: "alex@example.com", password: "strong-password-123", currencyCode: "EUR" };
    const registered = await registerCompany(owner, "192.0.2.10");
    expect(registered.user.email).toBe(owner.email);
    expect(await User.countDocuments()).toBe(1);
    expect(await Organization.countDocuments()).toBe(1);
    expect(await Membership.countDocuments()).toBe(1);
    expect((await User.findOne({ email: owner.email }).select("+passwordHash"))?.passwordHash).not.toBe(owner.password);

    const signedIn = await login({ email: owner.email, password: owner.password }, "192.0.2.10", null);
    expect(signedIn.identity.organization.id).toBe(registered.organization.id);
    expect(() => verifyCsrf(signedIn.sessionToken, csrfToken(signedIn.sessionToken))).not.toThrow();
    expect(() => verifyCsrf(signedIn.sessionToken, "incorrect")).toThrowError("The security token is invalid.");
    expect((await identityFromSessionToken(signedIn.sessionToken))?.context.organizationId).toBe(registered.organization.id);
    await logout(signedIn.sessionToken);
    expect(await identityFromSessionToken(signedIn.sessionToken)).toBeNull();
  });

  it("allows existing accounts with a legacy unverified field to sign in", async () => {
    const owner = { companyName: "Legacy Yard", ownerName: "Legacy Owner", email: "legacy@example.com", password: "strong-password-legacy", currencyCode: "USD" };
    const registered = await registerCompany(owner, "192.0.2.11");
    await User.collection.updateOne({ _id: new mongoose.Types.ObjectId(registered.user.id) }, { $set: { emailVerifiedAt: null } });
    const signedIn = await login({ email: owner.email, password: owner.password }, "192.0.2.11", null);
    expect((await identityFromSessionToken(signedIn.sessionToken))?.user.email).toBe(owner.email);
  });

  it("rolls back duplicate registration and rejects a session moved to another tenant", async () => {
    const first = { companyName: "East Yard", ownerName: "First Owner", email: "first@example.com", password: "strong-password-456", currencyCode: "USD" };
    const second = { companyName: "West Yard", ownerName: "Second Owner", email: "second@example.com", password: "strong-password-789", currencyCode: "INR" };
    const firstResult = await registerCompany(first, "192.0.2.12");
    const secondResult = await registerCompany(second, "192.0.2.13");
    const before = await Organization.countDocuments();
    await expect(registerCompany({ ...first, companyName: "Duplicate" }, "192.0.2.14")).rejects.toMatchObject({ code: "EMAIL_ALREADY_REGISTERED" });
    expect(await Organization.countDocuments()).toBe(before);

    const session = await login({ email: first.email, password: first.password }, null, null);
    expect(session.identity.organization.id).toBe(firstResult.organization.id);
    await AuthSession.updateOne({ userId: new mongoose.Types.ObjectId(session.identity.user.id), revokedAt: null }, { $set: { activeOrganizationId: new mongoose.Types.ObjectId(secondResult.organization.id) } });
    expect(await identityFromSessionToken(session.sessionToken)).toBeNull();
  });

  it("reports missing auth settings and rejects unsafe or excessive requests", async () => {
    const pepper = process.env.TOKEN_PEPPER;
    process.env.TOKEN_PEPPER = "";
    expect(() => getAuthEnv()).toThrowError("Authentication setup is incomplete.");
    process.env.TOKEN_PEPPER = pepper;

    await enforceRateLimit("test", "one-client", 2, 60_000);
    await enforceRateLimit("test", "one-client", 2, 60_000);
    await expect(enforceRateLimit("test", "one-client", 2, 60_000)).rejects.toMatchObject({ code: "RATE_LIMIT_EXCEEDED" });
    expect(() => assertAllowedOrigin(new Request("http://localhost:3000/api/v1/auth/login", { method: "POST", headers: { Origin: "https://other.example" } }))).toThrowError("Cross-site request rejected.");
    await expect(parseBody(new Request("http://localhost:3000/api/v1/auth/login", { method: "POST", body: "{}" }), loginSchema)).rejects.toMatchObject({ status: 415 });
  });

  it("limits streamed JSON bodies without Content-Length and accepts valid JSON", async () => {
    const valid = new Request("http://localhost:3000/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "alex@example.com", password: "test-password" }),
    });
    expect(await parseBody(valid, loginSchema)).toEqual({ email: "alex@example.com", password: "test-password" });

    let cancelled = false;
    const oversized = new Request("http://localhost:3000/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: new ReadableStream<Uint8Array>({
        start(controller) { controller.enqueue(new Uint8Array(8193)); },
        cancel() { cancelled = true; },
      }),
      duplex: "half",
    } as RequestInit & { duplex: "half" });
    expect(oversized.headers.has("content-length")).toBe(false);
    await expect(parseBody(oversized, loginSchema)).rejects.toMatchObject({ status: 413 });
    expect(cancelled).toBe(true);
  });

  it("logs safe diagnostics for unexpected auth failures", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const cause = Object.assign(new Error("mongodb+srv://secret:password@host"), { code: "ECONNREFUSED" });
      const failure = Object.assign(new Error("mongodb+srv://secret:password@host", { cause }), { name: "MongoServerSelectionError" });
      failure.stack = `MongoServerSelectionError: mongodb+srv://secret:password@host\n    at connect (${process.cwd()}/src/server/db/connect.ts:14:1)`;
      const response = await authRoute("auth.test", async () => { throw failure; });
      expect(response.status).toBe(500);
      const logged = JSON.parse(String(spy.mock.calls[0]?.[0])) as Record<string, unknown>;
      expect(logged).toMatchObject({ event: "auth_request_failed", errorCode: "INTERNAL_ERROR", exceptionType: "MongoServerSelectionError", causeCode: "ECONNREFUSED", stackFrames: ["src/server/db/connect.ts:14:1"] });
      expect(JSON.stringify(logged)).not.toContain("secret:password");
    } finally {
      spy.mockRestore();
    }
  });
});
