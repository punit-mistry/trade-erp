"use client";

import { useMutation, useQuery } from "convex/react";
import { ArrowDown, ArrowUp, Check, Info, Loader2, Pencil, Plus, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { LookupKind } from "@/convex/lib/validators";
import { TableSkeleton } from "@/components/shared/states";
import { TableCard } from "@/components/shared/table-parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getErrorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";

const KINDS: { kind: LookupKind; label: string; help: string; valueHint: string }[] = [
  { kind: "currency", label: "Currencies", help: "ISO currency codes available on trades and supplier defaults.", valueHint: "USD" },
  { kind: "incoterm", label: "Incoterms", help: "Delivery terms. Description is shown as help text when selecting.", valueHint: "FOB" },
  { kind: "paymentTerm", label: "Payment terms", help: "Payment terms offered on trades and supplier defaults.", valueHint: "D/P at Sight" },
  { kind: "pricingTerm", label: "Pricing terms", help: "Pricing basis printed on contracts.", valueHint: "Fixed price" },
  { kind: "priceType", label: "Price types", help: "Price type options in the Quantity & Price step.", valueHint: "Fixed" },
  { kind: "uom", label: "Units of measure", help: "Units for quantities. Value is what’s stored and printed (e.g. MT).", valueHint: "MT" },
  { kind: "port", label: "Ports & locations", help: "Suggested loading / discharge locations. Users can still type others.", valueHint: "Port Klang, Malaysia" },
  { kind: "freightTerm", label: "Freight terms", help: "Freight terms for trades and B/Ls.", valueHint: "Freight Prepaid" },
  { kind: "packing", label: "Packing", help: "Common packing descriptions.", valueHint: "In PP bags of 50 kg" },
];

type Row = {
  _id: Id<"lookups"> | null;
  value: string;
  label: string;
  description?: string;
  active: boolean;
};

export function LookupsTab() {
  const [kind, setKind] = useState<LookupKind>("currency");
  const meta = KINDS.find((k) => k.kind === kind)!;
  const data = useQuery(api.lookups.listAll, { kind });
  const setActive = useMutation(api.lookups.setActive);
  const reorder = useMutation(api.lookups.reorder);
  const [editingValue, setEditingValue] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const run = async (fn: () => Promise<unknown>, success?: string) => {
    try {
      await fn();
      if (success) toast.success(success);
    } catch (e) {
      toast.error(getErrorMessage(e));
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
      <nav aria-label="Reference lists" className="flex gap-1 overflow-x-auto lg:flex-col">
        {KINDS.map((k) => (
          <button
            key={k.kind}
            type="button"
            onClick={() => {
              setKind(k.kind);
              setEditingValue(null);
              setAdding(false);
            }}
            className={cn(
              "shrink-0 rounded-md px-3 py-1.5 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground",
              kind === k.kind && "bg-accent font-medium text-accent-foreground",
            )}
          >
            {k.label}
          </button>
        ))}
      </nav>

      <TableCard
        toolbar={
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold">{meta.label}</h3>
              <p className="text-xs text-muted-foreground">{meta.help}</p>
            </div>
            <Button size="sm" onClick={() => setAdding(true)} disabled={adding}>
              <Plus /> Add value
            </Button>
          </div>
        }
      >
        {data && !data.materialised && (
          <div className="flex items-start gap-2 border-b bg-info/5 px-4 py-2 text-xs text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0 text-info" />
            Showing built-in defaults. Your first change saves this list so it becomes fully editable.
          </div>
        )}
        {data === undefined ? (
          <TableSkeleton rows={5} columns={4} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Order</TableHead>
                <TableHead>Value</TableHead>
                <TableHead>Label</TableHead>
                <TableHead>Description / help</TableHead>
                <TableHead className="w-20">Active</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {adding && <EditRow kind={kind} valueHint={meta.valueHint} onDone={() => setAdding(false)} />}
              {data.rows.map((r, i) =>
                editingValue === r.value ? (
                  <EditRow key={r.value} kind={kind} row={r} valueHint={meta.valueHint} onDone={() => setEditingValue(null)} />
                ) : (
                  <TableRow key={r.value} className={cn(!r.active && "opacity-60")}>
                    <TableCell>
                      <div className="flex">
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`Move ${r.value} up`}
                          disabled={i === 0}
                          onClick={() => run(() => reorder({ kind, value: r.value, direction: "up" }))}
                        >
                          <ArrowUp />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`Move ${r.value} down`}
                          disabled={i === data.rows.length - 1}
                          onClick={() => run(() => reorder({ kind, value: r.value, direction: "down" }))}
                        >
                          <ArrowDown />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{r.value}</TableCell>
                    <TableCell>{r.label}</TableCell>
                    <TableCell className="max-w-xs truncate text-muted-foreground">{r.description || "—"}</TableCell>
                    <TableCell>
                      <Switch
                        checked={r.active}
                        aria-label={`${r.active ? "Deactivate" : "Activate"} ${r.value}`}
                        onCheckedChange={(checked) =>
                          run(() => setActive({ kind, value: r.value, active: checked }), checked ? "Value activated" : "Value hidden from selectors")
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon-sm" aria-label={`Edit ${r.value}`} onClick={() => setEditingValue(r.value)}>
                        <Pencil />
                      </Button>
                    </TableCell>
                  </TableRow>
                ),
              )}
            </TableBody>
          </Table>
        )}
      </TableCard>
    </div>
  );
}

function EditRow({ kind, row, valueHint, onDone }: { kind: LookupKind; row?: Row; valueHint: string; onDone: () => void }) {
  const upsert = useMutation(api.lookups.upsert);
  const [value, setValue] = useState(row?.value ?? "");
  const [label, setLabel] = useState(row?.label ?? "");
  const [description, setDescription] = useState(row?.description ?? "");
  const [pending, setPending] = useState(false);

  async function save() {
    if (!value.trim()) {
      toast.error("Value is required.");
      return;
    }
    setPending(true);
    try {
      await upsert({
        kind,
        id: row?._id ?? undefined,
        value: kind === "currency" ? value.trim().toUpperCase() : value.trim(),
        label: label.trim() || undefined,
        description: description.trim() || undefined,
      });
      toast.success(row ? "Value updated" : "Value added");
      onDone();
    } catch (e) {
      toast.error(getErrorMessage(e));
      setPending(false);
    }
  }

  return (
    <TableRow className="bg-accent/30 hover:bg-accent/30">
      <TableCell />
      <TableCell>
        <Input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={valueHint}
          aria-label="Value"
          className="h-7"
          onKeyDown={(e) => e.key === "Enter" && save()}
        />
      </TableCell>
      <TableCell>
        <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label (optional)" aria-label="Label" className="h-7" />
      </TableCell>
      <TableCell>
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Help text (optional)"
          aria-label="Description"
          className="h-7"
        />
      </TableCell>
      <TableCell colSpan={2}>
        <div className="flex justify-end gap-1">
          <Button size="icon-sm" onClick={save} disabled={pending} aria-label="Save">
            {pending ? <Loader2 className="animate-spin" /> : <Check />}
          </Button>
          <Button size="icon-sm" variant="ghost" onClick={onDone} disabled={pending} aria-label="Cancel">
            <X />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
