import Papa from "papaparse";

export type CsvColumn<T> = { header: string; value: (row: T) => string | number | boolean | undefined | null };

/** Builds a CSV (RFC 4180, with BOM for Excel) and triggers a browser download. */
export function downloadCsv<T>(filename: string, rows: T[], columns: CsvColumn<T>[]) {
  const data = rows.map((r) =>
    Object.fromEntries(columns.map((c) => [c.header, c.value(r) ?? ""])),
  );
  const csv = Papa.unparse({ fields: columns.map((c) => c.header), data: data.map((d) => columns.map((c) => d[c.header])) });
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Parses a CSV file with a header row into trimmed string records. */
export function parseCsvFile(file: File): Promise<{ rows: Record<string, string>[]; headers: string[]; errors: string[] }> {
  return new Promise((resolve) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (h) => h.trim(),
      transform: (v) => (typeof v === "string" ? v.trim() : v),
      complete: (result) =>
        resolve({
          rows: result.data,
          headers: result.meta.fields ?? [],
          errors: result.errors.map((e) => `Row ${(e.row ?? 0) + 2}: ${e.message}`),
        }),
    });
  });
}
