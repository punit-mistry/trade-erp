import type { ContractStatus } from "@/convex/lib/validators";
import { TEMPLATE_VARIABLES } from "@/convex/lib/templateEngine";

/**
 * The single shape both the HTML preview and the PDF render from. It is built
 * from a stored contract snapshot (frozen for issued versions) or from a
 * server-rendered "not saved" preview.
 */
export type ContractDocData = {
  contractNumber: string;
  version: number;
  status: ContractStatus | "preview";
  snapshot: {
    title: string;
    header?: string;
    footer?: string;
    intro?: string;
    clauses: { heading: string; body: string }[];
    variables: Record<string, string>;
  };
};

export function toDocData(c: {
  contractNumber: string;
  version: number;
  status: ContractStatus;
  snapshot: ContractDocData["snapshot"];
}): ContractDocData {
  return { contractNumber: c.contractNumber, version: c.version, status: c.status, snapshot: c.snapshot };
}

export const isDraftLike = (status: ContractDocData["status"]) => status === "draft" || status === "preview";

/** Splits text into plain parts and `[[missing: x]]` / `[[unknown: x]]` markers. */
export function splitMarkers(text: string): { text: string; marker?: "missing" | "unknown" }[] {
  const parts: { text: string; marker?: "missing" | "unknown" }[] = [];
  const re = /\[\[(missing|unknown): ([^\]]+)\]\]/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > last) parts.push({ text: text.slice(last, m.index) });
    parts.push({ text: m[2], marker: m[1] as "missing" | "unknown" });
    last = m.index! + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}

const v = (data: ContractDocData, key: string) => {
  const value = data.snapshot.variables[key];
  return value && value.trim() !== "" ? value : "—";
};

/** Header facts shown in both renderers. */
export function headerFacts(data: ContractDocData) {
  return [
    { label: "Contract No.", value: data.contractNumber },
    { label: "Date", value: v(data, "tradeDate") },
    { label: "Our Ref.", value: v(data, "tradeNumber") },
    { label: "Buyer Ref.", value: v(data, "buyerReference") },
    { label: "Version", value: `v${data.version}` },
  ];
}

export function parties(data: ContractDocData) {
  return [
    { role: "Seller", name: v(data, "sellerName"), address: v(data, "sellerAddress") },
    { role: "Buyer", name: v(data, "buyerName"), address: v(data, "buyerAddress") },
  ];
}

// --- PDF text safety --------------------------------------------------------

/**
 * PDFs use the bundled Noto Sans font (features/pdf/fonts.ts), which covers
 * Latin Extended (e.g. Turkish İ/Ş/ğ), Greek, Cyrillic and Vietnamese, so text
 * is printed exactly as stored. Only normalises to NFC so combining accents
 * render as single glyphs.
 */
export function pdfSafe(text: string): string {
  return text.normalize("NFC");
}

// --- Version diff -------------------------------------------------------------

const VARIABLE_LABELS = new Map(TEMPLATE_VARIABLES.map((t) => [t.name, t.label]));
const IGNORED_IN_DIFF = new Set(["today", "contractVersion"]);

export type SnapshotDiff = {
  variables: { name: string; label: string; from: string; to: string }[];
  clauses: { index: number; kind: "added" | "removed" | "changed"; heading: string; from?: string; to?: string }[];
  titleChanged: boolean;
};

export function diffSnapshots(prev: ContractDocData["snapshot"], next: ContractDocData["snapshot"]): SnapshotDiff {
  const keys = new Set([...Object.keys(prev.variables), ...Object.keys(next.variables)]);
  const variables = [...keys]
    .filter((k) => !IGNORED_IN_DIFF.has(k) && (prev.variables[k] ?? "") !== (next.variables[k] ?? ""))
    .map((k) => ({ name: k, label: VARIABLE_LABELS.get(k) ?? k, from: prev.variables[k] ?? "", to: next.variables[k] ?? "" }));
  const clauses: SnapshotDiff["clauses"] = [];
  const max = Math.max(prev.clauses.length, next.clauses.length);
  for (let i = 0; i < max; i++) {
    const a = prev.clauses[i];
    const b = next.clauses[i];
    if (a && !b) clauses.push({ index: i, kind: "removed", heading: a.heading, from: a.body });
    else if (!a && b) clauses.push({ index: i, kind: "added", heading: b.heading, to: b.body });
    else if (a && b && (a.heading !== b.heading || a.body !== b.body)) {
      clauses.push({
        index: i,
        kind: "changed",
        heading: a.heading === b.heading ? b.heading : `${a.heading} → ${b.heading}`,
        from: a.body,
        to: b.body,
      });
    }
  }
  return { variables, clauses, titleChanged: prev.title !== next.title };
}
