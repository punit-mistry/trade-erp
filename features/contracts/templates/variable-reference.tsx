"use client";

import { useState } from "react";
import { Copy, Plus } from "lucide-react";
import { toast } from "sonner";
import { TEMPLATE_VARIABLES } from "@/convex/lib/templateEngine";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/** Click-to-insert list of supported variables (editor side panel). */
export function VariablePicker({ onInsert }: { onInsert: (name: string) => void }) {
  const [q, setQ] = useState("");
  const term = q.trim().toLowerCase();
  const items = TEMPLATE_VARIABLES.filter(
    (v) => !term || v.name.toLowerCase().includes(term) || v.label.toLowerCase().includes(term),
  );
  return (
    <div className="space-y-2">
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter variables…" className="h-8" />
      <ScrollArea className="h-[360px] pr-2">
        <ul className="space-y-0.5">
          {items.map((v) => (
            <li key={v.name}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()} // keep focus/caret in the field being edited
                onClick={() => onInsert(v.name)}
                className="group flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
                title={v.description}
              >
                <Plus className="mt-0.5 size-3.5 shrink-0 text-muted-foreground group-hover:text-foreground" />
                <span className="min-w-0">
                  <span className="block font-mono text-[12px] text-primary">{`{{${v.name}}}`}</span>
                  <span className="block truncate text-xs text-muted-foreground">{v.label}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </ScrollArea>
    </div>
  );
}

/** Documentation table of every supported variable. */
export function VariableReferenceTable() {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Variable</TableHead>
            <TableHead>Meaning</TableHead>
            <TableHead>Example</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {TEMPLATE_VARIABLES.map((v) => (
            <TableRow key={v.name}>
              <TableCell className="font-mono text-[12px] text-primary">{`{{${v.name}}}`}</TableCell>
              <TableCell>
                <div className="font-medium">{v.label}</div>
                <div className="text-xs text-muted-foreground">{v.description}</div>
              </TableCell>
              <TableCell className="max-w-64 truncate text-muted-foreground" title={v.sample}>
                {v.sample}
              </TableCell>
              <TableCell>
                <button
                  type="button"
                  aria-label={`Copy {{${v.name}}}`}
                  className="text-muted-foreground hover:text-foreground"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(`{{${v.name}}}`);
                      toast.success(`Copied {{${v.name}}}`);
                    } catch {
                      toast.error("Clipboard is not available.");
                    }
                  }}
                >
                  <Copy className="size-3.5" />
                </button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
