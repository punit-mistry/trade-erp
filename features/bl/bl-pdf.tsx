"use client";

/**
 * Draft B/L PDF. Loaded with `await import("./bl-pdf")` from the click
 * handler so @react-pdf/renderer never lands in the initial bundle or SSR.
 * Uses the bundled Noto Sans font (features/pdf/fonts.ts) so non-Latin-1
 * names (e.g. Turkish İ/Ş) print correctly.
 */
import { Document, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import { PDF_FONT, PDF_FONT_BOLD, PDF_FONT_ITALIC } from "@/features/pdf/fonts";
import type { BlPrintData } from "./bl-print-data";

const BORDER = "#9aa3b5";
const s = StyleSheet.create({
  page: { padding: 32, paddingBottom: 48, fontSize: 9, fontFamily: PDF_FONT, color: "#1b2236" },
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 10 },
  title: { fontSize: 14, fontFamily: PDF_FONT_BOLD },
  muted: { color: "#5b6478", fontSize: 8 },
  grid: { borderTopWidth: 1, borderLeftWidth: 1, borderColor: BORDER },
  row: { flexDirection: "row" },
  cell: { borderRightWidth: 1, borderBottomWidth: 1, borderColor: BORDER, padding: 5, minHeight: 34 },
  label: { fontSize: 6.5, fontFamily: PDF_FONT_BOLD, color: "#5b6478", textTransform: "uppercase", marginBottom: 2 },
  watermark: {
    position: "absolute",
    top: 330,
    left: 40,
    fontSize: 40,
    fontFamily: PDF_FONT_BOLD,
    color: "#d33",
    opacity: 0.1,
    transform: "rotate(-28deg)",
  },
  footer: { position: "absolute", bottom: 20, left: 32, right: 32, flexDirection: "row", justifyContent: "space-between", fontSize: 7, color: "#5b6478" },
  disclaimer: { marginTop: 8, fontSize: 7.5, color: "#5b6478", fontFamily: PDF_FONT_ITALIC },
});

function Cell({ label, value, flex = 1 }: { label: string; value: string; flex?: number }) {
  return (
    <View style={[s.cell, { flex }]}>
      <Text style={s.label}>{label}</Text>
      <Text>{value || "—"}</Text>
    </View>
  );
}

function BlPdfDocument({ data }: { data: BlPrintData }) {
  return (
    <Document title={`${data.blRecordNumber} ${data.issued ? "B/L record" : "Draft B/L"}`} creator="Tradeline ERP">
      <Page size="A4" style={s.page}>
        {data.watermark && (
          <Text style={s.watermark} fixed>
            {data.watermark}
          </Text>
        )}
        <View style={s.header}>
          <View>
            <Text style={s.title}>{data.title}</Text>
            <Text style={s.muted}>
              Internal ref. {data.blRecordNumber} · Trade {data.tradeNumber}
            </Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={{ fontFamily: PDF_FONT_BOLD }}>Carrier B/L No.</Text>
            <Text>{data.externalBlNumber || "— not yet issued —"}</Text>
          </View>
        </View>

        <View style={s.grid}>
          <View style={s.row}>
            <Cell label="Shipper" value={data.shipper} />
            <Cell label="Place and date of issue" value={data.issue} />
          </View>
          <View style={s.row}>
            <Cell label="Consignee" value={data.consignee} />
            <Cell
              label="Notify party"
              value={[data.notifyParty, data.notifyInstructions !== "—" ? data.notifyInstructions : ""].filter(Boolean).join("\n")}
            />
          </View>
          <View style={s.row}>
            <Cell label="Vessel / voyage" value={data.vessel} />
            <Cell label="Place of receipt" value={data.placeOfReceipt} />
          </View>
          <View style={s.row}>
            <Cell label="Port of loading" value={data.portOfLoading} />
            <Cell label="Port of discharge" value={data.portOfDischarge} />
          </View>
          <View style={s.row}>
            <Cell label="Place of delivery" value={data.placeOfDelivery} />
            <Cell label="Shipment period" value={data.shipmentPeriod} />
          </View>
          <View style={s.row} wrap={false}>
            <Cell label="Marks & numbers" value={data.marks} />
            <Cell label="No. of packages" value={data.packages} flex={0.8} />
            <Cell
              label="Description of goods"
              value={[data.goods, data.quantity ? `Quantity: ${data.quantity}` : ""].filter(Boolean).join("\n")}
              flex={2}
            />
            <Cell label="Gross weight" value={data.grossWeight} flex={0.9} />
            <Cell label="Net weight" value={data.netWeight} flex={0.9} />
          </View>
          <View style={s.row}>
            <Cell label="Container numbers" value={data.containers.join(", ")} />
            <Cell label="Seal numbers" value={data.seals.join(", ")} />
          </View>
          <View style={s.row}>
            <Cell label="Freight" value={data.freightTerms} />
            <Cell label="Number of original B/Ls" value={data.originals} />
          </View>
          {data.specialClauses ? (
            <View style={s.row}>
              <Cell label="Special clauses" value={data.specialClauses} />
            </View>
          ) : null}
        </View>
        <Text style={s.disclaimer}>{data.disclaimer}</Text>

        <View style={s.footer} fixed>
          <Text>
            {data.blRecordNumber} · Generated {new Date().toISOString().slice(0, 10)}
          </Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export async function generateBlPdf(data: BlPrintData): Promise<Blob> {
  return await pdf(<BlPdfDocument data={data} />).toBlob();
}
