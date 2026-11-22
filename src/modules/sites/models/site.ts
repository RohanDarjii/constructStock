import "server-only";
import mongoose, { type InferSchemaType, type Model, Schema } from "mongoose";
import { siteStatuses } from "../types";

const locationSchema = new Schema({
  address: { type: String, default: null },
  city: { type: String, required: true },
  state: { type: String, default: null },
  country: { type: String, required: true },
}, { _id: false });

const contactSchema = new Schema({
  name: { type: String, default: null },
  phone: { type: String, default: null },
  email: { type: String, default: null },
}, { _id: false });

const siteSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, required: true, ref: "Organization" },
  code: { type: String, required: true },
  name: { type: String, required: true },
  description: { type: String, default: null },
  location: { type: locationSchema, required: true },
  contact: { type: contactSchema, default: null },
  status: { type: String, enum: siteStatuses, default: "PLANNED" },
  statusBeforeArchive: { type: String, enum: siteStatuses, default: null },
  startDate: { type: Date, default: null },
  expectedCompletionDate: { type: Date, default: null },
  budget: { type: Schema.Types.Decimal128, default: null },
  createdBy: { type: Schema.Types.ObjectId, required: true, ref: "User" },
  deletedAt: { type: Date, default: null },
  deletedBy: { type: Schema.Types.ObjectId, default: null, ref: "User" },
}, { timestamps: true, collection: "sites", optimisticConcurrency: true });

siteSchema.index({ organizationId: 1, code: 1 }, { unique: true });
siteSchema.index({ organizationId: 1, status: 1, _id: -1 });
siteSchema.index({ organizationId: 1, deletedAt: 1, _id: -1 });

type SiteDoc = InferSchemaType<typeof siteSchema>;
export const Site = (mongoose.models.Site as Model<SiteDoc> | undefined) ?? mongoose.model<SiteDoc>("Site", siteSchema);
