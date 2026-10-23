/**
 * Builds the first draft of a B/L (the Shipping Instruction / B/L specimen)
 * from a trade. Pure so the box-by-box rules can be unit-tested:
 *
 *  Box 1  Shipper        — sales with a linked purchase: the local shipper
 *                          (purchase manufacturer, else supplier) "ON BEHALF OF"
 *                          our company; otherwise the seller.
 *  Box 2  Consignee      — trade consignee, else the buyer.
 *  Box 3  Notify party   — trade notify party, else the buyer.
 *  Box 4  Also notify    — trade value only.
 *  Box 5  Place of receipt, 6 POL, 7 POD — from the trade.
 *  Box 8  Place of delivery — only when it differs from POD (blank otherwise).
 *  Box 10 Body           — "<containers> SAID TO CONTAIN <n> PACKAGES OF …",
 *                          pallets, HS code, origin, PO / LC no., contract no.
 *  Box 11 Weights        — from the packing breakdown (kg).
 *  Box 12 Freight        — terms + payable by / at; originals count.
 * Container/seal numbers, vessel and DEC no. are only known after loading.
 */
import { formatNumber } from "./format";
import { containersText, packagesLabel, packingBreakdown, type PackingInput } from "./shipment";
import { partyAddress } from "./templateEngine";

type Party = { name?: string; address?: string; city?: string; state?: string; postalCode?: string; country?: string };

export type BlDraftInput = {
  trade: PackingInput & {
    direction?: "purchase" | "sales";
    consignee?: string;
    notifyParty?: string;
    alsoNotifyParty?: string;
    salesBasis?: "lc" | "non_lc";
    lcNumber?: string;
    buyerReference?: string;
    placeOfReceipt?: string;
    placeOfDelivery?: string;
    loadingLocation?: string;
    dischargeLocation?: string;
    shipmentPeriod?: string;
    freightTerms?: string;
    freightPayableAt?: string;
    freightPayableBy?: string;
    originalBlCount?: number;
    packageType?: string;
    palletType?: string;
    origin?: string;
    quantity?: number;
    uom?: string;
    packingClause?: string;
    commodityName?: string;
  };
  company: Party | null;
  counterparty: Party | null;
  commodity: { name?: string; grade?: string; hsCode?: string } | null;
  /** The back-to-back purchase (sales trades only). */
  purchase: { supplier: Party | null; manufacturer?: string } | null;
  /** Our contract number for this trade (the SI no.). */
  contractNumber?: string;
};

export type BlDraft = {
  shipper?: string;
  consignee?: string;
  notifyParty?: string;
  alsoNotifyParty?: string;
  buyerDetails?: string;
  sellerDetails?: string;
  portOfLoading?: string;
  portOfDischarge?: string;
  placeOfReceipt?: string;
  placeOfDelivery?: string;
  shipmentPeriod?: string;
  goodsDescription?: string;
  commodity?: string;
  grade?: string;
  quantity?: number;
  uom?: string;
  packages?: string;
  packingDescription?: string;
  grossWeight?: number;
  netWeight?: number;
  weightUnit?: string;
  freightTerms?: string;
  freightPayableAt?: string;
  freightPayableBy?: string;
  originalsCount?: number;
};

export function partyText(p: Party | null | undefined): string | undefined {
  if (!p?.name) return undefined;
  const addr = partyAddress(p);
  return addr ? `${p.name}\n${addr}` : p.name;
}

const same = (a?: string, b?: string) => (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();

/** "UNION RUBBER SIKENSI ON BEHALF OF SAI COMMODITIES LTD" + our address. */
export function onBehalfShipper(localShipper: string, company: Party | null): string {
  if (!company?.name) return localShipper;
  const addr = partyAddress(company);
  return `${localShipper} ON BEHALF OF ${company.name}${addr ? `\n${addr}` : ""}`;
}

export function buildBlDraft(input: BlDraftInput): BlDraft {
  const { trade, company, counterparty, commodity, purchase } = input;
  const isSales = trade.direction === "sales";
  const ours = partyText(company);
  const theirs = partyText(counterparty);
  const buyer = isSales ? theirs : ours;
  const seller = isSales ? ours : theirs;

  const localShipper = purchase ? purchase.manufacturer?.trim() || purchase.supplier?.name : undefined;
  const shipper = isSales && localShipper ? onBehalfShipper(localShipper, company) : seller;

  const packing = packingBreakdown(trade);
  const commodityName = commodity?.name ?? trade.commodityName;
  const containers = containersText(trade);
  const reference = trade.salesBasis === "lc" && trade.lcNumber ? `LC NO.: ${trade.lcNumber}` : trade.buyerReference ? `PO NO.: ${trade.buyerReference}` : undefined;
  const goods = [
    containers && packing.totalPackages !== undefined && commodityName
      ? `${containers} SAID TO CONTAIN ${packagesLabel(packing.totalPackages, trade.packageType, formatNumber)} OF ${commodityName}`
      : commodityName,
    commodity?.grade ? `Grade: ${commodity.grade}` : undefined,
    packing.totalPallets !== undefined
      ? `IN ${formatNumber(packing.totalPallets)} ${trade.palletType?.trim().toUpperCase() || "PALLETS"}`
      : trade.palletType
        ? `ON ${trade.palletType.trim().toUpperCase()}`
        : undefined,
    commodity?.hsCode ? `HS Code: ${commodity.hsCode}` : undefined,
    trade.origin ? `Origin: ${trade.origin}` : undefined,
    reference,
    input.contractNumber ? `CONTRACT NO.: ${input.contractNumber}` : undefined,
  ]
    .filter(Boolean)
    .join("\n");

  const placeOfDelivery = trade.placeOfDelivery && !same(trade.placeOfDelivery, trade.dischargeLocation) ? trade.placeOfDelivery : undefined;

  return {
    shipper,
    consignee: trade.consignee ?? buyer,
    notifyParty: trade.notifyParty ?? buyer,
    alsoNotifyParty: trade.alsoNotifyParty,
    buyerDetails: buyer,
    sellerDetails: seller,
    portOfLoading: trade.loadingLocation,
    portOfDischarge: trade.dischargeLocation,
    placeOfReceipt: trade.placeOfReceipt,
    placeOfDelivery,
    shipmentPeriod: trade.shipmentPeriod,
    goodsDescription: goods || undefined,
    commodity: commodityName,
    grade: commodity?.grade,
    quantity: trade.quantity,
    uom: trade.uom,
    packages: packing.totalPackages !== undefined ? packagesLabel(packing.totalPackages, trade.packageType, formatNumber) : undefined,
    packingDescription: trade.packingClause,
    netWeight: packing.totalNetKg,
    grossWeight: packing.totalGrossKg,
    weightUnit: packing.totalNetKg !== undefined || packing.totalGrossKg !== undefined ? "KGS" : undefined,
    freightTerms: trade.freightTerms,
    freightPayableAt: trade.freightPayableAt,
    freightPayableBy: trade.freightPayableBy,
    originalsCount: trade.originalBlCount,
  };
}
