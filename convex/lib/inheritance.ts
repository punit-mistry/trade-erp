/**
 * "Create once, reuse everywhere": which saved defaults flow into a new trade.
 * Pure — used by the Book Trade wizard when a counterparty / company /
 * template is chosen. Inherited values are suggestions copied INTO the trade;
 * later changes to the supplier never touch existing trades.
 */
import { partyText } from "./blDraft";
import { bankBlock } from "./templateEngine";
import type { Direction, TradeFields } from "./validators";

type Address = { address?: string; city?: string; state?: string; postalCode?: string; country?: string };

type CounterpartyDefaults = Address & {
  defaultCurrency?: string;
  defaultPaymentTerm?: string;
  defaultIncoterm?: string;
  defaultPricingTerm?: string;
  defaultOrigin?: string;
  defaultManufacturer?: string;
  defaultLoadingLocation?: string;
  defaultDischargeLocation?: string;
  defaultFreightTerms?: string;
  name?: string;
  bankName?: string;
  bankAddress?: string;
  beneficiaryName?: string;
  accountNumber?: string;
  swift?: string;
  bankInstructions?: string;
};

type CompanyDefaults = Address & {
  baseCurrency?: string;
  name?: string;
  bankName?: string;
  bankAddress?: string;
  beneficiaryName?: string;
  accountNumber?: string;
  swift?: string;
  bankInstructions?: string;
};

type TemplateDefaults = {
  defaultPackingClause?: string;
  defaultDocumentsClause?: string;
  defaultArbitrationClause?: string;
};

export type InheritableField = keyof TradeFields;

/** Values a counterparty suggests for a new trade. Seller bank = counterparty on purchases. */
export function defaultsFromCounterparty(cp: CounterpartyDefaults, direction: Direction | undefined): Partial<TradeFields> {
  const bank = bankBlock(cp) || undefined;
  const out: Partial<TradeFields> = {
    currency: cp.defaultCurrency,
    paymentTerm: cp.defaultPaymentTerm,
    incoterm: cp.defaultIncoterm,
    pricingTerm: cp.defaultPricingTerm,
    origin: cp.defaultOrigin,
    manufacturer: cp.defaultManufacturer,
    loadingLocation: cp.defaultLoadingLocation,
    dischargeLocation: cp.defaultDischargeLocation,
    freightTerms: cp.defaultFreightTerms,
  };
  if (direction === "purchase") out.sellerBankDetails = bank;
  if (direction === "sales") {
    out.buyerBankDetails = bank;
    // Non-LC default: the buyer is consignee and notify party (an LC may change both).
    out.consignee = partyText(cp);
    out.notifyParty = partyText(cp);
  }
  return stripUndefined(out);
}

/** Our company's bank goes on the side we play (seller on sales, buyer on purchases). */
export function defaultsFromCompany(company: CompanyDefaults, direction: Direction | undefined): Partial<TradeFields> {
  const bank = bankBlock(company) || undefined;
  const out: Partial<TradeFields> = {};
  if (direction === "sales") {
    out.sellerBankDetails = bank;
    // We are always "also notified" on our own sales B/Ls.
    out.alsoNotifyParty = partyText(company);
    // Per the SI: freight is payable by us on our sales (changeable for collect shipments).
    out.freightPayableBy = company.name;
  }
  if (direction === "purchase") out.buyerBankDetails = bank;
  return stripUndefined(out);
}

export function defaultsFromTemplate(t: TemplateDefaults): Partial<TradeFields> {
  return stripUndefined({
    packingClause: t.defaultPackingClause,
    documentsClause: t.defaultDocumentsClause,
    arbitrationClause: t.defaultArbitrationClause,
  });
}

/**
 * Merge suggested defaults into the current form values without clobbering
 * anything the user typed. A field is (re)filled only when it's empty or was
 * itself inherited earlier. Returns the patch and the new inheritedFields.
 */
export function applyDefaults(
  current: Partial<TradeFields>,
  suggested: Partial<TradeFields>,
): { patch: Partial<TradeFields>; inheritedFields: string[] } {
  const inherited = new Set(current.inheritedFields ?? []);
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(suggested)) {
    if (value === undefined || value === "") continue;
    const cur = (current as Record<string, unknown>)[key];
    const isEmpty = cur === undefined || cur === null || cur === "";
    if (isEmpty || inherited.has(key)) {
      patch[key] = value;
      inherited.add(key);
    }
  }
  return { patch: patch as Partial<TradeFields>, inheritedFields: [...inherited] };
}

/** Call when the user edits a field by hand: it is no longer "inherited". */
export function markOverridden(inheritedFields: string[] | undefined, field: string): string[] {
  return (inheritedFields ?? []).filter((f) => f !== field);
}

function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== "")) as T;
}
