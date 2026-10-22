/**
 * @react-pdf/renderer document. Import this module only via dynamic import
 * (see `renderContractPdfBlob`) so the PDF engine stays out of the server
 * bundle and initial page JS.
 */
import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { PDF_FONT, PDF_FONT_BOLD } from "@/features/pdf/fonts";
import { headerFacts, isDraftLike, parties, pdfSafe, splitMarkers, type ContractDocData } from "./contract-document";

const NAVY = "#1c2541";
const MUTED = "#5b6478";
const LINE = "#d5d9e2";

const s = StyleSheet.create({
  page: { paddingTop: 44, paddingBottom: 64, paddingHorizontal: 50, fontFamily: PDF_FONT, fontSize: 9.5, color: "#1f2333", lineHeight: 1.45 },
  watermark: { position: "absolute", top: 330, left: 60, fontSize: 110, color: "#eef0f4", fontFamily: PDF_FONT_BOLD, transform: "rotate(-35deg)" },
  header: { flexDirection: "row", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: NAVY, paddingBottom: 10 },
  company: { fontFamily: PDF_FONT_BOLD, fontSize: 13, color: NAVY },
  small: { fontSize: 8, color: MUTED },
  headerRight: { maxWidth: "45%", textAlign: "right", fontSize: 8, color: MUTED },
  title: { marginTop: 18, textAlign: "center", fontFamily: PDF_FONT_BOLD, fontSize: 14, letterSpacing: 1.2, color: NAVY },
  facts: { flexDirection: "row", marginTop: 14, borderWidth: 1, borderColor: LINE },
  fact: { flex: 1, paddingVertical: 5, paddingHorizontal: 6, borderRightWidth: 1, borderRightColor: LINE },
  factLast: { flex: 1, paddingVertical: 5, paddingHorizontal: 6 },
  factLabel: { fontSize: 7, color: MUTED, textTransform: "uppercase" },
  factValue: { fontFamily: PDF_FONT_BOLD, fontSize: 8.5 },
  parties: { flexDirection: "row", marginTop: 12, gap: 10 },
  party: { flex: 1, borderWidth: 1, borderColor: LINE, padding: 8 },
  partyRole: { fontSize: 7, color: MUTED, textTransform: "uppercase", letterSpacing: 0.8 },
  partyName: { fontFamily: PDF_FONT_BOLD, marginTop: 2 },
  intro: { marginTop: 12 },
  clause: { marginTop: 9 },
  clauseHeading: { fontFamily: PDF_FONT_BOLD, color: NAVY },
  clauseBody: { marginTop: 2, paddingLeft: 12 },
  marker: { backgroundColor: "#fdecc8", color: "#7a4b00" },
  signatures: { flexDirection: "row", marginTop: 34, gap: 30 },
  sigBox: { flex: 1 },
  sigLine: { marginTop: 40, borderTopWidth: 1, borderTopColor: "#8a91a3", paddingTop: 3 },
  footer: { position: "absolute", bottom: 26, left: 50, right: 50, flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, color: MUTED, borderTopWidth: 0.5, borderTopColor: LINE, paddingTop: 5 },
  footerText: { maxWidth: "75%" },
});

function Rich({ text }: { text: string }) {
  return (
    <>
      {splitMarkers(text).map((p, i) =>
        p.marker ? (
          <Text key={i} style={s.marker}>
            {pdfSafe(`[${p.marker}: ${p.text}]`)}
          </Text>
        ) : (
          <Text key={i}>{pdfSafe(p.text)}</Text>
        ),
      )}
    </>
  );
}

export function ContractPdfDocument({ data }: { data: ContractDocData }) {
  const vars = data.snapshot.variables;
  const facts = headerFacts(data);
  return (
    <Document
      title={`${data.contractNumber} v${data.version}`}
      subject={pdfSafe(data.snapshot.title)}
      creator="Tradeline ERP"
      producer="Tradeline ERP"
    >
      <Page size="A4" style={s.page}>
        {isDraftLike(data.status) && (
          <Text style={s.watermark} fixed>
            {data.status === "preview" ? "PREVIEW" : "DRAFT"}
          </Text>
        )}

        <View style={s.header}>
          <View>
            <Text style={s.company}>{pdfSafe(vars.companyName || "—")}</Text>
            {vars.companyAddress ? <Text style={s.small}>{pdfSafe(vars.companyAddress)}</Text> : null}
          </View>
          {data.snapshot.header ? (
            <Text style={s.headerRight}>
              <Rich text={data.snapshot.header} />
            </Text>
          ) : null}
        </View>

        <Text style={s.title}>
          <Rich text={data.snapshot.title.toUpperCase()} />
        </Text>

        <View style={s.facts} wrap={false}>
          {facts.map((f, i) => (
            <View key={f.label} style={i === facts.length - 1 ? s.factLast : s.fact}>
              <Text style={s.factLabel}>{f.label}</Text>
              <Text style={s.factValue}>{pdfSafe(f.value)}</Text>
            </View>
          ))}
        </View>

        <View style={s.parties} wrap={false}>
          {parties(data).map((p) => (
            <View key={p.role} style={s.party}>
              <Text style={s.partyRole}>{p.role}</Text>
              <Text style={s.partyName}>{pdfSafe(p.name)}</Text>
              <Text style={s.small}>{pdfSafe(p.address)}</Text>
            </View>
          ))}
        </View>

        {data.snapshot.intro ? (
          <Text style={s.intro}>
            <Rich text={data.snapshot.intro} />
          </Text>
        ) : null}

        {data.snapshot.clauses.map((c, i) => (
          <View key={i} style={s.clause}>
            <Text style={s.clauseHeading} minPresenceAhead={28}>
              {`${i + 1}. `}
              <Rich text={c.heading.toUpperCase()} />
            </Text>
            <Text style={s.clauseBody}>
              <Rich text={c.body} />
            </Text>
          </View>
        ))}

        <View style={s.signatures} wrap={false}>
          {parties(data).map((p) => (
            <View key={p.role} style={s.sigBox}>
              <Text style={s.small}>For and on behalf of the {p.role}</Text>
              <View style={s.sigLine}>
                <Text style={{ fontFamily: PDF_FONT_BOLD }}>{pdfSafe(p.name)}</Text>
                <Text style={s.small}>Authorised signatory, name &amp; date</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={s.footer} fixed>
          <Text style={s.footerText}>
            {data.snapshot.footer ? pdfSafe(data.snapshot.footer.replace(/\[\[(missing|unknown): ([^\]]+)\]\]/g, "[$1: $2]")) : `${data.contractNumber} · v${data.version}`}
          </Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
