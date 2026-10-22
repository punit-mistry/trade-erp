import type { LookupKind } from "./validators";

/**
 * Baseline reference values. Used as the fallback when a lookup kind has no
 * rows yet, and inserted by the idempotent `seed:ensureMasters` setup.
 */
export const DEFAULT_LOOKUPS: Record<LookupKind, { value: string; label: string; description?: string }[]> = {
  currency: [
    { value: "USD", label: "USD — US Dollar" },
    { value: "EUR", label: "EUR — Euro" },
    { value: "INR", label: "INR — Indian Rupee" },
    { value: "SGD", label: "SGD — Singapore Dollar" },
    { value: "AED", label: "AED — UAE Dirham" },
    { value: "GBP", label: "GBP — Pound Sterling" },
    { value: "MYR", label: "MYR — Malaysian Ringgit" },
  ],
  incoterm: [
    { value: "EXW", label: "EXW", description: "Ex Works — buyer collects from seller's premises." },
    { value: "FCA", label: "FCA", description: "Free Carrier — seller hands goods to buyer's carrier." },
    { value: "FOB", label: "FOB", description: "Free On Board — risk passes once loaded on the vessel." },
    { value: "CFR", label: "CFR", description: "Cost and Freight — seller pays freight to destination port." },
    { value: "C.N.F", label: "C.N.F", description: "Cost and Freight (trade usage of CFR)." },
    { value: "CIF", label: "CIF", description: "Cost, Insurance and Freight — CFR plus seller-arranged insurance." },
    { value: "CPT", label: "CPT", description: "Carriage Paid To." },
    { value: "CIP", label: "CIP", description: "Carriage and Insurance Paid To." },
    { value: "DAP", label: "DAP", description: "Delivered at Place." },
    { value: "DDP", label: "DDP", description: "Delivered Duty Paid." },
  ],
  paymentTerm: [
    { value: "50% Advance", label: "50% Advance", description: "Half paid before shipment, balance as agreed." },
    { value: "100% Advance", label: "100% Advance" },
    { value: "D/P at Sight", label: "D/P at Sight", description: "Documents released against payment on presentation." },
    { value: "D/A 30 days", label: "D/A 30 days", description: "Documents against acceptance, payment in 30 days." },
    { value: "Letter of Credit — at Sight", label: "Letter of Credit — at Sight" },
    { value: "Letter of Credit — 60 days", label: "Letter of Credit — 60 days" },
    { value: "CAD", label: "CAD — Cash Against Documents" },
    { value: "TT 30 days", label: "TT 30 days after B/L date" },
  ],
  pricingTerm: [
    { value: "Fixed price", label: "Fixed price" },
    { value: "Provisional — final on weight & quality", label: "Provisional — final on weight & quality" },
    { value: "Price to be fixed", label: "Price to be fixed (PTBF)" },
  ],
  priceType: [
    { value: "Fixed", label: "Fixed" },
    { value: "Provisional", label: "Provisional" },
    { value: "Formula", label: "Formula / index-linked" },
  ],
  uom: [
    { value: "MT", label: "MT — Metric Ton" },
    { value: "KG", label: "KG — Kilogram" },
    { value: "CBM", label: "CBM — Cubic Metre" },
    { value: "PCS", label: "PCS — Pieces" },
    { value: "BAG", label: "BAG — Bags" },
    { value: "BALE", label: "BALE — Bales" },
  ],
  port: [
    { value: "Port Klang, Malaysia", label: "Port Klang, Malaysia" },
    { value: "Singapore", label: "Singapore" },
    { value: "Jebel Ali, UAE", label: "Jebel Ali, UAE" },
    { value: "Nhava Sheva (JNPT), India", label: "Nhava Sheva (JNPT), India" },
    { value: "Chennai, India", label: "Chennai, India" },
    { value: "Mundra, India", label: "Mundra, India" },
    { value: "Tuticorin, India", label: "Tuticorin, India" },
    { value: "Ho Chi Minh City, Vietnam", label: "Ho Chi Minh City, Vietnam" },
    { value: "Haiphong, Vietnam", label: "Haiphong, Vietnam" },
    { value: "Mersin, Türkiye", label: "Mersin, Türkiye" },
    { value: "Abidjan, Côte d'Ivoire", label: "Abidjan, Côte d'Ivoire" },
    { value: "Lagos (Apapa), Nigeria", label: "Lagos (Apapa), Nigeria" },
    { value: "Belawan, Indonesia", label: "Belawan, Indonesia" },
  ],
  freightTerm: [
    { value: "Freight Prepaid", label: "Freight Prepaid" },
    { value: "Freight Collect", label: "Freight Collect" },
    { value: "Freight Payable as per Charter Party", label: "Freight Payable as per Charter Party" },
  ],
  packing: [
    { value: "In bulk", label: "In bulk" },
    { value: "In new jute bags of 80 kg", label: "In new jute bags of 80 kg" },
    { value: "In PP bags of 50 kg", label: "In PP bags of 50 kg" },
    { value: "In bales of 35 kg, palletised", label: "In bales of 35 kg, palletised" },
  ],
};
