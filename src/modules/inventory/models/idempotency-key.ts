import "server-only";
import mongoose, { type InferSchemaType, type Model, Schema } from "mongoose";

const idempotencySchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, required: true, ref: "Organization" },
  key: { type: String, required: true },
  operation: { type: String, required: true },
  requestHash: { type: String, required: true },
  responseStatus: { type: Number, required: true },
  resourceId: { type: Schema.Types.ObjectId, default: null },
  responseBody: { type: Schema.Types.Mixed, required: true },
  expiresAt: { type: Date, required: true },
}, { timestamps: { createdAt: true, updatedAt: false }, collection: "idempotency_keys" });

idempotencySchema.index({ organizationId: 1, key: 1 }, { unique: true });
idempotencySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

type IdempotencyDocument = InferSchemaType<typeof idempotencySchema>;
export const IdempotencyKey = (mongoose.models.IdempotencyKey as Model<IdempotencyDocument> | undefined) ?? mongoose.model<IdempotencyDocument>("IdempotencyKey", idempotencySchema);
