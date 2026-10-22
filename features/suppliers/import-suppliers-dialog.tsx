"use client";

import { useMutation } from "convex/react";
import { useRef, useState } from "react";
import { CheckCircle2, Download, FileUp, Loader2, Upload, XCircle } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TonePill } from "@/components/shared/status-badge";
import { parseCsvFile } from "@/lib/csv";
import { getErrorMessage } from "@/lib/errors";
import { downloadImportTemplate, REQUIRED_HEADERS, validateImportRows, type ParsedImportRow } from "./supplier-csv";

type ImportResult = { row: number; status: "created" | "skipped" | "error"; message: string };

const BATCH = 200;
const MAX_ROWS = 2000;

export function ImportSuppliersDialog() {
  const importCsv = useMutation(api.counterparties.importCsv);
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [rows, setRows] = useState<ParsedImportRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<{ result: ImportResult; name: string }[] | null>(null);

  const valid = rows.filter((r) => r.input !== null);
  const invalid = rows.filter((r) => r.input === null);

  function resetState() {
    setFileName(null);
    setParseErrors([]);
    setRows([]);
    setResults(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    resetState();
    setFileName(file.name);
    if (!/\.csv$/i.test(file.name)) {
      setParseErrors(["Choose a .csv file."]);
      return;
    }
    const parsed = await parseCsvFile(file);
    const missing = REQUIRED_HEADERS.filter((h) => !parsed.headers.includes(h));
    if (missing.length > 0) {
      setParseErrors([`Missing required column(s): ${missing.join(", ")}. Download the template for the expected format.`]);
      return;
    }
    if (parsed.rows.length > MAX_ROWS) {
      setParseErrors([`The file has ${parsed.rows.length} rows; import at most ${MAX_ROWS} at a time.`]);
      return;
    }
    setParseErrors(parsed.errors);
    setRows(validateImportRows(parsed.rows));
  }

  async function runImport() {
    if (importing || valid.length === 0) return;
    setImporting(true);
    const collected: { result: ImportResult; name: string }[] = [];
    try {
      for (let i = 0; i < valid.length; i += BATCH) {
        const batch = valid.slice(i, i + BATCH);
        const res = await importCsv({ rows: batch.map((r) => r.input!), skipDuplicates: true });
        res.forEach((r) => {
          const src = batch[r.row - 1];
          collected.push({ result: { ...r, row: src.line }, name: src.name });
        });
      }
      setResults(collected);
      const created = collected.filter((c) => c.result.status === "created").length;
      toast.success(`Imported ${created} supplier${created === 1 ? "" : "s"}`);
    } catch (e) {
      toast.error(getErrorMessage(e));
      if (collected.length) setResults(collected);
    } finally {
      setImporting(false);
    }
  }

  const counts = results && {
    created: results.filter((r) => r.result.status === "created").length,
    skipped: results.filter((r) => r.result.status === "skipped").length,
    error: results.filter((r) => r.result.status === "error").length,
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (importing) return;
        setOpen(o);
        if (!o) resetState();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Upload /> Import CSV
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import suppliers from CSV</DialogTitle>
          <DialogDescription>
            Required columns: Name, Type (Domestic / International). Roles are separated by “;”. Rows that match an
            existing supplier’s name, tax ID or registration number are skipped.
          </DialogDescription>
        </DialogHeader>

        {!results && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                id="supplier-csv"
                onChange={(e) => void onFile(e.target.files?.[0])}
              />
              <Button asChild variant="outline" size="sm">
                <label htmlFor="supplier-csv" className="cursor-pointer">
                  <FileUp /> {fileName ? "Choose another file" : "Choose CSV file"}
                </label>
              </Button>
              <Button variant="ghost" size="sm" type="button" onClick={downloadImportTemplate}>
                <Download /> Download template
              </Button>
              {fileName && <span className="truncate text-xs text-muted-foreground">{fileName}</span>}
            </div>

            {parseErrors.length > 0 && (
              <ul className="space-y-0.5 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {parseErrors.slice(0, 8).map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            )}

            {rows.length > 0 && (
              <>
                <div className="flex gap-2 text-xs">
                  <TonePill tone="success">{valid.length} ready</TonePill>
                  {invalid.length > 0 && <TonePill tone="danger">{invalid.length} with errors (will be skipped)</TonePill>}
                </div>
                <div className="max-h-72 overflow-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-14">Line</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Result</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.slice(0, 200).map((r) => (
                        <TableRow key={r.line}>
                          <TableCell className="tabular text-muted-foreground">{r.line}</TableCell>
                          <TableCell className="max-w-56 truncate">{r.name}</TableCell>
                          <TableCell className="text-xs">
                            {r.input ? (
                              <span className="text-success">Valid</span>
                            ) : (
                              <span className="text-destructive">{r.errors.join("; ")}</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {rows.length > 200 && <p className="text-xs text-muted-foreground">Showing the first 200 of {rows.length} rows.</p>}
              </>
            )}
          </div>
        )}

        {results && counts && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2 text-xs">
              <TonePill tone="success">{counts.created} created</TonePill>
              <TonePill tone="warning">{counts.skipped} skipped</TonePill>
              {counts.error > 0 && <TonePill tone="danger">{counts.error} failed</TonePill>}
              {invalid.length > 0 && <TonePill tone="muted">{invalid.length} invalid rows not sent</TonePill>}
            </div>
            <div className="max-h-72 overflow-auto rounded-md border">
              <Table>
                <TableBody>
                  {results.map(({ result, name }) => (
                    <TableRow key={result.row}>
                      <TableCell className="w-14 tabular text-muted-foreground">{result.row}</TableCell>
                      <TableCell className="max-w-56 truncate">{name}</TableCell>
                      <TableCell className="text-xs">
                        <span className="inline-flex items-center gap-1">
                          {result.status === "created" ? (
                            <CheckCircle2 className="size-3.5 text-success" />
                          ) : (
                            <XCircle className={result.status === "error" ? "size-3.5 text-destructive" : "size-3.5 text-warning"} />
                          )}
                          {result.status === "created" ? `Created ${result.message}` : result.message}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        <DialogFooter>
          {results ? (
            <Button onClick={() => setOpen(false)}>Done</Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setOpen(false)} disabled={importing}>
                Cancel
              </Button>
              <Button onClick={runImport} disabled={importing || valid.length === 0}>
                {importing && <Loader2 className="animate-spin" />}
                Import {valid.length > 0 ? `${valid.length} supplier${valid.length === 1 ? "" : "s"}` : ""}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
