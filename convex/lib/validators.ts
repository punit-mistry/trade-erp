import { v, type Infer } from "convex/values";

/**
 * Shared Convex validators. Status enums are deliberately separate per entity
 * (trade / contract / B/L / dispatch) — they describe different lifecycles.
 */

export const roleV = v.union(v.literal("admin"), v.literal("manager"), v.literal("staff"));
export type Role = Infer<typeof roleV>;

export const userStatusV = v.union(v.literal("active"), v.literal("pending"), v.literal("disabled"));
export type UserStatus = Infer<typeof userStatusV>;

export const counterpartyTypeV = v.union(v.literal("domestic"), v.literal("international"));
export const counterpartyRoleV = v.union(v.literal("supplier"), v.literal("buyer"), v.literal("seller"));
export const activeStatusV = v.union(v.literal("active"), v.literal("inactive"));

export const directionV = v.union(v.literal("purchase"), v.literal("sales"));
export type Direction = Infer<typeof directionV>;

export const tradeStatusV = v.union(
  v.literal("draft"),
  v.literal("pending_review"),
  v.literal("confirmed"),
  v.literal("cancelled"),
  v.literal("closed"),
);
export type TradeStatus = Infer<typeof tradeStatusV>;

export const toleranceOptionV = v.union(v.literal("buyer"), v.literal("seller"), v.literal("both"));

export const contractStatusV = v.union(
  v.literal("draft"),
  v.literal("generated"),
  v.literal("sent"),
  v.literal("pending_signature"),
  v.literal("rate_fixed"),
  v.literal("closed"),
  v.literal("cancelled"),
  v.literal("superseded"),
);
export type ContractStatus = Infer<typeof contractStatusV>;

export const signatureStatusV = v.union(
  v.literal("none"),
  v.literal("awaiting"),
  // Only set when a signed copy has been uploaded as a document. There is no
  // e-signature integration; we never claim a verified digital signature.
  v.literal("signed_copy_uploaded"),
);

export const templateStatusV = v.union(v.literal("draft"), v.literal("active"), v.literal("inactive"));
export const templateDirectionV = v.union(v.literal("purchase"), v.literal("sales"), v.literal("any"));

export const blStatusV = v.union(
  v.literal("draft"),
  v.literal("prepared"),
  v.literal("under_review"),
  v.literal("verified"),
  // "issued" = a carrier-issued B/L has been received and recorded (external
  // B/L number + uploaded carrier document). Generating our own draft PDF
  // never makes a B/L issued.
  v.literal("issued"),
  v.literal("superseded"),
);
export type BlStatus = Infer<typeof blStatusV>;

export const dispatchItemStatusV = v.union(
  v.literal("pending"),
  v.literal("in_progress"),
  v.literal("complete"),
  v.literal("blocked"),
);
export type DispatchItemStatus = Infer<typeof dispatchItemStatusV>;

export const dispatchStatusV = v.union(v.literal("open"), v.literal("completed"));

export const documentTypeV = v.union(
  v.literal("contract"),
  v.literal("signed_contract"),
  v.literal("commercial_invoice"),
  v.literal("packing_list"),
  v.literal("bl_draft"),
  v.literal("bl_issued"),
  v.literal("purchase_order"),
  v.literal("shipping_instructions"),
  v.literal("certificate"),
  v.literal("bank_document"),
  v.literal("customs"),
  v.literal("other"),
);
export type DocumentType = Infer<typeof documentTypeV>;

export const reviewStatusV = v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected"));

export const fxReviewStatusV = v.union(v.literal("pending"), v.literal("verified"), v.literal("rejected"));

export const lookupKindV = v.union(
  v.literal("currency"),
  v.literal("incoterm"),
  v.literal("paymentTerm"),
  v.literal("pricingTerm"),
  v.literal("priceType"),
  v.literal("uom"),
  v.literal("port"),
  v.literal("freightTerm"),
  v.literal("packing"),
);
export type LookupKind = Infer<typeof lookupKindV>;

export const entityTypeV = v.union(
  v.literal("user"),
  v.literal("company"),
  v.literal("counterparty"),
  v.literal("commodity"),
  v.literal("trade"),
  v.literal("tradeTemplate"),
  v.literal("contract"),
  v.literal("contractTemplate"),
  v.literal("bl"),
  v.literal("dispatch"),
  v.literal("document"),
  v.literal("fxRate"),
  v.literal("lookup"),
  v.literal("settings"),
);
export type EntityType = Infer<typeof entityTypeV>;

/**
 * Editable trade fields. Everything is optional because drafts are autosaved
 * while incomplete; completeness is enforced server-side on submit/confirm
 * (see convex/lib/tradeValidation.ts). Shared by `trades`, `tradeTemplates`
 * and the trade mutations' args.
 */
export const tradeFieldsV = {
  // Step 1 — basics
  direction: v.optional(directionV),
  companyId: v.optional(v.id("companies")),
  counterpartyId: v.optional(v.id("counterparties")),
  commodityId: v.optional(v.id("commodities")),
  tradeDate: v.optional(v.string()), // ISO date YYYY-MM-DD
  sourceReference: v.optional(v.string()), // enquiry / PO / external ref
  // Step 2 — quantity & price
  quantity: v.optional(v.number()),
  uom: v.optional(v.string()),
  priceType: v.optional(v.string()),
  pricePerUom: v.optional(v.number()),
  currency: v.optional(v.string()),
  // Step 3 — terms & logistics
  incoterm: v.optional(v.string()),
  paymentTerm: v.optional(v.string()),
  pricingTerm: v.optional(v.string()),
  shipmentPeriod: v.optional(v.string()),
  loadingLocation: v.optional(v.string()),
  dischargeLocation: v.optional(v.string()),
  partialShipment: v.optional(v.boolean()),
  tolerancePct: v.optional(v.number()),
  toleranceOption: v.optional(toleranceOptionV),
  origin: v.optional(v.string()),
  manufacturer: v.optional(v.string()),
  containerLoading: v.optional(v.string()),
  freightTerms: v.optional(v.string()),
  specialConditions: v.optional(v.string()),
  internalNotes: v.optional(v.string()), // NEVER rendered in external documents
  // Step 4 — contract information
  buyerReference: v.optional(v.string()),
  buyerReferenceDate: v.optional(v.string()),
  printedContractNumber: v.optional(v.string()),
  contractTemplateId: v.optional(v.id("contractTemplates")),
  packingClause: v.optional(v.string()),
  otherConditions: v.optional(v.string()),
  sellerBankDetails: v.optional(v.string()),
  buyerBankDetails: v.optional(v.string()),
  documentsClause: v.optional(v.string()),
  arbitrationClause: v.optional(v.string()),
  additionalTerms: v.optional(v.string()),
  // Fields whose current value was inherited from counterparty defaults and
  // not edited by the user (UI shows an "inherited" marker).
  inheritedFields: v.optional(v.array(v.string())),
};

export const tradeFieldsObjectV = v.object(tradeFieldsV);
export type TradeFields = Infer<typeof tradeFieldsObjectV>;

export const fieldChangeV = v.object({
  field: v.string(),
  from: v.optional(v.string()),
  to: v.optional(v.string()),
});
