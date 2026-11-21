import "server-only";
import mongoose from "mongoose";
import { getMongoEnv } from "@/server/config/env";

declare global {
  // Cache the connection across Next.js development reloads in one Node process.
  var constructStockMongoose: Promise<typeof mongoose> | undefined;
}

export function connectToDatabase(): Promise<typeof mongoose> {
  if (!globalThis.constructStockMongoose) {
    const { MONGODB_URI, MONGODB_DB_NAME } = getMongoEnv();
    globalThis.constructStockMongoose = mongoose
      .connect(MONGODB_URI, { dbName: MONGODB_DB_NAME })
      .catch((error: unknown) => {
        globalThis.constructStockMongoose = undefined;
        throw error;
      });
  }

  return globalThis.constructStockMongoose;
}
