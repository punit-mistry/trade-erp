"use client";

import { useQuery } from "convex/react";
import { FileText, Upload } from "lucide-react";
import type { ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { DocumentType } from "@/convex/lib/validators";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/shared/empty-state";
import { TableSkeleton } from "@/components/shared/states";
import { useViewer } from "@/hooks/use-viewer";
import { formatBytes, formatDateTime } from "@/lib/format";
import { DOCUMENT_TYPE_LABEL } from "@/lib/status";
import { DocumentRowActions, DocumentVersion, ReviewBadge } from "./document-actions";
import { UploadDocumentDialog } from "./upload-document-dialog";

export type DocumentFilter = {
  tradeId?: Id<"trades">;
  counterpartyId?: Id<"counterparties">;
  contractId?: Id<"contracts">;
  blDocumentId?: Id<"blDocuments">;
};

/**
 * Compact list of the documents linked to one record, with download,
 * version history, review and archive actions plus an Upload button that
 * pre-links new files to the same record.
 */
export function DocumentList({
  filter,
  defaultDocType,
  title = "Documents",
  headerExtra,
  showArchived = false,
}: {
  filter: DocumentFilter;
  defaultDocType?: DocumentType;
  title?: string;
  headerExtra?: ReactNode;
  showArchived?: boolean;
}) {
  const { can } = useViewer();
  const docs = useQuery(api.documents.listFor, { ...filter, includeArchived: showArchived });

  const upload = can("document.upload") && (
    <UploadDocumentDialog
      defaults={{ ...filter, docType: defaultDocType }}
      trigger={
        <Button size="sm" variant="outline">
          <Upload /> Upload
        </Button>
      }
    />
  );

  return (
    <div className="overflow-hidden rounded-lg border bg-card shadow-xs">
      <div className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">{title}</h3>
          {docs && <span className="text-xs text-muted-foreground tabular">{docs.length}</span>}
        </div>
        <div className="flex items-center gap-2">
          {headerExtra}
          {upload}
        </div>
      </div>
      {docs === undefined ? (
        <TableSkeleton rows={3} columns={5} />
      ) : docs.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No documents yet"
          description="Upload contracts, invoices, packing lists, certificates or B/L copies so the whole team works from the same files."
          className="py-10"
        />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>File</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Review</TableHead>
                <TableHead>Uploaded</TableHead>
                <TableHead className="w-20 text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {docs.map((d) => (
                <TableRow key={d._id} className={d.isLatest ? undefined : "text-muted-foreground"}>
                  <TableCell className="max-w-72">
                    <div className="truncate font-medium" title={d.fileName}>
                      {d.fileName}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {formatBytes(d.size)}
                      {d.source === "generated" && " · generated"}
                      {!d.isLatest && " · older version"}
                      {d.notes && ` · ${d.notes}`}
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{DOCUMENT_TYPE_LABEL[d.docType]}</TableCell>
                  <TableCell>
                    <DocumentVersion doc={d} />
                  </TableCell>
                  <TableCell>
                    <ReviewBadge doc={d} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <div className="text-xs">{formatDateTime(d._creationTime)}</div>
                    <div className="text-xs text-muted-foreground">{d.uploadedByName}</div>
                  </TableCell>
                  <TableCell>
                    <DocumentRowActions doc={d} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
