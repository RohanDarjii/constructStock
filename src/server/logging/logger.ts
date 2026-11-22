import "server-only";
import { getLoggingEnv } from "@/server/config/env";

export type LogLevel = "debug" | "info" | "warn" | "error";

/** Whitelisted fields prevent arbitrary request bodies and secrets entering logs. */
export interface LogContext {
  requestId?: string;
  route?: string;
  method?: string;
  organizationId?: string;
  userId?: string;
  statusCode?: number;
  durationMs?: number;
  errorCode?: string;
  exceptionType?: string;
  exceptionCode?: string;
  causeType?: string;
  causeCode?: string;
  stackFrames?: string[];
}

const priority: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

export function log(level: LogLevel, event: string, context: LogContext = {}): void {
  if (priority[level] < priority[getLoggingEnv().LOG_LEVEL]) return;

  console[level](JSON.stringify({ timestamp: new Date().toISOString(), level, event, ...context }));
}
