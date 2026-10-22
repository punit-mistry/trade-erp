/**
 * Trade completeness rules. Pure — the wizard uses it to show errors/warnings
 * per step, and the server enforces it on submit/confirm. Drafts may be
 * incomplete; nothing incomplete can be submitted or confirmed.
 */
import { computeTradeValue, valueDiscrepancy } from "./money";
import type { TradeFields } from "./validators";

export type TradeIssue = {
  field: keyof TradeFields | "totalValue";
  step: 1 | 2 | 3 | 4;
  message: string;
  severity: "error" | "warning";
};

export type TradeForValidation = TradeFields & {
  totalValue?: number;
  valueOverridden?: boolean;
  priceNeedsValidation?: boolean;
};

const REQUIRED: { field: keyof TradeFields; step: 1 | 2 | 3 | 4; label: string }[] = [
  { field: "direction", step: 1, label: "Trade direction" },
  { field: "companyId", step: 1, label: "Internal company" },
  { field: "counterpartyId", step: 1, label: "Counterparty" },
  { field: "commodityId", step: 1, label: "Commodity" },
  { field: "tradeDate", step: 1, label: "Trade date" },
  { field: "quantity", step: 2, label: "Quantity" },
  { field: "uom", step: 2, label: "Unit of measure" },
  { field: "priceType", step: 2, label: "Price type" },
  { field: "currency", step: 2, label: "Currency" },
  { field: "incoterm", step: 3, label: "Incoterm" },
  { field: "paymentTerm", step: 3, label: "Payment term" },
  { field: "shipmentPeriod", step: 3, label: "Shipment period" },
  { field: "loadingLocation", step: 3, label: "Loading location" },
  { field: "dischargeLocation", step: 3, label: "Discharge location" },
];

function isBlank(value: unknown) {
  return value === undefined || value === null || (typeof value === "string" && value.trim() === "");
}

export function validateTrade(trade: TradeForValidation): TradeIssue[] {
  const issues: TradeIssue[] = [];
  for (const r of REQUIRED) {
    if (isBlank(trade[r.field])) {
      issues.push({ field: r.field, step: r.step, message: `${r.label} is required.`, severity: "error" });
    }
  }
  if (trade.quantity !== undefined && !(trade.quantity > 0)) {
    issues.push({ field: "quantity", step: 2, message: "Quantity must be greater than zero.", severity: "error" });
  }
  if (trade.pricePerUom !== undefined && trade.pricePerUom < 0) {
    issues.push({ field: "pricePerUom", step: 2, message: "Price cannot be negative.", severity: "error" });
  }
  if (trade.pricePerUom === undefined && !trade.priceNeedsValidation) {
    issues.push({ field: "pricePerUom", step: 2, message: "Price per UOM is required.", severity: "error" });
  }
  if (trade.priceNeedsValidation) {
    issues.push({
      field: "pricePerUom",
      step: 2,
      message: "Unit price is unavailable for this historical record and needs validation.",
      severity: "warning",
    });
  }
  if (trade.tolerancePct !== undefined && (trade.tolerancePct < 0 || trade.tolerancePct > 100)) {
    issues.push({ field: "tolerancePct", step: 3, message: "Tolerance must be between 0 and 100%.", severity: "error" });
  }
  const diff = valueDiscrepancy(trade.quantity, trade.pricePerUom, trade.totalValue);
  if (diff !== null) {
    issues.push({
      field: "totalValue",
      step: 2,
      message: trade.valueOverridden
        ? "Total value is an authorised override and differs from quantity × price."
        : "Stored total differs from quantity × price.",
      severity: "warning",
    });
  }
  if (isBlank(trade.contractTemplateId)) {
    issues.push({ field: "contractTemplateId", step: 4, message: "No contract template selected — the default will be used.", severity: "warning" });
  }
  return issues;
}

export function blockingIssues(trade: TradeForValidation) {
  return validateTrade(trade).filter((i) => i.severity === "error");
}

/** Server-side value rule: computed unless an authorised override/historical value is in place. */
export function resolveTotalValue(trade: TradeForValidation): number | undefined {
  if (trade.valueOverridden || trade.priceNeedsValidation) return trade.totalValue;
  return computeTradeValue(trade.quantity, trade.pricePerUom);
}
