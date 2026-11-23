import "server-only";
import mongoose, { type InferSchemaType, type Model, Schema } from "mongoose";
import { materialUnits } from "../types";

const materialSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, required: true, ref: "Organization" },
  code: { type: String, required: true },
  name: { type: String, required: true },
  description: { type: String, default: null },
  categoryId: { type: Schema.Types.ObjectId, required: true, ref: "MaterialCategory" },
  unit: { type: String, enum: materialUnits, required: true },
  minimumStockLevel: { type: Schema.Types.Decimal128, required: true },
  defaultReorderQuantity: { type: Schema.Types.Decimal128, default: null },
  status: { type: String, enum: ["ACTIVE", "ARCHIVED"], default: "ACTIVE" },
  unitLockedAt: { type: Date, default: null },
  createdBy: { type: Schema.Types.ObjectId, required: true, ref: "User" },
  deletedAt: { type: Date, default: null },
  deletedBy: { type: Schema.Types.ObjectId, default: null, ref: "User" },
}, { timestamps: true, collection: "materials", optimisticConcurrency: true });

materialSchema.index({ organizationId: 1, code: 1 }, { unique: true });
materialSchema.index({ organizationId: 1, status: 1, _id: -1 });
materialSchema.index({ organizationId: 1, categoryId: 1, status: 1 });

type MaterialDoc = InferSchemaType<typeof materialSchema>;
export const Material = (mongoose.models.Material as Model<MaterialDoc> | undefined) ?? mongoose.model<MaterialDoc>("Material", materialSchema);
