import type { BlRecord } from "@/convex/blDocuments";
import type { LookupKind } from "@/convex/lib/validators";

export type BlFieldKey =
  | "externalBlNumber"
  | "issueDate"
  | "issuePlace"
  | "shipper"
  | "consignee"
  | "notifyParty"
  | "notifyInstructions"
  | "buyerDetails"
  | "sellerDetails"
  | "vessel"
  | "voyage"
  | "portOfLoading"
  | "portOfDischarge"
  | "placeOfReceipt"
  | "placeOfDelivery"
  | "shipmentPeriod"
  | "goodsDescription"
  | "commodity"
  | "grade"
  | "quantity"
  | "uom"
  | "packages"
  | "packingDescription"
  | "marksAndNumbers"
  | "grossWeight"
  | "netWeight"
  | "weightUnit"
  | "containerNumbers"
  | "sealNumbers"
  | "freightTerms"
  | "originalsCount"
  | "specialClauses"
  | "instructions";

export type BlFieldDef = {
  key: BlFieldKey;
  label: string;
  kind: "text" | "textarea" | "number" | "date" | "tags" | "lookup";
  lookup?: LookupKind;
  help?: string;
  wide?: boolean;
  /** Required before the B/L can be marked Prepared (mirrors the server rule). */
  required?: boolean;
  /** Never printed on the draft B/L (internal-only). */
  internal?: boolean;
};

export type BlSection = { title: string; description?: string; fields: BlFieldDef[] };

export const BL_SECTIONS: BlSection[] = [
  {
    title: "Identification",
    description: "The carrier's B/L number and issue details are filled in once the carrier issues the B/L.",
    fields: [
      { key: "externalBlNumber", label: "Carrier B/L number", kind: "text", help: "Leave blank until the carrier issues the B/L." },
      { key: "issueDate", label: "Issue date", kind: "date" },
      { key: "issuePlace", label: "Place of issue", kind: "text" },
    ],
  },
  {
    title: "Parties",
    fields: [
      { key: "shipper", label: "Shipper", kind: "textarea", required: true, help: "Name and address as it should appear on the B/L." },
      { key: "consignee", label: "Consignee", kind: "textarea", required: true, help: "Use “TO ORDER” or “TO ORDER OF <bank>” for negotiable B/Ls." },
      { key: "notifyParty", label: "Notify party", kind: "textarea" },
      { key: "notifyInstructions", label: "Notify party instructions", kind: "textarea" },
      { key: "sellerDetails", label: "Seller details", kind: "textarea", internal: true },
      { key: "buyerDetails", label: "Buyer details", kind: "textarea", internal: true },
    ],
  },
  {
    title: "Shipment",
    fields: [
      { key: "vessel", label: "Vessel", kind: "text" },
      { key: "voyage", label: "Voyage no.", kind: "text" },
      { key: "portOfLoading", label: "Port of loading", kind: "lookup", lookup: "port", required: true },
      { key: "portOfDischarge", label: "Port of discharge", kind: "lookup", lookup: "port", required: true },
      { key: "placeOfReceipt", label: "Place of receipt", kind: "text" },
      { key: "placeOfDelivery", label: "Final destination / place of delivery", kind: "text" },
      { key: "shipmentPeriod", label: "Shipment period", kind: "text" },
    ],
  },
  {
    title: "Cargo",
    fields: [
      { key: "goodsDescription", label: "Description of goods", kind: "textarea", required: true, wide: true },
      { key: "commodity", label: "Commodity", kind: "text" },
      { key: "grade", label: "Grade", kind: "text" },
      { key: "quantity", label: "Quantity", kind: "number", required: true },
      { key: "uom", label: "Unit", kind: "lookup", lookup: "uom" },
      { key: "packages", label: "No. of packages / bales", kind: "text", help: "e.g. 5,714 bales" },
      { key: "packingDescription", label: "Packing", kind: "textarea" },
      { key: "marksAndNumbers", label: "Marks & numbers", kind: "textarea" },
      { key: "grossWeight", label: "Gross weight", kind: "number" },
      { key: "netWeight", label: "Net weight", kind: "number" },
      { key: "weightUnit", label: "Weight unit", kind: "text", help: "e.g. KGS or MT" },
    ],
  },
  {
    title: "Containers & seals",
    fields: [
      { key: "containerNumbers", label: "Container numbers", kind: "tags", help: "Press Enter or comma after each number." },
      { key: "sealNumbers", label: "Seal numbers", kind: "tags" },
    ],
  },
  {
    title: "Freight & originals",
    fields: [
      { key: "freightTerms", label: "Freight terms", kind: "lookup", lookup: "freightTerm" },
      { key: "originalsCount", label: "Number of original B/Ls", kind: "number" },
    ],
  },
  {
    title: "Clauses & instructions",
    fields: [
      { key: "specialClauses", label: "Special clauses", kind: "textarea", wide: true },
      { key: "instructions", label: "B/L instructions to carrier / forwarder", kind: "textarea", wide: true, internal: true },
    ],
  },
];

export const ALL_BL_FIELDS = BL_SECTIONS.flatMap((s) => s.fields);

export type BlFormValues = {
  [K in BlFieldKey]?: K extends "containerNumbers" | "sealNumbers"
    ? string[]
    : K extends "quantity" | "grossWeight" | "netWeight" | "originalsCount"
      ? number
      : string;
} & { hiddenFields: string[] };

export function toFormValues(bl: BlRecord): BlFormValues {
  const out: Record<string, unknown> = { hiddenFields: bl.hiddenFields };
  for (const f of ALL_BL_FIELDS) out[f.key] = bl[f.key];
  out.containerNumbers = bl.containerNumbers;
  out.sealNumbers = bl.sealNumbers;
  return out as BlFormValues;
}

/** Field is printed on the preview/PDF unless hidden or internal-only. */
export function isPrinted(values: Pick<BlFormValues, "hiddenFields">, key: BlFieldKey) {
  const def = ALL_BL_FIELDS.find((f) => f.key === key);
  return !def?.internal && !values.hiddenFields.includes(key);
}
