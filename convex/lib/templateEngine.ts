/**
 * Contract template variable system. Pure — used server-side to build the
 * immutable contract snapshot and client-side for live preview.
 *
 * Syntax: `{{variableName}}`. Unknown variables are reported (and rendered as
 * a visible `[[unknown: name]]` marker), never silently blanked. Known
 * variables with no value are reported as missing and rendered as
 * `[[missing: name]]` so a reviewer notices before issuing.
 */
import { amountInWords, formatDate, formatMoney, formatNumber, formatPrice, formatQuantity } from "./format";

export type TemplateVariable = { name: string; label: string; description: string; sample: string };

export const TEMPLATE_VARIABLES: TemplateVariable[] = [
  { name: "contractNumber", label: "Contract number", description: "Printed contract number (override or generated sequence).", sample: "CTR-2026-0001" },
  { name: "contractVersion", label: "Contract version", description: "Version number of this contract document.", sample: "1" },
  { name: "tradeNumber", label: "Trade number", description: "Internal trade number.", sample: "TRD-2026-0017" },
  { name: "tradeDate", label: "Trade date", description: "Trade date, formatted.", sample: "18 Sep 2026" },
  { name: "direction", label: "Direction", description: "Purchase or Sales.", sample: "Sales" },
  { name: "companyName", label: "Company name", description: "Internal company (our entity).", sample: "Acme Global Trading Pte Ltd" },
  { name: "companyAddress", label: "Company address", description: "Internal company full address.", sample: "1 Raffles Place, Singapore" },
  { name: "companyBankDetails", label: "Company bank details", description: "Internal company bank block.", sample: "Bank: DBS Bank, SWIFT: DBSSSGSG" },
  { name: "signatoryName", label: "Signatory name", description: "Internal company signatory.", sample: "A. Sharma" },
  { name: "signatoryTitle", label: "Signatory title", description: "Internal company signatory title.", sample: "Director" },
  { name: "counterpartyName", label: "Counterparty name", description: "The trade counterparty.", sample: "Syarikat Tenaga (Gemas) Sdn Bhd" },
  { name: "counterpartyAddress", label: "Counterparty address", description: "Counterparty full address.", sample: "Gemas, Negeri Sembilan, Malaysia" },
  { name: "buyerName", label: "Buyer name", description: "Buyer: counterparty on sales, our company on purchases.", sample: "Syarikat Tenaga (Gemas) Sdn Bhd" },
  { name: "buyerAddress", label: "Buyer address", description: "Buyer address.", sample: "Gemas, Malaysia" },
  { name: "sellerName", label: "Seller name", description: "Seller: our company on sales, counterparty on purchases.", sample: "Acme Global Trading Pte Ltd" },
  { name: "sellerAddress", label: "Seller address", description: "Seller address.", sample: "1 Raffles Place, Singapore" },
  { name: "buyerReference", label: "Buyer reference / PO", description: "Buyer's reference or PO number.", sample: "PO-88123" },
  { name: "buyerReferenceDate", label: "Buyer reference date", description: "Date of the buyer reference.", sample: "15 Sep 2026" },
  { name: "commodity", label: "Commodity", description: "Commodity name.", sample: "Natural Rubber Cup Lump Min 65% DRC" },
  { name: "commodityCode", label: "Commodity code", description: "Commodity code.", sample: "CUPLUMP65" },
  { name: "hsCode", label: "HS code", description: "Commodity HS code.", sample: "4001.29" },
  { name: "quantity", label: "Quantity", description: "Quantity with unit.", sample: "200 MT" },
  { name: "quantityNumber", label: "Quantity (number)", description: "Quantity without unit.", sample: "200" },
  { name: "uom", label: "Unit of measure", description: "Unit of measure.", sample: "MT" },
  { name: "tolerance", label: "Quantity tolerance", description: "e.g. ±5% at Seller's option.", sample: "+/- 5% at Seller's option" },
  { name: "priceType", label: "Price type", description: "Fixed / provisional / etc.", sample: "Fixed" },
  { name: "pricePerUom", label: "Price per UOM", description: "Unit price with currency.", sample: "USD 1,890.00" },
  { name: "totalValue", label: "Total value", description: "Total contract value with currency.", sample: "USD 378,000.00" },
  { name: "totalValueWords", label: "Total value in words", description: "Total value spelled out.", sample: "USD Three Hundred Seventy-Eight Thousand Only" },
  { name: "currency", label: "Currency", description: "ISO currency code.", sample: "USD" },
  { name: "incoterm", label: "Incoterm", description: "Delivery term.", sample: "CIF" },
  { name: "paymentTerms", label: "Payment terms", description: "Payment term.", sample: "D/P at Sight" },
  { name: "pricingTerm", label: "Pricing term", description: "Pricing basis.", sample: "Fixed price" },
  { name: "shipmentPeriod", label: "Shipment period", description: "Shipment window.", sample: "October 2026" },
  { name: "loadLocation", label: "Loading location", description: "Port / place of loading.", sample: "Port Klang, Malaysia" },
  { name: "dischargeLocation", label: "Discharge location", description: "Port / place of discharge.", sample: "Chennai, India" },
  { name: "partialShipment", label: "Partial shipment", description: "Allowed / Not allowed.", sample: "Allowed" },
  { name: "originOfGoods", label: "Origin of goods", description: "Country of origin.", sample: "Malaysia" },
  { name: "manufacturer", label: "Manufacturer", description: "Manufacturer / approved factory.", sample: "Gemas Rubber Factory" },
  { name: "containerLoading", label: "Container loading", description: "Container loading details.", sample: "20 MT per 40' container" },
  { name: "freightTerms", label: "Freight terms", description: "Freight prepaid / collect.", sample: "Freight Prepaid" },
  { name: "packingClause", label: "Packing clause", description: "Packing terms.", sample: "In bales of 35 kg, palletised" },
  { name: "documentsClause", label: "Documents clause", description: "Required shipping documents.", sample: "Full set of clean on board B/L…" },
  { name: "arbitrationClause", label: "Arbitration clause", description: "Dispute resolution wording.", sample: "Arbitration in Singapore under SIAC rules." },
  { name: "sellerBankDetails", label: "Seller bank details", description: "Seller's bank instructions.", sample: "Beneficiary: …, SWIFT: …" },
  { name: "buyerBankDetails", label: "Buyer bank details", description: "Buyer's bank instructions.", sample: "Bank: …" },
  { name: "specialConditions", label: "Special conditions", description: "Trade special conditions.", sample: "Quality certificate by SGS." },
  { name: "otherConditions", label: "Other conditions", description: "Other contract conditions.", sample: "All other terms as per GAFTA." },
  { name: "additionalTerms", label: "Additional terms", description: "Additional contract-specific terms.", sample: "—" },
  { name: "today", label: "Generation date", description: "Date the document is generated.", sample: "22 Oct 2026" },
];

export const KNOWN_VARIABLES = new Set(TEMPLATE_VARIABLES.map((v) => v.name));

/** Variables whose absence is acceptable (rendered as "—" without a missing marker). */
const OPTIONAL_VARIABLES = new Set([
  "buyerReference",
  "buyerReferenceDate",
  "hsCode",
  "manufacturer",
  "containerLoading",
  "specialConditions",
  "otherConditions",
  "additionalTerms",
  "tolerance",
  "companyBankDetails",
  "signatoryName",
  "signatoryTitle",
  "commodityCode",
]);

const VARIABLE_PATTERN = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

export function extractVariables(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(VARIABLE_PATTERN)) found.add(match[1]);
  return [...found];
}

export type RenderResult = { output: string; unknown: string[]; missing: string[] };

export function renderTemplate(text: string, variables: Record<string, string>): RenderResult {
  const unknown = new Set<string>();
  const missing = new Set<string>();
  const output = text.replace(VARIABLE_PATTERN, (_m, name: string) => {
    if (!KNOWN_VARIABLES.has(name)) {
      unknown.add(name);
      return `[[unknown: ${name}]]`;
    }
    const value = variables[name];
    if (value === undefined || value.trim() === "" || value === "—") {
      if (OPTIONAL_VARIABLES.has(name)) return "—";
      missing.add(name);
      return `[[missing: ${name}]]`;
    }
    return value;
  });
  return { output, unknown: [...unknown], missing: [...missing] };
}

export type TemplateLike = {
  title: string;
  header?: string;
  footer?: string;
  intro?: string;
  clauses: { heading: string; body: string }[];
};

export type RenderedContract = {
  title: string;
  header?: string;
  footer?: string;
  intro?: string;
  clauses: { heading: string; body: string }[];
  unknown: string[];
  missing: string[];
};

export function renderContract(template: TemplateLike, variables: Record<string, string>): RenderedContract {
  const unknown = new Set<string>();
  const missing = new Set<string>();
  const r = (text: string | undefined) => {
    if (text === undefined) return undefined;
    const res = renderTemplate(text, variables);
    res.unknown.forEach((u) => unknown.add(u));
    res.missing.forEach((m) => missing.add(m));
    return res.output;
  };
  return {
    title: r(template.title) ?? "",
    header: r(template.header),
    footer: r(template.footer),
    intro: r(template.intro),
    clauses: template.clauses.map((c) => ({ heading: r(c.heading) ?? "", body: r(c.body) ?? "" })),
    unknown: [...unknown],
    missing: [...missing],
  };
}

export function validateTemplateText(texts: string[]): string[] {
  const unknown = new Set<string>();
  for (const t of texts) for (const name of extractVariables(t)) if (!KNOWN_VARIABLES.has(name)) unknown.add(name);
  return [...unknown];
}

type PartyLike = {
  name?: string;
  address?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  bankName?: string;
  bankAddress?: string;
  beneficiaryName?: string;
  accountNumber?: string;
  swift?: string;
  bankInstructions?: string;
};

export function partyAddress(p: PartyLike | null | undefined): string {
  if (!p) return "";
  return [p.address, [p.city, p.state, p.postalCode].filter(Boolean).join(", "), p.country]
    .filter((x) => x && String(x).trim() !== "")
    .join(", ");
}

export function bankBlock(p: PartyLike | null | undefined): string {
  if (!p) return "";
  const lines = [
    p.beneficiaryName && `Beneficiary: ${p.beneficiaryName}`,
    p.bankName && `Bank: ${p.bankName}`,
    p.bankAddress && `Bank address: ${p.bankAddress}`,
    p.accountNumber && `Account / IBAN: ${p.accountNumber}`,
    p.swift && `SWIFT/BIC: ${p.swift}`,
    p.bankInstructions,
  ].filter(Boolean);
  return lines.join("\n");
}

export type ContractVariableInput = {
  contractNumber: string;
  contractVersion: number;
  trade: {
    tradeNumber: string;
    tradeDate?: string;
    direction?: "purchase" | "sales";
    buyerReference?: string;
    buyerReferenceDate?: string;
    quantity?: number;
    uom?: string;
    tolerancePct?: number;
    toleranceOption?: "buyer" | "seller" | "both";
    priceType?: string;
    pricePerUom?: number;
    currency?: string;
    totalValue?: number;
    priceNeedsValidation?: boolean;
    incoterm?: string;
    paymentTerm?: string;
    pricingTerm?: string;
    shipmentPeriod?: string;
    loadingLocation?: string;
    dischargeLocation?: string;
    partialShipment?: boolean;
    origin?: string;
    manufacturer?: string;
    containerLoading?: string;
    freightTerms?: string;
    packingClause?: string;
    documentsClause?: string;
    arbitrationClause?: string;
    sellerBankDetails?: string;
    buyerBankDetails?: string;
    specialConditions?: string;
    otherConditions?: string;
    additionalTerms?: string;
    // NOTE: internalNotes is intentionally not part of this type.
  };
  company: (PartyLike & { signatoryName?: string; signatoryTitle?: string }) | null;
  counterparty: PartyLike | null;
  commodity: { name?: string; code?: string; hsCode?: string } | null;
  dateFormat?: string;
  today?: number;
};

/** Builds the variable map from actual trade data. Internal notes are never included. */
export function buildContractVariables(input: ContractVariableInput): Record<string, string> {
  const { trade, company, counterparty, commodity } = input;
  const fmt = (d?: string) => (d ? formatDate(d, input.dateFormat) : "");
  const isSales = trade.direction === "sales";
  const buyer = isSales ? counterparty : company;
  const seller = isSales ? company : counterparty;
  const toleranceText =
    trade.tolerancePct !== undefined
      ? `+/- ${formatNumber(trade.tolerancePct, 2)}%${
          trade.toleranceOption
            ? ` at ${trade.toleranceOption === "both" ? "Buyer's or Seller's" : trade.toleranceOption === "buyer" ? "Buyer's" : "Seller's"} option`
            : ""
        }`
      : "";
  const companyAddr = partyAddress(company);
  const cpAddr = partyAddress(counterparty);
  return {
    contractNumber: input.contractNumber,
    contractVersion: String(input.contractVersion),
    tradeNumber: trade.tradeNumber,
    tradeDate: fmt(trade.tradeDate),
    direction: trade.direction === "sales" ? "Sales" : trade.direction === "purchase" ? "Purchase" : "",
    companyName: company?.name ?? "",
    companyAddress: companyAddr,
    companyBankDetails: bankBlock(company),
    signatoryName: company?.signatoryName ?? "",
    signatoryTitle: company?.signatoryTitle ?? "",
    counterpartyName: counterparty?.name ?? "",
    counterpartyAddress: cpAddr,
    buyerName: buyer?.name ?? "",
    buyerAddress: isSales ? cpAddr : companyAddr,
    sellerName: seller?.name ?? "",
    sellerAddress: isSales ? companyAddr : cpAddr,
    buyerReference: trade.buyerReference ?? "",
    buyerReferenceDate: fmt(trade.buyerReferenceDate),
    commodity: commodity?.name ?? "",
    commodityCode: commodity?.code ?? "",
    hsCode: commodity?.hsCode ?? "",
    quantity: trade.quantity !== undefined ? formatQuantity(trade.quantity, trade.uom) : "",
    quantityNumber: trade.quantity !== undefined ? formatNumber(trade.quantity) : "",
    uom: trade.uom ?? "",
    tolerance: toleranceText,
    priceType: trade.priceType ?? "",
    pricePerUom:
      trade.pricePerUom !== undefined
        ? `${formatPrice(trade.pricePerUom, trade.currency)}${trade.uom ? ` per ${trade.uom}` : ""}`
        : "",
    totalValue: trade.totalValue !== undefined ? formatMoney(trade.totalValue, trade.currency) : "",
    totalValueWords: trade.totalValue !== undefined ? amountInWords(trade.totalValue, trade.currency) : "",
    currency: trade.currency ?? "",
    incoterm: trade.incoterm ?? "",
    paymentTerms: trade.paymentTerm ?? "",
    pricingTerm: trade.pricingTerm ?? "",
    shipmentPeriod: trade.shipmentPeriod ?? "",
    loadLocation: trade.loadingLocation ?? "",
    dischargeLocation: trade.dischargeLocation ?? "",
    partialShipment: trade.partialShipment === undefined ? "" : trade.partialShipment ? "Allowed" : "Not allowed",
    originOfGoods: trade.origin ?? "",
    manufacturer: trade.manufacturer ?? "",
    containerLoading: trade.containerLoading ?? "",
    freightTerms: trade.freightTerms ?? "",
    packingClause: trade.packingClause ?? "",
    documentsClause: trade.documentsClause ?? "",
    arbitrationClause: trade.arbitrationClause ?? "",
    sellerBankDetails: trade.sellerBankDetails ?? "",
    buyerBankDetails: trade.buyerBankDetails ?? "",
    specialConditions: trade.specialConditions ?? "",
    otherConditions: trade.otherConditions ?? "",
    additionalTerms: trade.additionalTerms ?? "",
    today: formatDate(input.today ?? Date.now(), input.dateFormat),
  };
}

export const SAMPLE_VARIABLES: Record<string, string> = Object.fromEntries(
  TEMPLATE_VARIABLES.map((v) => [v.name, v.sample]),
);
