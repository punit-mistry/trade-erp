"use client";

import Link from "next/link";
import { useState } from "react";
import { GitCompare } from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel";
import type { ContractStatus } from "@/convex/lib/validators";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import { CONTRACT_STATUS } from "@/lib/status";
import { diffSnapshots, type ContractDocData } from "./contract-document";

export type VersionRow = {
  _id: Id<"contracts">;
  contractNumber: string;
  version: number;
  status: ContractStatus;
  isCurrent: boolean;
  templateName?: string;
  templateVersion: number;
  revisionReason?: string;
  issuedAt?: number;
  issuedByName?: string;
  _creationTime: number;
  createdByName?: string;
  pdfUrl?: string | null;
  snapshot: ContractDocData["snapshot"];
};

/** Version history with a clause/variable-level comparison against the previous version. */
export function ContractVersions({ versions, linkVersions = true }: { versions: VersionRow[]; linkVersions?: boolean }) {
  const [compare, setCompare] = useState<{ prev: VersionRow; next: VersionRow } | null>(null);
  const sorted = [...versions].sort((a, b) => b.version - a.version);

  return (
    <>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Version</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Template</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Issued</TableHead>
              <TableHead>Revision reason</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((row) => {
              const prev = sorted.find((r) => r.version < row.version);
              return (
                <TableRow key={row._id}>
                  <TableCell className="font-medium">
                    {linkVersions ? (
                      <Link href={`/contracts/${row._id}`} className="hover:underline">
                        {row.contractNumber} · v{row.version}
                      </Link>
                    ) : (
                      `${row.contractNumber} · v${row.version}`
                    )}
                    {row.isCurrent && <span className="ml-2 text-xs text-muted-foreground">(in force)</span>}
                  </TableCell>
                  <TableCell>
                    <StatusBadge value={row.status} map={CONTRACT_STATUS} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.templateName ?? "—"} v{row.templateVersion}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDateTime(row._creationTime)}
                    {row.createdByName && <div className="text-xs">{row.createdByName}</div>}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.issuedAt ? (
                      <>
                        {formatDateTime(row.issuedAt)}
                        <div className="text-xs">{row.issuedByName}</div>
                      </>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="max-w-56 truncate text-muted-foreground" title={row.revisionReason}>
                    {row.revisionReason ?? "—"}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    {row.pdfUrl && (
                      <Button size="xs" variant="ghost" asChild>
                        <a href={row.pdfUrl} target="_blank" rel="noreferrer">
                          PDF
                        </a>
                      </Button>
                    )}
                    {prev && (
                      <Button size="xs" variant="ghost" onClick={() => setCompare({ prev, next: row })}>
                        <GitCompare /> Compare v{prev.version}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <Dialog open={compare !== null} onOpenChange={(o) => !o && setCompare(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          {compare && <DiffView prev={compare.prev} next={compare.next} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

function DiffView({ prev, next }: { prev: VersionRow; next: VersionRow }) {
  const diff = diffSnapshots(prev.snapshot, next.snapshot);
  const nothing = diff.variables.length === 0 && diff.clauses.length === 0 && !diff.titleChanged;
  return (
    <>
      <DialogHeader>
        <DialogTitle>
          Changes from v{prev.version} to v{next.version}
        </DialogTitle>
        <DialogDescription>
          Compared on rendered content. {next.revisionReason && `Revision reason: ${next.revisionReason}`}
        </DialogDescription>
      </DialogHeader>
      {nothing && <p className="text-sm text-muted-foreground">No differences in the rendered contract.</p>}
      {diff.titleChanged && (
        <p className="text-sm">
          Title: <del className="text-destructive">{prev.snapshot.title}</del> →{" "}
          <ins className="text-success no-underline">{next.snapshot.title}</ins>
        </p>
      )}
      {diff.variables.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold">Changed values</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Field</TableHead>
                <TableHead>v{prev.version}</TableHead>
                <TableHead>v{next.version}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {diff.variables.map((d) => (
                <TableRow key={d.name}>
                  <TableCell className="font-medium">{d.label}</TableCell>
                  <TableCell className="whitespace-pre-line text-destructive">{d.from || "—"}</TableCell>
                  <TableCell className="whitespace-pre-line text-success">{d.to || "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {diff.clauses.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Changed clauses</h3>
          {diff.clauses.map((c) => (
            <div key={`${c.index}-${c.kind}`} className="rounded-md border p-3 text-sm">
              <div className="mb-2 font-medium">
                {c.index + 1}. {c.heading}{" "}
                <span className="text-xs font-normal text-muted-foreground">({c.kind})</span>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded bg-destructive/5 p-2 whitespace-pre-line">{c.from ?? "—"}</div>
                <div className="rounded bg-success/5 p-2 whitespace-pre-line">{c.to ?? "—"}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
