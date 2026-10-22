import type { BlRecord } from "@/convex/blDocuments";
import { display, formatDate, formatNumber } from "@/lib/format";
import { isPrinted, toFormValues, type BlFieldKey } from "./bl-fields";

/**
 * Printable view-model shared by the HTML preview and the PDF so both show
 * exactly the same (saved) data. Hidden / internal fields render as blank.
 */
export function blPrintData(bl: BlRecord) {
  const values = toFormValues(bl);
  const show = (key: BlFieldKey) => isPrinted(values, key);
  const text = (key: BlFieldKey) => (show(key) ? display(bl[key] as string | undefined) : "");
  const num = (key: "quantity" | "grossWeight" | "netWeight" | "originalsCount", unit?: string) => {
    const n = bl[key];
    if (!show(key) || n === undefined) return "";
    return unit ? `${formatNumber(n)} ${unit}` : formatNumber(n);
  };
  const issued = bl.status === "issued";
  return {
    issued,
    title: issued ? "BILL OF LADING — CARRIER ISSUED (RECORD COPY)" : "DRAFT BILL OF LADING",
    watermark: issued ? null : "DRAFT — NOT A NEGOTIABLE B/L",
    disclaimer: issued
      ? `Carrier-issued B/L ${display(bl.externalBlNumber)} recorded on ${formatDate(bl.issuedRecordedAt)}. The carrier's original document is the governing B/L; this page is an internal record copy.`
      : "Internally generated draft for review and shipping instructions only. This is not a bill of lading issued by a carrier, is not a document of title and is not negotiable.",
    blRecordNumber: `${bl.blRecordNumber} · v${bl.version}`,
    tradeNumber: bl.tradeNumber,
    externalBlNumber: text("externalBlNumber"),
    issue: [show("issuePlace") ? bl.issuePlace : undefined, show("issueDate") && bl.issueDate ? formatDate(bl.issueDate) : undefined]
      .filter(Boolean)
      .join(", "),
    shipper: text("shipper"),
    consignee: text("consignee"),
    notifyParty: text("notifyParty"),
    notifyInstructions: text("notifyInstructions"),
    vessel: [text("vessel"), show("voyage") && bl.voyage ? `Voy. ${bl.voyage}` : ""].filter((s) => s && s !== "—").join(" / ") || "—",
    portOfLoading: text("portOfLoading"),
    portOfDischarge: text("portOfDischarge"),
    placeOfReceipt: text("placeOfReceipt"),
    placeOfDelivery: text("placeOfDelivery"),
    shipmentPeriod: text("shipmentPeriod"),
    marks: text("marksAndNumbers"),
    packages: text("packages"),
    goods: [
      show("goodsDescription") ? bl.goodsDescription : undefined,
      show("packingDescription") && bl.packingDescription ? `Packing: ${bl.packingDescription}` : undefined,
    ]
      .filter(Boolean)
      .join("\n") || "—",
    quantity: show("quantity") && bl.quantity !== undefined ? `${formatNumber(bl.quantity)} ${bl.uom ?? ""}`.trim() : "",
    grossWeight: num("grossWeight", bl.weightUnit),
    netWeight: num("netWeight", bl.weightUnit),
    containers: show("containerNumbers") ? bl.containerNumbers : [],
    seals: show("sealNumbers") ? bl.sealNumbers : [],
    freightTerms: text("freightTerms"),
    originals: num("originalsCount"),
    specialClauses: show("specialClauses") ? (bl.specialClauses ?? "") : "",
  };
}

export type BlPrintData = ReturnType<typeof blPrintData>;
