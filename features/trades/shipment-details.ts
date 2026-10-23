import { containersText, packingBreakdown, SALES_BASIS_LABEL } from "@/convex/lib/shipment";
import type { TradeFields } from "@/convex/lib/validators";
import type { DetailItem } from "@/components/shared/section";
import { formatNumber } from "@/lib/format";

const kg = (v: number | undefined) => (v === undefined ? undefined : `${formatNumber(v, 3)} kg`);

/** Read-only rows for the shipment instructions (trade detail Terms tab and wizard review). */
export function shipmentDetailItems(t: Partial<TradeFields>): DetailItem[] {
  const p = packingBreakdown(t);
  return [
    ...(t.direction === "sales"
      ? [
          { label: "Sales basis", value: t.salesBasis ? SALES_BASIS_LABEL[t.salesBasis] : undefined },
          { label: "LC number", value: t.lcNumber },
        ]
      : []),
    { label: "Consignee", value: t.consignee },
    { label: "Notify party", value: t.notifyParty },
    { label: "Also notify", value: t.alsoNotifyParty },
    { label: "Place of receipt", value: t.placeOfReceipt },
    { label: "Place of delivery", value: t.placeOfDelivery ?? (t.dischargeLocation ? `Same as ${t.dischargeLocation}` : undefined) },
    { label: "Freight payable by", value: t.freightPayableBy },
    { label: "Freight payable at", value: t.freightPayableAt },
    { label: "Original B/Ls", value: t.originalBlCount === undefined ? undefined : String(t.originalBlCount) },
    { label: "Containers", value: containersText(t) || undefined },
    {
      label: "Packages",
      value:
        t.packagesPerContainer === undefined
          ? undefined
          : `${formatNumber(t.packagesPerContainer)}${t.packageType ? ` ${t.packageType.toUpperCase()}` : ""} per container${p.totalPackages !== undefined ? ` · ${formatNumber(p.totalPackages)} total` : ""}${
              t.packageNetKg !== undefined ? ` · ${formatNumber(t.packageNetKg, 3)} kg each` : ""
            }`,
    },
    {
      label: "Pallets",
      value:
        t.palletsPerContainer === undefined
          ? undefined
          : `${formatNumber(t.palletsPerContainer)} per container${p.totalPallets !== undefined ? ` · ${formatNumber(p.totalPallets)} total` : ""}${t.palletType ? ` · ${t.palletType}` : ""}`,
    },
    { label: "Net weight", value: p.totalNetKg !== undefined ? `${kg(p.totalNetKg)} (${formatNumber(p.netMt, 3)} MT)` : kg(p.netKgPerContainer) },
    { label: "Gross weight", value: kg(p.totalGrossKg ?? p.grossKgPerContainer) },
  ];
}
