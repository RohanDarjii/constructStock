import "server-only";
import mongoose from "mongoose";
import { ensureAuditReady, recordAudit } from "@/modules/audit/services/record-audit";
import { getAuthEnv, getEmailEnv } from "@/server/config/env";
import { connectToDatabase } from "@/server/db/connect";
import { EmailDeliveryError, sendPasswordResetEmail } from "@/server/email/send-password-reset";
import { log } from "@/server/logging/logger";
import { AppError } from "@/shared/errors/app-error";
import { AuthSession, Membership, User } from "../models/identity";
import { PasswordResetToken } from "../models/password-reset-token";
import type { ForgotPasswordInput, ResetPasswordInput } from "../schemas/auth";
import { enforceRateLimit, hashPassword, hashToken, randomToken } from "./security";

const resetLifetimeMs = 30 * 60 * 1000;
const hourMs = 60 * 60 * 1000;

/** Persist the token before returning a delivery task for the route to run after responding. */
export async function requestPasswordReset(input: ForgotPasswordInput, ipAddress: string | null): Promise<(() => Promise<void>) | null> {
  getAuthEnv();
  getEmailEnv();
  await connectToDatabase();
  await enforceRateLimit("forgot-password-email", input.email, 3, hourMs);
  if (ipAddress) await enforceRateLimit("forgot-password-ip", ipAddress, 10, hourMs);

  const user = await User.findOne({ email: input.email, status: "ACTIVE", deletedAt: null });
  if (!user) return null;

  await PasswordResetToken.init();
  const token = randomToken();
  const tokenHash = hashToken(token);
  const recordId = new mongoose.Types.ObjectId();
  await PasswordResetToken.create({
    _id: recordId,
    userId: user._id,
    tokenHash,
    expiresAt: new Date(Date.now() + resetLifetimeMs),
  });

  return async () => {
    // External delivery happens only after the token has committed to MongoDB.
    try {
      await sendPasswordResetEmail(user.email, token);
    } catch (error) {
      log("warn", "password_reset_email_failed", {
        userId: user._id.toString(),
        errorCode: "EMAIL_DELIVERY_FAILED",
        ...(error instanceof EmailDeliveryError ? { statusCode: error.statusCode, exceptionCode: error.providerCode } : {}),
      });
      await PasswordResetToken.updateOne({ _id: recordId }, { $set: { deliveryStatus: "FAILED" } }).catch(() => undefined);
      // Keep the response generic; another request can issue a fresh token.
      return;
    }
    await PasswordResetToken.updateOne({ _id: recordId }, { $set: { deliveryStatus: "SENT" } }).catch(() => {
      // A delivered link remains valid even if this diagnostic status update fails.
      log("warn", "password_reset_delivery_status_update_failed", { userId: user._id.toString(), errorCode: "DELIVERY_STATUS_UPDATE_FAILED" });
    });
  };
}

export async function resetPassword(input: ResetPasswordInput, ipAddress: string | null): Promise<void> {
  await connectToDatabase();
  await enforceRateLimit("reset-password-token", hashToken(input.token), 5, 15 * 60 * 1000);
  if (ipAddress) await enforceRateLimit("reset-password-ip", ipAddress, 20, hourMs);
  const now = new Date();
  const tokenHash = hashToken(input.token);
  const available = await PasswordResetToken.exists({ tokenHash, usedAt: null, expiresAt: { $gt: now }, deliveryStatus: { $ne: "FAILED" } });
  if (!available) throw new AppError("INVALID_RESET_TOKEN", "This reset link is invalid or expired. Request a new one.", 400);
  const passwordHash = await hashPassword(input.password);
  await ensureAuditReady();

  await mongoose.connection.transaction(async (session) => {
    const record = await PasswordResetToken.findOneAndUpdate(
      { tokenHash, usedAt: null, expiresAt: { $gt: new Date() }, deliveryStatus: { $ne: "FAILED" } },
      { $set: { usedAt: now } },
      { session, returnDocument: "after" },
    );
    if (!record) throw new AppError("INVALID_RESET_TOKEN", "This reset link is invalid or expired. Request a new one.", 400);

    const updated = await User.updateOne(
      { _id: record.userId, status: "ACTIVE", deletedAt: null },
      { $set: { passwordHash }, $inc: { credentialVersion: 1 } },
      { session },
    );
    if (updated.matchedCount !== 1) throw new AppError("INVALID_RESET_TOKEN", "This reset link is invalid or expired. Request a new one.", 400);

    await PasswordResetToken.updateMany({ userId: record.userId, usedAt: null }, { $set: { usedAt: now } }, { session });
    await AuthSession.updateMany({ userId: record.userId, revokedAt: null }, { $set: { revokedAt: now } }, { session });

    const memberships = await Membership.find({ userId: record.userId, status: "ACTIVE" }).session(session);
    for (const membership of memberships) {
      await recordAudit({
        organizationId: membership.organizationId,
        actorUserId: record.userId,
        action: "auth.password_reset",
        entityType: "user",
        entityId: record.userId.toString(),
        ipAddress,
      }, session);
    }
  });
}
