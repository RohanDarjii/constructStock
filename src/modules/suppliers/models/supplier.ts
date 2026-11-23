import "server-only";
import mongoose, { type InferSchemaType, type Model, Schema } from "mongoose";

const addressSchema = new Schema({
  line1: { type: String, required: true },
  city: { type: String, required: true },
  state: { type: String, required: true },
  postalCode: { type: String, required: true },
  country: { type: String, required: true },
}, { _id: false });

const supplierSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, required: true, ref: "Organization" },
  code: { type: String, required: true },
  name: { type: String, required: true },
  contactPerson: { type: String, default: null },
  phone: { type: String, default: null },
  email: { type: String, default: null },
  address: { type: addressSchema, default: null },
  gstNumber: { type: String, default: null },
  paymentTerms: { type: String, default: null },
  status: { type: String, enum: ["ACTIVE", "ARCHIVED"], default: "ACTIVE" },
  createdBy: { type: Schema.Types.ObjectId, required: true, ref: "User" },
  deletedAt: { type: Date, default: null },
  deletedBy: { type: Schema.Types.ObjectId, default: null, ref: "User" },
}, { timestamps: true, collection: "suppliers", optimisticConcurrency: true });

supplierSchema.index({ organizationId: 1, code: 1 }, { unique: true });
supplierSchema.index({ organizationId: 1, status: 1, _id: -1 });

type SupplierDoc = InferSchemaType<typeof supplierSchema>;
export const Supplier = (mongoose.models.Supplier as Model<SupplierDoc> | undefined) ?? mongoose.model<SupplierDoc>("Supplier", supplierSchema);
