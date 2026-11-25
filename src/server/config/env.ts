import "server-only";
import { z } from "zod";
import { AppError } from "@/shared/errors/app-error";

const mongoEnvSchema = z.object({
  MONGODB_URI: z.string().min(1),
  MONGODB_DB_NAME: z.string().min(1).default("constructstock"),
});

const loggingEnvSchema = z.object({
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

const authEnvSchema = z.object({
  APP_URL: z.url(),
  TOKEN_PEPPER: z.string().min(32),
  ALLOWED_ORIGINS: z.string().optional(),
});

const blobEnvSchema = z.object({ BLOB_READ_WRITE_TOKEN: z.string().min(1) });

const emailEnvSchema = z.object({
  RESEND_API_KEY: z.string().min(1),
  EMAIL_FROM: z.string().min(5),
});

export function getMongoEnv() {
  return mongoEnvSchema.parse(process.env);
}

export function getLoggingEnv() {
  return loggingEnvSchema.parse(process.env);
}

export function getAuthEnv() {
  const result = authEnvSchema.safeParse(process.env);
  if (!result.success) {
    throw new AppError(
      "AUTH_NOT_CONFIGURED",
      process.env.NODE_ENV === "production"
        ? "Authentication is temporarily unavailable."
        : "Authentication setup is incomplete. Set APP_URL and TOKEN_PEPPER in .env.local, then restart the server.",
      503,
    );
  }
  return result.data;
}

export function getBlobEnv() {
  const result = blobEnvSchema.safeParse(process.env);
  if (!result.success) throw new AppError("STORAGE_NOT_CONFIGURED", "Private photo storage is not configured. Set BLOB_READ_WRITE_TOKEN and restart the server.", 503);
  return result.data;
}

export function getEmailEnv() {
  const result = emailEnvSchema.safeParse(process.env);
  if (!result.success) throw new AppError("EMAIL_NOT_CONFIGURED", "Password recovery is temporarily unavailable.", 503);
  return result.data;
}
