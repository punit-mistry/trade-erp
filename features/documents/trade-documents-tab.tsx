"use client";

import { useQuery } from "convex/react";
import { CheckCircle2, CircleDashed } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { DocumentType } from "@/convex/lib/validators";
import { DOCUMENT_TYPE_LABEL } from "@/lib/status";
import { cn } from "@/lib/utils";
import { DocumentList } from "./document-list";

/** Standard shipping set we check for on every trade (computed from real rows). */
const STANDARD_SET: { label: string; types: DocumentType[] }[] = [
  { label: "Contract", types: ["contract", "signed_contract"] },
  { label: DOCUMENT_TYPE_LABEL.commercial_invoice, types: ["commercial_invoice"] },
  { label: DOCUMENT_TYPE_LABEL.packing_list, types: ["packing_list"] },
  { label: "Bill of Lading", types: ["bl_draft", "bl_issued"] },
  { label: DOCUMENT_TYPE_LABEL.certificate, types: ["certificate"] },
];

export function TradeDocumentsTab({ tradeId }: { tradeId: Id<"trades"> }) {
  const docs = useQuery(api.documents.listFor, { tradeId });
  const present = new Set((docs ?? []).filter((d) => !d.archived && d.reviewStatus !== "rejected").map((d) => d.docType));
  const missing = STANDARD_SET.filter((s) => !s.types.some((t) => present.has(t)));

  return (
    <div className="space-y-4">
      {docs !== undefined && (
        <div className="rounded-lg border bg-card px-4 py-3 shadow-xs">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Shipping document set</h3>
            <span className="text-xs text-muted-foreground tabular">
              {STANDARD_SET.length - missing.length} of {STANDARD_SET.length} on file
            </span>
          </div>
          <ul className="flex flex-wrap gap-x-5 gap-y-1.5">
            {STANDARD_SET.map((s) => {
              const ok = s.types.some((t) => present.has(t));
              return (
                <li key={s.label} className={cn("flex items-center gap-1.5 text-xs", ok ? "text-foreground" : "text-muted-foreground")}>
                  {ok ? <CheckCircle2 className="size-3.5 text-success" /> : <CircleDashed className="size-3.5" />}
                  {s.label}
                </li>
              );
            })}
          </ul>
          {missing.length > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              Missing: {missing.map((m) => m.label).join(", ")}. Rejected or archived files don’t count.
            </p>
          )}
        </div>
      )}
      <DocumentList filter={{ tradeId }} title="Trade documents" />
    </div>
  );
}
