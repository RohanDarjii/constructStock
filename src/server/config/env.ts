import "server-only";
import { z } from "zod";

const mongoEnvSchema = z.object({
  MONGODB_URI: z.string().min(1),
  MONGODB_DB_NAME: z.string().min(1).default("constructstock"),
});

const loggingEnvSchema = z.object({
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export function getMongoEnv() {
  return mongoEnvSchema.parse(process.env);
}

export function getLoggingEnv() {
  return loggingEnvSchema.parse(process.env);
}
