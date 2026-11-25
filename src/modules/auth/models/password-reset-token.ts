import "server-only";
import mongoose, { type InferSchemaType, type Model, Schema } from "mongoose";

const passwordResetTokenSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, required: true, ref: "User" },
  tokenHash: { type: String, required: true, select: false },
  expiresAt: { type: Date, required: true },
  usedAt: { type: Date, default: null },
  deliveryStatus: { type: String, enum: ["PENDING", "SENT", "FAILED"], default: "PENDING" },
  createdAt: { type: Date, default: Date.now },
}, { collection: "password_reset_tokens" });

passwordResetTokenSchema.index({ tokenHash: 1 }, { unique: true });
passwordResetTokenSchema.index({ userId: 1, usedAt: 1 });
passwordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

type PasswordResetTokenDoc = InferSchemaType<typeof passwordResetTokenSchema>;
export const PasswordResetToken = (mongoose.models.PasswordResetToken as Model<PasswordResetTokenDoc> | undefined)
  ?? mongoose.model<PasswordResetTokenDoc>("PasswordResetToken", passwordResetTokenSchema);
