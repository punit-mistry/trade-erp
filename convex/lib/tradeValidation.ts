/**
 * Trade completeness rules. Pure — the wizard uses it to show errors/warnings
 * per step, and the server enforces it on submit/confirm. Drafts may be
 * incomplete; nothing incomplete can be submitted or confirmed.
 */
import { formatNumber } from "./format";
import { computeTradeValue, valueDiscrepancy } from "./money";
import { packingBreakdown, quantityInMt } from "./shipment";
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
  // Shipment instructions — warnings only, so drafts and older trades are never blocked.
  if (trade.salesBasis === "lc" && isBlank(trade.lcNumber)) {
    issues.push({
      field: "lcNumber",
      step: 3,
      message: "LC sale without an LC number — the B/L and documents must follow the LC wording.",
      severity: "warning",
    });
  }
  if (trade.salesBasis !== undefined && trade.direction === "purchase") {
    issues.push({ field: "salesBasis", step: 3, message: "Sales basis (LC / Non-LC) applies to sales trades only.", severity: "warning" });
  }
  if (
    !isBlank(trade.placeOfDelivery) &&
    !isBlank(trade.dischargeLocation) &&
    trade.placeOfDelivery!.trim().toLowerCase() === trade.dischargeLocation!.trim().toLowerCase()
  ) {
    issues.push({
      field: "placeOfDelivery",
      step: 3,
      message: "Place of delivery is the same as the discharge location — leave it blank unless the buyer asked for a different place.",
      severity: "warning",
    });
  }
  const packing = packingBreakdown(trade);
  const contractMt = quantityInMt(trade.quantity, trade.uom);
  if (packing.netMt !== undefined && contractMt !== undefined && Math.abs(packing.netMt - contractMt) > 0.0005) {
    const allowed = trade.tolerancePct !== undefined ? (contractMt * trade.tolerancePct) / 100 : 0;
    const within = Math.abs(packing.netMt - contractMt) <= allowed + 0.0005;
    issues.push({
      field: "packagesPerContainer",
      step: 3,
      message: `Containers × packages × kg give ${formatNumber(packing.netMt, 3)} MT net, but the trade quantity is ${formatNumber(contractMt, 3)} MT${
        within ? " (within the agreed tolerance)" : ""
      }.`,
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
