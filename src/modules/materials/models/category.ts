import "server-only";
import mongoose, { type InferSchemaType, type Model, Schema } from "mongoose";

const categorySchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, required: true, ref: "Organization" },
  name: { type: String, required: true },
  nameKey: { type: String, required: true },
  description: { type: String, default: null },
  status: { type: String, enum: ["ACTIVE", "ARCHIVED"], default: "ACTIVE" },
  catalogVersion: { type: Number, default: 0 },
  deletedAt: { type: Date, default: null },
}, { timestamps: true, collection: "material_categories", optimisticConcurrency: true });

categorySchema.index({ organizationId: 1, nameKey: 1 }, { unique: true });
categorySchema.index({ organizationId: 1, status: 1, nameKey: 1 });

type CategoryDoc = InferSchemaType<typeof categorySchema>;
export const MaterialCategory = (mongoose.models.MaterialCategory as Model<CategoryDoc> | undefined) ?? mongoose.model<CategoryDoc>("MaterialCategory", categorySchema);
