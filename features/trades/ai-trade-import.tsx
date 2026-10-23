"use client";

import { useAction, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { TradeFields } from "@/convex/lib/validators";
import { Button } from "@/components/ui/button";
import { AiExtractDialog, type ExtractRow, type ExtractSelection } from "@/features/ai/ai-extract-dialog";
import { useAiAvailability } from "@/features/ai/ai-shared";
import { useWizard } from "./wizard-context";

type Extracted = FunctionReturnType<typeof api.ai.extractTradeFromText>;
type Field = keyof Extracted["fields"];

const LABELS: Record<Field, string> = {
  direction: "Direction",
  counterpartyName: "Counterparty",
  commodityName: "Commodity",
  quantity: "Quantity",
  uom: "Unit of measure",
  pricePerUom: "Price per unit",
  currency: "Currency",
  incoterm: "Incoterm",
  paymentTerm: "Payment term",
  shipmentPeriod: "Shipment period",
  loadingLocation: "Loading location",
  dischargeLocation: "Discharge location",
  origin: "Origin",
  packing: "Packing",
  buyerReference: "Buyer reference / PO",
  notes: "Other details (added to internal notes)",
  consignee: "Consignee",
  notifyParty: "Notify party",
  lcNumber: "LC number",
  placeOfReceipt: "Place of receipt",
  placeOfDelivery: "Place of delivery",
  containerCount: "Number of containers",
  containerType: "Container type",
  packagesPerContainer: "Packages per container",
  packageNetKg: "Net kg per package",
  palletsPerContainer: "Pallets per container",
  freightTerms: "Freight terms",
  originalBlCount: "Original B/Ls",
  packageType: "Package type",
  palletType: "Pallet type",
  freightPayableBy: "Freight payable by",
};

/** Plain extraction fields that map 1:1 (or renamed) onto trade form fields. */
const TARGET: Partial<Record<Field, keyof TradeFields>> = {
  quantity: "quantity",
  pricePerUom: "pricePerUom",
  paymentTerm: "paymentTerm",
  shipmentPeriod: "shipmentPeriod",
  loadingLocation: "loadingLocation",
  dischargeLocation: "dischargeLocation",
  origin: "origin",
  packing: "packingClause",
  buyerReference: "buyerReference",
  consignee: "consignee",
  notifyParty: "notifyParty",
  lcNumber: "lcNumber",
  placeOfReceipt: "placeOfReceipt",
  placeOfDelivery: "placeOfDelivery",
  containerCount: "containerCount",
  containerType: "containerType",
  packagesPerContainer: "packagesPerContainer",
  packageNetKg: "packageNetKg",
  palletsPerContainer: "palletsPerContainer",
  originalBlCount: "originalBlCount",
  packageType: "packageType",
  palletType: "palletType",
  freightPayableBy: "freightPayableBy",
};

/** Fields backed by a fixed reference list — only values on that list can be applied. */
type LookupKindUsed = "uom" | "currency" | "incoterm" | "freightTerm";
const LOOKUP: Partial<Record<Field, { kind: LookupKindUsed; field: keyof TradeFields }>> = {
  uom: { kind: "uom", field: "uom" },
  currency: { kind: "currency", field: "currency" },
  incoterm: { kind: "incoterm", field: "incoterm" },
  freightTerms: { kind: "freightTerm", field: "freightTerms" },
};

type LookupOption = { value: string; label: string };

/** Finds a reference-list entry for an AI value: exact value/label, then the first word ("CIF Mombasa" → CIF). */
function matchLookup(options: LookupOption[] | undefined, raw: string): LookupOption | undefined {
  if (!options) return undefined;
  const norm = (s: string) => s.trim().toLowerCase();
  const wanted = norm(raw);
  const first = wanted.split(/[\s,/-]+/)[0];
  return (
    options.find((o) => norm(o.value) === wanted || norm(o.label) === wanted) ??
    options.find((o) => norm(o.value) === first || norm(o.label) === first)
  );
}

/** Port fields accept free text, but prefer the reference-list spelling ("Callao" → "Callao, Peru"). */
const PORT_FIELDS = new Set<Field>(["loadingLocation", "dischargeLocation", "placeOfReceipt", "placeOfDelivery"]);

function matchPort(options: LookupOption[] | undefined, raw: string): string | undefined {
  if (!options) return undefined;
  const wanted = raw.trim().toLowerCase();
  return options.find((o) => {
    const v = o.value.toLowerCase();
    return v === wanted || v.startsWith(`${wanted},`) || v.split(",")[0].trim() === wanted;
  })?.value;
}

const pct = (score: number) => `${Math.round(score * 100)}% match`;

/** "Fill from email" for the Book Trade wizard. Suggestions are reviewed per field before anything changes. */
export function AiTradeImport() {
  const wizard = useWizard();
  const { form, setField, onDirectionChanged, onCounterpartySelected, can, meta } = wizard;
  const ai = useAiAvailability();
  const extract = useAction(api.ai.extractTradeFromText);
  const [open, setOpen] = useState(false);
  const [last, setLast] = useState<Extracted | null>(null);
  const lookups = {
    uom: useQuery(api.lookups.list, open ? { kind: "uom" } : "skip"),
    currency: useQuery(api.lookups.list, open ? { kind: "currency" } : "skip"),
    incoterm: useQuery(api.lookups.list, open ? { kind: "incoterm" } : "skip"),
    freightTerm: useQuery(api.lookups.list, open ? { kind: "freightTerm" } : "skip"),
  };
  const ports = useQuery(api.lookups.list, open ? { kind: "port" } : "skip");
  const portValue = (raw: string) => matchPort(ports ?? undefined, raw) ?? raw;

  const locked = meta.status !== undefined && meta.status !== "draft";
  // Hidden when it could never work for this user; shown-but-disabled when AI is merely off.
  if (!can("trade.create") || locked || ai === undefined || !ai.status.configured) return null;

  const currentText = (name: keyof TradeFields): string | undefined => {
    const v = form.getValues(name);
    return v === undefined || v === null || v === "" ? undefined : String(v);
  };

  async function run(text: string) {
    const res = await extract({ text });
    setLast(res);
    const rows: ExtractRow[] = [];
    for (const key of Object.keys(LABELS) as Field[]) {
      const s = res.fields[key];
      if (!s) continue;
      const found = String(s.value);
      const base = { key, label: LABELS[key], found, confidence: s.confidence };
      if (key === "direction") {
        rows.push({ ...base, found: s.value === "sales" ? "Sales — we are selling" : "Purchase — we are buying", current: currentText("direction") });
      } else if (key === "counterpartyName" || key === "commodityName") {
        const list = key === "counterpartyName" ? res.matches.counterparties : res.matches.commodities;
        const strong = list.find((m) => m.score >= 0.85);
        rows.push({
          ...base,
          choices: list.map((m) => ({ value: m.id, label: `${m.name} (${m.code})`, hint: pct(m.score) })),
          defaultChoice: strong?.id,
          blockedReason:
            list.length === 0
              ? `No matching ${key === "counterpartyName" ? "counterparty" : "commodity"} in the system — create it first or pick one yourself.`
              : undefined,
          current: currentText(key === "counterpartyName" ? "counterpartyId" : "commodityId") ? "the one already selected" : undefined,
        });
      } else if (LOOKUP[key]) {
        const { kind, field } = LOOKUP[key]!;
        const hit = matchLookup(lookups[kind] ?? undefined, found);
        rows.push({
          ...base,
          found: hit && hit.value !== found ? `${found} → ${hit.label}` : found,
          blockedReason: hit ? undefined : `“${found}” isn't in your ${LABELS[key].toLowerCase()} list (Companies & Masters → Reference lists).`,
          current: currentText(field),
        });
      } else if (key === "notes") {
        rows.push(base);
      } else if (PORT_FIELDS.has(key)) {
        const port = portValue(found);
        rows.push({ ...base, found: port !== found ? `${found} → ${port}` : found, current: currentText(TARGET[key]!) });
      } else {
        rows.push({ ...base, current: currentText(TARGET[key]!) });
      }
    }
    return { rows, model: res.model, dropped: res.dropped.length };
  }

  async function apply(selection: ExtractSelection) {
    if (!last) return;
    const picked = (k: Field) => k in selection;
    let count = 0;
    // Direction first: counterparty defaults and bank details depend on it.
    if (picked("direction") && last.fields.direction) {
      const d = last.fields.direction.value as "purchase" | "sales";
      if (form.getValues("direction") !== d) {
        setField("direction", d);
        await onDirectionChanged(d);
      }
      count++;
    }
    // Counterparty next, so its saved defaults fill in before the email's own values take precedence.
    if (selection.counterpartyName) {
      const id = selection.counterpartyName as Id<"counterparties">;
      setField("counterpartyId", id);
      await onCounterpartySelected(id);
      count++;
    }
    if (selection.commodityName) {
      setField("commodityId", selection.commodityName as Id<"commodities">);
      count++;
    }
    for (const key of Object.keys(LOOKUP) as Field[]) {
      const s = last.fields[key];
      if (!picked(key) || !s) continue;
      const { kind, field } = LOOKUP[key]!;
      const hit = matchLookup(lookups[kind] ?? undefined, String(s.value));
      if (!hit) continue;
      setField(field, hit.value as never);
      count++;
    }
    for (const [key, target] of Object.entries(TARGET) as [Field, keyof TradeFields][]) {
      const s = last.fields[key];
      if (!picked(key) || !s) continue;
      setField(target, (PORT_FIELDS.has(key) ? portValue(String(s.value)) : s.value) as never);
      count++;
    }
    // An LC number on a sale means the sale is under a letter of credit.
    if (picked("lcNumber") && form.getValues("direction") === "sales" && form.getValues("salesBasis") !== "lc") {
      setField("salesBasis", "lc");
    }
    if (picked("notes") && last.fields.notes) {
      const prev = form.getValues("internalNotes");
      const note = `From pasted email: ${last.fields.notes.value}`;
      setField("internalNotes", prev ? `${prev}\n${note}` : note);
      count++;
    }
    await form.trigger();
    toast.success(`Filled ${count} field${count === 1 ? "" : "s"} from the email — review each step before saving.`);
  }

  return (
    <div className="mb-3 flex justify-end">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={!ai.available}
        title={ai.reason ?? "Paste an email, PO or chat message and let AI suggest the trade details"}
        data-tour="wizard-ai-import"
      >
        <Sparkles /> Fill from email
      </Button>
      <AiExtractDialog
        open={open}
        onOpenChange={setOpen}
        title="Fill trade from an email"
        description="Paste a customer email, purchase order or chat message. AI suggests trade details; you choose which to use. Values not stated in the text are never guessed."
        placeholder={"e.g.\nPlease confirm 500 MT yellow maize, USD 245/MT CIF Mombasa, shipment November 2026, payment LC 60 days. Our PO 4471."}
        extract={run}
        onApply={apply}
        applyLabel="Fill the form"
      />
    </div>
  );
}
