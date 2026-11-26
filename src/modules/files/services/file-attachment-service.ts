import "server-only";
import { del, get } from "@vercel/blob";
import mongoose from "mongoose";
import type { CurrentIdentity } from "@/modules/auth/services/auth-service";
import { Site } from "@/modules/sites/models/site";
import { requirePermission, requireSiteAccess } from "@/server/auth/authorize";
import { getBlobEnv } from "@/server/config/env";
import { connectToDatabase } from "@/server/db/connect";
import { AppError } from "@/shared/errors/app-error";
import { FileAttachment } from "../models/file-attachment";
import type { CreateAttachmentInput } from "../schemas/file-attachment";
import { maxReceiptDocumentBytes, maxWastagePhotoBytes } from "../schemas/file-attachment";

const objectId = (value: string) => {
  if (!/^[a-fA-F0-9]{24}$/.test(value)) throw new AppError("FILE_NOT_FOUND", "File not found.", 404);
  return new mongoose.Types.ObjectId(value);
};
const extension = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" } as const;

function permissionFor(purpose: string) { return purpose === "WASTAGE_PHOTO" ? "wastage.create" : "inventory.receive"; }
function limitFor(purpose: string) { return purpose === "WASTAGE_PHOTO" ? maxWastagePhotoBytes : maxReceiptDocumentBytes; }

function imageSignatureIsValid(mimeType: string, bytes: Uint8Array) {
  if (mimeType === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === "image/png") return bytes.length >= 8 && bytes.slice(0, 8).every((value, index) => value === [137, 80, 78, 71, 13, 10, 26, 10][index]);
  if (mimeType === "image/webp") return bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if (mimeType === "application/pdf") return bytes.length >= 5 && String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-";
  return false;
}

export async function createPendingAttachment(identity: CurrentIdentity, input: CreateAttachmentInput) {
  const purpose = input.purpose ?? "WASTAGE_PHOTO";
  requirePermission(identity, permissionFor(purpose));
  requireSiteAccess(identity, input.siteId);
  getBlobEnv();
  await connectToDatabase();
  await FileAttachment.init();
  const organizationId = objectId(identity.context.organizationId);
  const siteId = objectId(input.siteId);
  if (!await Site.exists({ _id: siteId, organizationId, status: "ACTIVE", deletedAt: null })) throw new AppError("SITE_NOT_FOUND", "Choose an active site.", 404);
  const attachmentId = new mongoose.Types.ObjectId();
  const linkedEntityType = purpose === "WASTAGE_PHOTO" ? "WASTAGE" : "GOODS_RECEIPT";
  const fileKey = `organizations/${organizationId}/${linkedEntityType.toLowerCase()}/${attachmentId}.${extension[input.mimeType]}`;
  await FileAttachment.create({ _id: attachmentId, organizationId, siteId, linkedEntityType, purpose, fileKey, fileName: input.fileName, mimeType: input.mimeType, size: input.size, uploadedBy: objectId(identity.context.userId), uploadState: "PENDING" });
  return { id: attachmentId.toString(), fileKey, uploadState: "PENDING" as const };
}

export async function authorizeUploadToken(identity: CurrentIdentity, attachmentId: string, pathname: string) {
  getBlobEnv();
  await connectToDatabase();
  const scope = { _id: objectId(attachmentId), organizationId: objectId(identity.context.organizationId), uploadedBy: objectId(identity.context.userId), uploadState: "PENDING" as const, linkedEntityId: null };
  const attachment = await FileAttachment.findOne(scope);
  if (!attachment || attachment.fileKey !== pathname) throw new AppError("FILE_NOT_FOUND", "Pending file not found.", 404);
  requirePermission(identity, permissionFor(attachment.purpose ?? "WASTAGE_PHOTO"));
  requireSiteAccess(identity, attachment.siteId.toString());
  await FileAttachment.updateOne(scope, { $set: { updatedAt: new Date() } });
  return { allowedContentTypes: [attachment.mimeType], maximumSizeInBytes: Math.min(attachment.size, limitFor(attachment.purpose ?? "WASTAGE_PHOTO")), addRandomSuffix: false, allowOverwrite: false };
}

export async function finalizeAttachment(identity: CurrentIdentity, attachmentId: string) {
  getBlobEnv();
  await connectToDatabase();
  const scope = { _id: objectId(attachmentId), organizationId: objectId(identity.context.organizationId), uploadedBy: objectId(identity.context.userId) };
  const attachment = await FileAttachment.findOne(scope);
  if (!attachment || attachment.linkedEntityId) throw new AppError("FILE_NOT_FOUND", "Pending file not found.", 404);
  requirePermission(identity, permissionFor(attachment.purpose ?? "WASTAGE_PHOTO"));
  requireSiteAccess(identity, attachment.siteId.toString());
  if (attachment.uploadState === "READY") return { id: attachment._id.toString(), uploadState: "READY" as const };
  let blob: Awaited<ReturnType<typeof get>>;
  try { blob = await get(attachment.fileKey, { access: "private", useCache: false }); }
  catch { throw new AppError("UPLOAD_NOT_COMPLETE", "File is not available yet. Retry finalizing the upload.", 409); }
  if (!blob || blob.statusCode !== 200) throw new AppError("UPLOAD_NOT_COMPLETE", "File is not available yet. Retry finalizing the upload.", 409);
  if (blob.blob.size !== attachment.size || blob.blob.size > limitFor(attachment.purpose ?? "WASTAGE_PHOTO") || blob.blob.contentType !== attachment.mimeType) {
    await blob.stream.cancel();
    throw new AppError("INVALID_FILE", "Uploaded file does not match the selected file.", 422);
  }
  const reader = blob.stream.getReader();
  let prefix = new Uint8Array(0);
  try {
    while (prefix.length < 12) {
      const { done, value } = await reader.read();
      if (done) break;
      const merged = new Uint8Array(prefix.length + value.length);
      merged.set(prefix); merged.set(value, prefix.length); prefix = merged.slice(0, 12);
    }
    await reader.cancel();
  } finally { reader.releaseLock(); }
  if (!imageSignatureIsValid(attachment.mimeType, prefix)) throw new AppError("INVALID_FILE", "Uploaded file type is not supported.", 422);
  const updated = await FileAttachment.updateOne({ ...scope, uploadState: "PENDING", linkedEntityId: null }, { $set: { uploadState: "READY", blobUrl: blob.blob.url, uploadedAt: new Date() } });
  if (updated.matchedCount !== 1) throw new AppError("FILE_NOT_FOUND", "Pending photo is no longer available.", 404);
  return { id: attachment._id.toString(), uploadState: "READY" as const };
}

export async function getAttachment(identity: CurrentIdentity, attachmentId: string) {
  requirePermission(identity, "inventory.view");
  await connectToDatabase();
  const attachment = await FileAttachment.findOne({ _id: objectId(attachmentId), organizationId: objectId(identity.context.organizationId), uploadState: "READY" });
  if (!attachment || !attachment.linkedEntityId) throw new AppError("FILE_NOT_FOUND", "File not found.", 404);
  requireSiteAccess(identity, attachment.siteId.toString());
  return attachment;
}

export async function getAttachmentMetadata(identity: CurrentIdentity, attachmentId: string) {
  const file = await getAttachment(identity, attachmentId);
  return { id: file._id.toString(), linkedEntityType: file.linkedEntityType, linkedEntityId: file.linkedEntityId!.toString(), purpose: file.purpose ?? "WASTAGE_PHOTO", fileName: file.fileName, mimeType: file.mimeType, size: file.size, uploadedAt: file.uploadedAt?.toISOString() ?? null, contentPath: `/api/v1/files/${file._id}/content` };
}

export async function deleteUnlinkedAttachment(identity: CurrentIdentity, attachmentId: string) {
  await connectToDatabase();
  const scope = { _id: objectId(attachmentId), organizationId: objectId(identity.context.organizationId), uploadedBy: objectId(identity.context.userId), linkedEntityId: null, uploadState: { $in: ["PENDING", "READY"] as const } };
  const attachment = await FileAttachment.findOne(scope);
  if (!attachment) throw new AppError("FILE_NOT_FOUND", "Unlinked file not found.", 404);
  requirePermission(identity, permissionFor(attachment.purpose ?? "WASTAGE_PHOTO"));
  requireSiteAccess(identity, attachment.siteId.toString());
  getBlobEnv();
  const claimed = await FileAttachment.findOneAndUpdate(scope, { $set: { uploadState: "DELETING" } });
  if (!claimed) throw new AppError("FILE_NOT_FOUND", "Unlinked file not found.", 404);
  try {
    await del(claimed.fileKey);
    await FileAttachment.deleteOne({ _id: claimed._id, organizationId: claimed.organizationId, linkedEntityId: null, uploadState: "DELETING" });
  } catch {
    throw new AppError("FILE_DELETE_PENDING", "File cleanup is pending. Please retry later.", 503);
  }
}

export async function readPrivateAttachment(identity: CurrentIdentity, attachmentId: string) {
  const attachment = await getAttachment(identity, attachmentId);
  getBlobEnv();
  const blob = await get(attachment.fileKey, { access: "private" });
  if (!blob || blob.statusCode !== 200) throw new AppError("FILE_NOT_FOUND", "File not found in storage.", 404);
  return { stream: blob.stream, mimeType: attachment.mimeType, fileName: attachment.fileName };
}

export async function linkAttachmentToWastage(organizationId: mongoose.Types.ObjectId, siteId: mongoose.Types.ObjectId, actorUserId: mongoose.Types.ObjectId, attachmentId: string, wastageId: mongoose.Types.ObjectId, session: mongoose.ClientSession) {
  const result = await FileAttachment.updateOne({ _id: objectId(attachmentId), organizationId, siteId, uploadedBy: actorUserId, linkedEntityType: "WASTAGE", linkedEntityId: null, uploadState: "READY", $or: [{ purpose: "WASTAGE_PHOTO" }, { purpose: { $exists: false } }] }, { $set: { linkedEntityId: wastageId } }, { session });
  if (result.matchedCount !== 1) throw new AppError("FILE_NOT_READY", "The supporting photo is unavailable or already attached.", 409);
}

export async function linkAttachmentToReceipt(organizationId: mongoose.Types.ObjectId, siteId: mongoose.Types.ObjectId, actorUserId: mongoose.Types.ObjectId, attachmentId: string, receiptId: mongoose.Types.ObjectId, session: mongoose.ClientSession) {
  const result = await FileAttachment.updateOne({ _id: objectId(attachmentId), organizationId, siteId, uploadedBy: actorUserId, linkedEntityType: "GOODS_RECEIPT", purpose: { $in: ["INVOICE", "DELIVERY_CHALLAN"] }, linkedEntityId: null, uploadState: "READY" }, { $set: { linkedEntityId: receiptId } }, { session });
  if (result.matchedCount !== 1) throw new AppError("FILE_NOT_READY", "The supplier document is unavailable or already attached.", 409);
}

export async function listReceiptAttachments(identity: CurrentIdentity, receiptId: string) {
  requirePermission(identity, "inventory.view");
  await connectToDatabase();
  const organizationId = objectId(identity.context.organizationId);
  const receipt = await mongoose.connection.collection("goods_receipts").findOne({ _id: objectId(receiptId), organizationId }, { projection: { siteId: 1 } });
  if (!receipt) throw new AppError("GOODS_RECEIPT_NOT_FOUND", "Goods receipt not found.", 404);
  requireSiteAccess(identity, String(receipt.siteId));
  const files = await FileAttachment.find({ organizationId, linkedEntityType: "GOODS_RECEIPT", linkedEntityId: objectId(receiptId), uploadState: "READY" }).select("purpose fileName mimeType size uploadedAt").sort({ _id: 1 });
  return files.map((file) => ({ id: file._id.toString(), purpose: file.purpose, fileName: file.fileName, mimeType: file.mimeType, size: file.size, uploadedAt: file.uploadedAt?.toISOString() ?? null }));
}

/** A scheduled, idempotent cleanup; never selects evidence linked to a record. */
export async function cleanupStaleUnlinkedAttachments(): Promise<{ deleted: number; failed: number; remaining: boolean }> {
  const token = getBlobEnv().BLOB_READ_WRITE_TOKEN;
  await connectToDatabase();
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const retryCutoff = new Date(Date.now() - 60 * 60 * 1000);
  const stale = { linkedEntityId: null, $or: [{ uploadState: { $in: ["PENDING", "READY"] as const }, updatedAt: { $lt: cutoff } }, { uploadState: "DELETING" as const, updatedAt: { $lt: retryCutoff } }] };
  const deadline = Date.now() + 45_000;
  let deleted = 0;
  let failed = 0;
  while (Date.now() < deadline) {
    const candidates = await FileAttachment.find(stale).select("_id").sort({ updatedAt: 1 }).limit(100);
    if (!candidates.length) break;
    for (let offset = 0; offset < candidates.length && Date.now() < deadline; offset += 10) {
      const outcomes = await Promise.all(candidates.slice(offset, offset + 10).map(async (candidate) => {
        const claimed = await FileAttachment.findOneAndUpdate({ _id: candidate._id, ...stale }, { $set: { uploadState: "DELETING" } });
        if (!claimed) return "skipped" as const;
        try {
          await del(claimed.fileKey, { token });
          await FileAttachment.deleteOne({ _id: claimed._id, linkedEntityId: null, uploadState: "DELETING" });
          return "deleted" as const;
        } catch { return "failed" as const; }
      }));
      deleted += outcomes.filter((outcome) => outcome === "deleted").length;
      failed += outcomes.filter((outcome) => outcome === "failed").length;
    }
  }
  return { deleted, failed, remaining: Boolean(await FileAttachment.exists(stale)) };
}
