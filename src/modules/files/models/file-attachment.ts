import "server-only";
import mongoose, { type InferSchemaType, type Model, Schema } from "mongoose";

const fileAttachmentSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, required: true, ref: "Organization" },
  siteId: { type: Schema.Types.ObjectId, required: true, ref: "Site" },
  linkedEntityType: { type: String, enum: ["WASTAGE"], required: true },
  linkedEntityId: { type: Schema.Types.ObjectId, default: null },
  fileKey: { type: String, required: true },
  blobUrl: { type: String, default: null },
  fileName: { type: String, required: true },
  mimeType: { type: String, required: true },
  size: { type: Number, required: true },
  uploadState: { type: String, enum: ["PENDING", "READY", "DELETING"], default: "PENDING", required: true },
  uploadedBy: { type: Schema.Types.ObjectId, required: true, ref: "User" },
  uploadedAt: { type: Date, default: null },
}, { timestamps: true, collection: "file_attachments" });

fileAttachmentSchema.index({ organizationId: 1, fileKey: 1 }, { unique: true });
fileAttachmentSchema.index({ organizationId: 1, linkedEntityType: 1, linkedEntityId: 1 });
fileAttachmentSchema.index({ uploadState: 1, linkedEntityId: 1, updatedAt: 1 });

type FileAttachmentDocument = InferSchemaType<typeof fileAttachmentSchema>;
export const FileAttachment = (mongoose.models.FileAttachment as Model<FileAttachmentDocument> | undefined) ?? mongoose.model<FileAttachmentDocument>("FileAttachment", fileAttachmentSchema);
