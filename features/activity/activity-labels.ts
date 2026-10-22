import type { EntityType } from "@/convex/lib/validators";

const FIELD_LABELS: Record<string, string> = {
  tradeNumber: "Trade number",
  tradeDate: "Trade date",
  direction: "Direction",
  companyId: "Company",
  counterpartyId: "Counterparty",
  commodityId: "Commodity",
  sourceReference: "Source reference",
  quantity: "Quantity",
  uom: "Unit of measure",
  priceType: "Price type",
  pricePerUom: "Price per UOM",
  currency: "Currency",
  totalValue: "Total value",
  valueOverridden: "Value overridden",
  valueOverrideReason: "Override reason",
  incoterm: "Incoterm",
  paymentTerm: "Payment term",
  pricingTerm: "Pricing term",
  shipmentPeriod: "Shipment period",
  loadingLocation: "Loading location",
  dischargeLocation: "Discharge location",
  partialShipment: "Partial shipment",
  tolerancePct: "Tolerance %",
  toleranceOption: "Tolerance option",
  origin: "Origin",
  manufacturer: "Manufacturer",
  containerLoading: "Container loading",
  freightTerms: "Freight terms",
  specialConditions: "Special conditions",
  internalNotes: "Internal notes",
  buyerReference: "Buyer reference",
  buyerReferenceDate: "Buyer reference date",
  printedContractNumber: "Printed contract no.",
  contractTemplateId: "Contract template",
  packingClause: "Packing clause",
  otherConditions: "Other conditions",
  sellerBankDetails: "Seller bank details",
  buyerBankDetails: "Buyer bank details",
  documentsClause: "Documents clause",
  arbitrationClause: "Arbitration clause",
  additionalTerms: "Additional terms",
  status: "Status",
  role: "Role",
  grants: "Grants",
  defaultCurrency: "Default currency",
  defaultPaymentTerm: "Default payment term",
  defaultIncoterm: "Default Incoterm",
  defaultPricingTerm: "Default pricing term",
  defaultOrigin: "Default origin",
  defaultManufacturer: "Default manufacturer",
  defaultLoadingLocation: "Default loading location",
  defaultDischargeLocation: "Default discharge location",
  defaultFreightTerms: "Default freight terms",
  contactPerson: "Contact person",
  assignedTo: "Assigned to",
  dueDate: "Due date",
  externalBlNumber: "External B/L number",
  reviewStatus: "Review status",
};

/** "defaultPaymentTerm" → "Default payment term" (known labels first, then camelCase split). */
export function humanizeField(field: string): string {
  if (FIELD_LABELS[field]) return FIELD_LABELS[field];
  const spaced = field.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_.]/g, " ").toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Dot colour for a timeline action. */
export function actionTone(action: string): string {
  if (/cancel|reject|archiv|block|disabled/.test(action)) return "bg-destructive";
  if (/confirm|approv|verif|issued|complete|closed|signed/.test(action)) return "bg-success";
  if (/submit|review|pending|sent/.test(action)) return "bg-warning";
  if (/creat|clone|register|generat|upload/.test(action)) return "bg-primary";
  return "bg-muted-foreground/50";
}

export const ENTITY_TYPE_LABEL: Record<EntityType, string> = {
  user: "User",
  company: "Company",
  counterparty: "Supplier / Counterparty",
  commodity: "Commodity",
  trade: "Trade",
  tradeTemplate: "Trade Template",
  contract: "Contract",
  contractTemplate: "Contract Template",
  bl: "B/L",
  dispatch: "Dispatch",
  document: "Document",
  fxRate: "FX Rate",
  lookup: "Master Data",
  settings: "Settings",
};

/** Deep link to the affected record, where one exists. */
export function entityHref(row: { entityType: EntityType; entityId: string; tradeId?: string }): string | null {
  switch (row.entityType) {
    case "trade":
      return `/physical-trades/${row.entityId}`;
    case "counterparty":
      return `/suppliers/${row.entityId}`;
    case "contract":
      return `/contracts/${row.entityId}`;
    case "contractTemplate":
      return `/contract-templates/${row.entityId}`;
    case "document":
      return "/documents";
    case "bl":
    case "dispatch":
      return row.tradeId ? `/physical-trades/${row.tradeId}?tab=bl` : "/dispatch";
    case "user":
      return "/admin/team";
    case "company":
    case "commodity":
    case "lookup":
    case "settings":
      return "/admin/masters";
    case "fxRate":
      return row.tradeId ? `/physical-trades/${row.tradeId}` : "/dashboard";
    default:
      return row.tradeId ? `/physical-trades/${row.tradeId}` : null;
  }
}
