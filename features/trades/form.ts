import { z } from "zod";
import type { Doc } from "@/convex/_generated/dataModel";
import { tradeFieldsV, type TradeFields } from "@/convex/lib/validators";
import { decimalsOf, PRICE_DECIMALS, QUANTITY_DECIMALS } from "@/convex/lib/money";

/** Form values are exactly the editable trade fields (all optional while drafting). */
export type TradeFormValues = TradeFields;

export const TRADE_FIELD_KEYS = Object.keys(tradeFieldsV) as (keyof TradeFields)[];

export const STEPS = [
  { id: 1, key: "basics", title: "Trade Basics", short: "Basics", hint: "Who are you trading with, and what? Choosing a counterparty fills in their saved terms." },
  { id: 2, key: "quantity", title: "Quantity & Price", short: "Quantity", hint: "How much, at what price. The total value is calculated for you." },
  { id: 3, key: "terms", title: "Terms & Logistics", short: "Terms", hint: "Delivery, payment and shipping terms. Supplier defaults are pre-filled — change only what differs." },
  { id: 4, key: "contract", title: "Contract Information", short: "Contract", hint: "References and clauses printed on the contract. Internal notes are never printed." },
  { id: 5, key: "review", title: "Review & Save", short: "Review", hint: "Check everything, fix any flagged items, then save, submit or confirm." },
] as const;

export type StepId = 1 | 2 | 3 | 4 | 5;

const optionalText = (max: number) => z.string().max(max, `Maximum ${max} characters.`).optional();
const wholeNumber = (min: number, max: number) =>
  z.number().int("Whole numbers only.").min(min, `Minimum ${min}.`).max(max, `Maximum ${max}.`);
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date.")
  .optional()
  .or(z.literal(""));

/**
 * Field-level format rules (types, ranges, precision). Completeness —
 * which fields are required to submit/confirm — lives in the shared
 * `validateTrade` so the server applies the identical rules.
 */
export const tradeFormSchema = z.object({
  direction: z.enum(["purchase", "sales"]).optional(),
  companyId: z.string().optional(),
  counterpartyId: z.string().optional(),
  commodityId: z.string().optional(),
  tradeDate: isoDate,
  sourceReference: optionalText(120),
  purchaseTradeId: z.string().optional(),
  quantity: z
    .number()
    .positive("Quantity must be greater than zero.")
    .refine((n) => decimalsOf(n) <= QUANTITY_DECIMALS, `Up to ${QUANTITY_DECIMALS} decimal places.`)
    .optional(),
  uom: optionalText(20),
  priceType: optionalText(60),
  pricePerUom: z
    .number()
    .nonnegative("Price cannot be negative.")
    .refine((n) => decimalsOf(n) <= PRICE_DECIMALS, `Up to ${PRICE_DECIMALS} decimal places.`)
    .optional(),
  currency: optionalText(3),
  incoterm: optionalText(40),
  paymentTerm: optionalText(120),
  pricingTerm: optionalText(120),
  shipmentPeriod: optionalText(120),
  loadingLocation: optionalText(160),
  dischargeLocation: optionalText(160),
  partialShipment: z.boolean().optional(),
  tolerancePct: z.number().min(0, "Minimum 0%.").max(100, "Maximum 100%.").optional(),
  toleranceOption: z.enum(["buyer", "seller", "both"]).optional(),
  origin: optionalText(120),
  manufacturer: optionalText(200),
  containerLoading: optionalText(500),
  freightTerms: optionalText(120),
  specialConditions: optionalText(5000),
  internalNotes: optionalText(5000),
  consignee: optionalText(1000),
  notifyParty: optionalText(1000),
  alsoNotifyParty: optionalText(1000),
  salesBasis: z.enum(["lc", "non_lc"]).optional(),
  lcNumber: optionalText(120),
  placeOfReceipt: optionalText(160),
  placeOfDelivery: optionalText(160),
  freightPayableAt: optionalText(160),
  freightPayableBy: optionalText(160),
  packageType: optionalText(30),
  palletType: optionalText(80),
  originalBlCount: wholeNumber(0, 10).optional(),
  containerCount: wholeNumber(1, 999).optional(),
  containerType: optionalText(20),
  packagesPerContainer: wholeNumber(1, 100000).optional(),
  packageNetKg: z
    .number()
    .positive("Must be greater than zero.")
    .refine((n) => decimalsOf(n) <= 3, "Up to 3 decimal places.")
    .optional(),
  palletsPerContainer: wholeNumber(0, 10000).optional(),
  packingKgPerContainer: z
    .number()
    .nonnegative("Cannot be negative.")
    .refine((n) => decimalsOf(n) <= 3, "Up to 3 decimal places.")
    .optional(),
  buyerReference: optionalText(120),
  buyerReferenceDate: isoDate,
  printedContractNumber: optionalText(60),
  contractTemplateId: z.string().optional(),
  packingClause: optionalText(5000),
  otherConditions: optionalText(5000),
  sellerBankDetails: optionalText(2000),
  buyerBankDetails: optionalText(2000),
  documentsClause: optionalText(5000),
  arbitrationClause: optionalText(5000),
  additionalTerms: optionalText(5000),
  inheritedFields: z.array(z.string()).optional(),
});

/** Which wizard step owns each field (used for error navigation). */
export const FIELD_STEP: Partial<Record<keyof TradeFields | "totalValue", StepId>> = {
  direction: 1,
  companyId: 1,
  counterpartyId: 1,
  commodityId: 1,
  tradeDate: 1,
  sourceReference: 1,
  purchaseTradeId: 1,
  quantity: 2,
  uom: 2,
  priceType: 2,
  pricePerUom: 2,
  currency: 2,
  totalValue: 2,
  incoterm: 3,
  paymentTerm: 3,
  pricingTerm: 3,
  shipmentPeriod: 3,
  loadingLocation: 3,
  dischargeLocation: 3,
  partialShipment: 3,
  tolerancePct: 3,
  toleranceOption: 3,
  origin: 3,
  manufacturer: 3,
  containerLoading: 3,
  freightTerms: 3,
  specialConditions: 3,
  internalNotes: 3,
  consignee: 3,
  notifyParty: 3,
  alsoNotifyParty: 3,
  salesBasis: 3,
  lcNumber: 3,
  placeOfReceipt: 3,
  placeOfDelivery: 3,
  freightPayableAt: 3,
  freightPayableBy: 3,
  packageType: 3,
  palletType: 3,
  originalBlCount: 3,
  containerCount: 3,
  containerType: 3,
  packagesPerContainer: 3,
  packageNetKg: 3,
  palletsPerContainer: 3,
  packingKgPerContainer: 3,
  buyerReference: 4,
  buyerReferenceDate: 4,
  printedContractNumber: 4,
  contractTemplateId: 4,
  packingClause: 4,
  otherConditions: 4,
  sellerBankDetails: 4,
  buyerBankDetails: 4,
  documentsClause: 4,
  arbitrationClause: 4,
  additionalTerms: 4,
};

/** Normalises form values into the mutation payload: trims strings, blanks → undefined. */
export function toTradeFields(values: TradeFormValues): TradeFields {
  const out: Record<string, unknown> = {};
  for (const key of TRADE_FIELD_KEYS) {
    let value = values[key] as unknown;
    if (typeof value === "string") {
      value = value.trim();
      if (value === "") value = undefined;
    }
    if (typeof value === "number" && !Number.isFinite(value)) value = undefined;
    if (value !== undefined) out[key] = value;
  }
  return out as TradeFields;
}

/** Extracts the editable field values from a stored trade. */
export function fromTrade(trade: Doc<"trades">): TradeFormValues {
  const out: Record<string, unknown> = {};
  for (const key of TRADE_FIELD_KEYS) out[key] = trade[key];
  return out as TradeFormValues;
}

/** Fingerprint used to detect whether anything changed since the last save. */
export function fieldsFingerprint(fields: TradeFields): string {
  return JSON.stringify(TRADE_FIELD_KEYS.map((k) => fields[k] ?? null));
}

/** True when the form holds something worth persisting as a draft. */
export function hasMeaningfulContent(fields: TradeFields): boolean {
  return Boolean(
    fields.counterpartyId ||
      fields.commodityId ||
      fields.quantity !== undefined ||
      fields.pricePerUom !== undefined ||
      fields.incoterm ||
      fields.shipmentPeriod ||
      fields.buyerReference ||
      fields.specialConditions ||
      fields.internalNotes,
  );
}
