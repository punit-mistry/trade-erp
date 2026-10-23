/**
 * Shipment instructions agreed in the contracts (the "Stage A" baseline of
 * the shipment-document checks): B/L parties, LC basis, places, containers
 * and packing. Pure — shared by the wizard, validation, contract variables
 * and the B/L.
 *
 * Packing arithmetic follows the SI/B/L rules: net kg = packages × kg per
 * package, gross kg = net + packing weight per container, quantity (MT) =
 * net kg / 1000.
 */
import { roundTo } from "./money";

export type SalesBasis = "lc" | "non_lc";

export const SALES_BASIS_LABEL: Record<SalesBasis, string> = {
  lc: "Letter of credit (LC)",
  non_lc: "Non-LC",
};

/** Common ISO container sizes/types for the picker (free text is still allowed). */
export const CONTAINER_TYPES = ["20' ST", "40' ST", "40' HC", "20' RF", "40' RF", "20' OT", "40' OT"] as const;

/** Package wording used on the B/L body (free text is still allowed). */
export const PACKAGE_TYPES = ["BALES", "BAGS", "CARTONS", "DRUMS", "PIECES", "BUNDLES", "PALLETS"] as const;

/** Pallet descriptions (the SI and Draft B/L must match exactly, e.g. plastic vs wooden). */
export const PALLET_TYPES = ["SHRINK WRAPPED PLASTIC PALLET BASE", "SHRINK WRAPPED WOODEN PALLET", "PLASTIC PALLET", "WOODEN PALLET"] as const;

/** "2,880 BALES" — falls back to PACKAGES when no type is set. */
export function packagesLabel(total: number, packageType: string | undefined, format: (n: number) => string): string {
  return `${format(total)} ${packageType?.trim().toUpperCase() || "PACKAGES"}`;
}

export type PackingInput = {
  containerCount?: number;
  containerType?: string;
  packagesPerContainer?: number;
  packageNetKg?: number;
  palletsPerContainer?: number;
  packingKgPerContainer?: number;
};

export type PackingBreakdown = {
  totalPackages?: number;
  totalPallets?: number;
  netKgPerContainer?: number;
  grossKgPerContainer?: number;
  totalNetKg?: number;
  totalGrossKg?: number;
  /** Net weight in metric tons — compare with the trade quantity. */
  netMt?: number;
};

const n = (v: number | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

/** Totals derived from the per-container inputs; a value is only given when its inputs are present. */
export function packingBreakdown(p: PackingInput): PackingBreakdown {
  const count = n(p.containerCount);
  const pkgs = n(p.packagesPerContainer);
  const kg = n(p.packageNetKg);
  const pallets = n(p.palletsPerContainer);
  const tare = n(p.packingKgPerContainer);
  const out: PackingBreakdown = {};
  if (count !== undefined && pkgs !== undefined) out.totalPackages = count * pkgs;
  if (count !== undefined && pallets !== undefined) out.totalPallets = count * pallets;
  if (pkgs !== undefined && kg !== undefined) {
    out.netKgPerContainer = roundTo(pkgs * kg, 3);
    if (tare !== undefined) out.grossKgPerContainer = roundTo(out.netKgPerContainer + tare, 3);
    if (count !== undefined) {
      out.totalNetKg = roundTo(out.netKgPerContainer * count, 3);
      out.netMt = roundTo(out.totalNetKg / 1000, 3);
      if (out.grossKgPerContainer !== undefined) out.totalGrossKg = roundTo(out.grossKgPerContainer * count, 3);
    }
  }
  return out;
}

/** "5 x 20' ST" — empty when the count is unknown. */
export function containersText(p: Pick<PackingInput, "containerCount" | "containerType">): string {
  if (p.containerCount === undefined) return "";
  return `${p.containerCount} x ${p.containerType?.trim() || "container"}`;
}

/**
 * Quantity in MT implied by the trade quantity, for comparing with the packing
 * breakdown. Only MT and KG can be compared; other units return undefined.
 */
export function quantityInMt(quantity: number | undefined, uom: string | undefined): number | undefined {
  if (quantity === undefined || !uom) return undefined;
  const u = uom.trim().toUpperCase();
  if (u === "MT") return quantity;
  if (u === "KG") return quantity / 1000;
  return undefined;
}
