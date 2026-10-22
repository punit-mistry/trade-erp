/**
 * Monetary / quantity precision rules, shared by server and UI so the value
 * shown in the form is exactly the value stored.
 *   quantity: up to 3 decimals, price per UOM: up to 4, money: 2.
 */
export const QUANTITY_DECIMALS = 3;
export const PRICE_DECIMALS = 4;
export const MONEY_DECIMALS = 2;

export function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round((value + Math.sign(value) * Number.EPSILON) * factor) / factor;
}

export function computeTradeValue(quantity: number | undefined, pricePerUom: number | undefined): number | undefined {
  if (quantity === undefined || pricePerUom === undefined) return undefined;
  if (!Number.isFinite(quantity) || !Number.isFinite(pricePerUom)) return undefined;
  return roundTo(roundTo(quantity, QUANTITY_DECIMALS) * roundTo(pricePerUom, PRICE_DECIMALS), MONEY_DECIMALS);
}

/** True when a stored total disagrees with quantity × price by more than a cent. */
export function valueDiscrepancy(quantity?: number, pricePerUom?: number, storedValue?: number): number | null {
  const computed = computeTradeValue(quantity, pricePerUom);
  if (computed === undefined || storedValue === undefined) return null;
  const diff = roundTo(storedValue - computed, MONEY_DECIMALS);
  return Math.abs(diff) >= 0.01 ? diff : null;
}

export function decimalsOf(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const s = value.toString();
  if (s.includes("e-")) return Number(s.split("e-")[1]);
  return s.includes(".") ? s.split(".")[1].length : 0;
}
