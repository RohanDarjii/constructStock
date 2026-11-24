import Decimal from "decimal.js";

// The accepted 16-digit quantity and price fields can produce 32-digit totals.
const MoneyDecimal = Decimal.clone({ precision: 80 });
const roundMoney = (value: Decimal) => value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

export function pricePurchaseOrder(items: Array<{ quantityOrdered: string; unitPrice: string; taxRate: string }>) {
  const lines = items.map((item) => {
    const subtotal = roundMoney(new MoneyDecimal(item.quantityOrdered).times(item.unitPrice));
    const taxTotal = roundMoney(subtotal.times(item.taxRate).div(100));
    return { subtotal: subtotal.toFixed(2), taxTotal: taxTotal.toFixed(2), grandTotal: subtotal.plus(taxTotal).toFixed(2) };
  });
  const subtotal = lines.reduce((sum, line) => sum.plus(line.subtotal), new MoneyDecimal(0));
  const taxTotal = lines.reduce((sum, line) => sum.plus(line.taxTotal), new MoneyDecimal(0));
  return { lines, subtotal: subtotal.toFixed(2), taxTotal: taxTotal.toFixed(2), grandTotal: subtotal.plus(taxTotal).toFixed(2) };
}
