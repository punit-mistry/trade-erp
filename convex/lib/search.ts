/**
 * Builders for the denormalised `searchText` columns that back the search
 * indexes. Always rebuild via these helpers when a source field changes.
 */
const join = (parts: (string | undefined | null)[]) =>
  parts
    .filter((p): p is string => typeof p === "string" && p.trim() !== "")
    .join(" ")
    .toLowerCase();

export function counterpartySearchText(cp: {
  name: string;
  code: string;
  country?: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  city?: string;
}) {
  return join([cp.name, cp.code, cp.country, cp.contactPerson, cp.email, cp.phone, cp.city]);
}

export function commoditySearchText(c: { name: string; code: string; hsCode?: string; grade?: string }) {
  return join([c.name, c.code, c.hsCode, c.grade]);
}

export function tradeSearchText(t: {
  tradeNumber: string;
  counterpartyName?: string;
  commodityName?: string;
  commodityCode?: string;
  companyName?: string;
  buyerReference?: string;
  printedContractNumber?: string;
  sourceReference?: string;
}) {
  return join([
    t.tradeNumber,
    t.counterpartyName,
    t.commodityName,
    t.commodityCode,
    t.companyName,
    t.buyerReference,
    t.printedContractNumber,
    t.sourceReference,
  ]);
}

export function documentSearchText(d: {
  fileName: string;
  tradeNumber?: string;
  contractNumber?: string;
  counterpartyName?: string;
  notes?: string;
}) {
  return join([d.fileName, d.tradeNumber, d.contractNumber, d.counterpartyName, d.notes]);
}
