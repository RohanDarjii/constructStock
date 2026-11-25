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
import { maxWastagePhotoBytes } from "../schemas/file-attachment";

const objectId = (value: string) => {
  if (!/^[a-fA-F0-9]{24}$/.test(value)) throw new AppError("FILE_NOT_FOUND", "Photo not found.", 404);
  return new mongoose.Types.ObjectId(value);
};
const extension = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;

function imageSignatureIsValid(mimeType: string, bytes: Uint8Array) {
  if (mimeType === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === "image/png") return bytes.length >= 8 && bytes.slice(0, 8).every((value, index) => value === [137, 80, 78, 71, 13, 10, 26, 10][index]);
  if (mimeType === "image/webp") return bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  return false;
}

export async function createPendingAttachment(identity: CurrentIdentity, input: CreateAttachmentInput) {
  requirePermission(identity, "wastage.create");
  requireSiteAccess(identity, input.siteId);
  getBlobEnv();
  await connectToDatabase();
  await FileAttachment.init();
  const organizationId = objectId(identity.context.organizationId);
  const siteId = objectId(input.siteId);
  if (!await Site.exists({ _id: siteId, organizationId, status: "ACTIVE", deletedAt: null })) throw new AppError("SITE_NOT_FOUND", "Choose an active site.", 404);
  const attachmentId = new mongoose.Types.ObjectId();
  const fileKey = `organizations/${organizationId}/wastage/${attachmentId}.${extension[input.mimeType]}`;
  await FileAttachment.create({ _id: attachmentId, organizationId, siteId, linkedEntityType: "WASTAGE", fileKey, fileName: input.fileName, mimeType: input.mimeType, size: input.size, uploadedBy: objectId(identity.context.userId), uploadState: "PENDING" });
  return { id: attachmentId.toString(), fileKey, uploadState: "PENDING" as const };
}

export async function authorizeUploadToken(identity: CurrentIdentity, attachmentId: string, pathname: string) {
  requirePermission(identity, "wastage.create");
  getBlobEnv();
  await connectToDatabase();
  const attachment = await FileAttachment.findOneAndUpdate({ _id: objectId(attachmentId), organizationId: objectId(identity.context.organizationId), uploadedBy: objectId(identity.context.userId), uploadState: "PENDING", linkedEntityId: null }, { $set: { updatedAt: new Date() } });
  if (!attachment || attachment.fileKey !== pathname) throw new AppError("FILE_NOT_FOUND", "Pending photo not found.", 404);
  requireSiteAccess(identity, attachment.siteId.toString());
  return { allowedContentTypes: [attachment.mimeType], maximumSizeInBytes: Math.min(attachment.size, maxWastagePhotoBytes), addRandomSuffix: false, allowOverwrite: false };
}

export async function finalizeAttachment(identity: CurrentIdentity, attachmentId: string) {
  requirePermission(identity, "wastage.create");
  getBlobEnv();
  await connectToDatabase();
  const scope = { _id: objectId(attachmentId), organizationId: objectId(identity.context.organizationId), uploadedBy: objectId(identity.context.userId) };
  const attachment = await FileAttachment.findOne(scope);
  if (!attachment || attachment.linkedEntityId) throw new AppError("FILE_NOT_FOUND", "Pending photo not found.", 404);
  requireSiteAccess(identity, attachment.siteId.toString());
  if (attachment.uploadState === "READY") return { id: attachment._id.toString(), uploadState: "READY" as const };
  let blob: Awaited<ReturnType<typeof get>>;
  try { blob = await get(attachment.fileKey, { access: "private", useCache: false }); }
  catch { throw new AppError("UPLOAD_NOT_COMPLETE", "Photo is not available yet. Retry finalizing the upload.", 409); }
  if (!blob || blob.statusCode !== 200) throw new AppError("UPLOAD_NOT_COMPLETE", "Photo is not available yet. Retry finalizing the upload.", 409);
  if (blob.blob.size !== attachment.size || blob.blob.size > maxWastagePhotoBytes || blob.blob.contentType !== attachment.mimeType) {
    await blob.stream.cancel();
    throw new AppError("INVALID_PHOTO", "Uploaded photo does not match the selected file.", 422);
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
  if (!imageSignatureIsValid(attachment.mimeType, prefix)) throw new AppError("INVALID_PHOTO", "Uploaded file is not a supported image.", 422);
  const updated = await FileAttachment.updateOne({ ...scope, uploadState: "PENDING", linkedEntityId: null }, { $set: { uploadState: "READY", blobUrl: blob.blob.url, uploadedAt: new Date() } });
  if (updated.matchedCount !== 1) throw new AppError("FILE_NOT_FOUND", "Pending photo is no longer available.", 404);
  return { id: attachment._id.toString(), uploadState: "READY" as const };
}

export async function getAttachment(identity: CurrentIdentity, attachmentId: string) {
  requirePermission(identity, "inventory.view");
  await connectToDatabase();
  const attachment = await FileAttachment.findOne({ _id: objectId(attachmentId), organizationId: objectId(identity.context.organizationId), uploadState: "READY" });
  if (!attachment || !attachment.linkedEntityId) throw new AppError("FILE_NOT_FOUND", "Photo not found.", 404);
  requireSiteAccess(identity, attachment.siteId.toString());
  return attachment;
}

export async function readPrivateAttachment(identity: CurrentIdentity, attachmentId: string) {
  const attachment = await getAttachment(identity, attachmentId);
  getBlobEnv();
  const blob = await get(attachment.fileKey, { access: "private" });
  if (!blob || blob.statusCode !== 200) throw new AppError("FILE_NOT_FOUND", "Photo not found in storage.", 404);
  return { stream: blob.stream, mimeType: attachment.mimeType, fileName: attachment.fileName };
}

export async function linkAttachmentToWastage(organizationId: mongoose.Types.ObjectId, siteId: mongoose.Types.ObjectId, actorUserId: mongoose.Types.ObjectId, attachmentId: string, wastageId: mongoose.Types.ObjectId, session: mongoose.ClientSession) {
  const result = await FileAttachment.updateOne({ _id: objectId(attachmentId), organizationId, siteId, uploadedBy: actorUserId, linkedEntityType: "WASTAGE", linkedEntityId: null, uploadState: "READY" }, { $set: { linkedEntityId: wastageId } }, { session });
  if (result.matchedCount !== 1) throw new AppError("FILE_NOT_READY", "The supporting photo is unavailable or already attached.", 409);
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
