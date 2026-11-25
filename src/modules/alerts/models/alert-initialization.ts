import "server-only";
import mongoose, { type InferSchemaType, type Model, Schema } from "mongoose";

const schema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, required: true, unique: true, ref: "Organization" },
  completedAt: { type: Date, required: true },
}, { collection: "alert_initializations" });

type InitializationDocument = InferSchemaType<typeof schema>;
export const AlertInitialization = (mongoose.models.AlertInitialization as Model<InitializationDocument> | undefined) ?? mongoose.model<InitializationDocument>("AlertInitialization", schema);
