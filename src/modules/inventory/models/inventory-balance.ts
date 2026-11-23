import "server-only";
import mongoose, { type InferSchemaType, type Model, Schema } from "mongoose";

const balanceSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, required: true, ref: "Organization" },
  siteId: { type: Schema.Types.ObjectId, required: true, ref: "Site" },
  materialId: { type: Schema.Types.ObjectId, required: true, ref: "Material" },
  onHandQuantity: { type: Schema.Types.Decimal128, required: true, default: () => mongoose.Types.Decimal128.fromString("0") },
  reservedQuantity: { type: Schema.Types.Decimal128, required: true, default: () => mongoose.Types.Decimal128.fromString("0") },
  availableQuantity: { type: Schema.Types.Decimal128, required: true, default: () => mongoose.Types.Decimal128.fromString("0") },
  inventoryValue: { type: Schema.Types.Decimal128, required: true, default: () => mongoose.Types.Decimal128.fromString("0") },
  version: { type: Number, required: true, default: 0 },
}, { timestamps: true, collection: "inventory_balances" });

balanceSchema.index({ organizationId: 1, siteId: 1, materialId: 1 }, { unique: true });
balanceSchema.index({ organizationId: 1, materialId: 1, siteId: 1 });

type BalanceDocument = InferSchemaType<typeof balanceSchema>;
export const InventoryBalance = (mongoose.models.InventoryBalance as Model<BalanceDocument> | undefined) ?? mongoose.model<BalanceDocument>("InventoryBalance", balanceSchema);
