"use client";

import { useAction } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Sparkles } from "lucide-react";
import { useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { AiExtractDialog, type ExtractRow, type ExtractSelection } from "@/features/ai/ai-extract-dialog";
import { useAiAvailability } from "@/features/ai/ai-shared";
import { useViewer } from "@/hooks/use-viewer";
import { COUNTRIES } from "@/lib/countries";
import type { SupplierFormValues } from "./supplier-schema";

type Extracted = FunctionReturnType<typeof api.ai.extractSupplierFromText>;
type Field = keyof Extracted["fields"];

const LABELS: Record<Field, string> = {
  name: "Company name",
  type: "Type",
  country: "Country",
  contactPerson: "Contact person",
  email: "Email",
  phone: "Phone",
  website: "Website",
  address: "Address",
  city: "City",
  state: "State / province",
  postalCode: "Postal code",
  taxId: "Tax ID (GST / VAT)",
  registrationNumber: "Registration number",
};

/** Normalises "INDIA" / "india" to the country list's spelling; unknown names are kept as written. */
function canonicalCountry(raw: string): string {
  return COUNTRIES.find((c) => c.toLowerCase() === raw.trim().toLowerCase()) ?? raw;
}

/** "Fill from signature" for the supplier form. Never saves — it only fills fields the user ticks. */
export function AiSupplierImport({ form }: { form: UseFormReturn<SupplierFormValues> }) {
  const { can } = useViewer();
  const ai = useAiAvailability();
  const extract = useAction(api.ai.extractSupplierFromText);
  const [open, setOpen] = useState(false);
  const [last, setLast] = useState<Extracted | null>(null);

  if (!can("counterparty.create") || ai === undefined || !ai.status.configured) return null;

  const valueFor = (key: Field, raw: string) => (key === "country" ? canonicalCountry(raw) : raw);

  async function run(text: string) {
    const res = await extract({ text });
    setLast(res);
    const rows: ExtractRow[] = [];
    for (const key of Object.keys(LABELS) as Field[]) {
      const s = res.fields[key];
      if (!s) continue;
      const current = form.getValues(key);
      const found = valueFor(key, s.value);
      if (current && current === found) continue; // already filled with the same value
      rows.push({
        key,
        label: LABELS[key],
        found: key === "type" ? (found === "domestic" ? "Domestic" : "International") : found,
        confidence: s.confidence,
        current: current ? (key === "type" ? undefined : current) : undefined,
      });
    }
    return { rows, model: res.model, dropped: res.dropped.length };
  }

  function apply(selection: ExtractSelection) {
    if (!last) return;
    let count = 0;
    for (const key of Object.keys(selection) as Field[]) {
      const s = last.fields[key];
      if (!s) continue;
      form.setValue(key, valueFor(key, s.value) as never, { shouldDirty: true, shouldValidate: true, shouldTouch: true });
      count++;
    }
    toast.success(`Filled ${count} field${count === 1 ? "" : "s"} — check them, then save the supplier.`);
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={!ai.available}
        title={ai.reason ?? "Paste an email signature, letterhead or business card and let AI fill the company details"}
      >
        <Sparkles /> Fill from signature
      </Button>
      <AiExtractDialog
        open={open}
        onOpenChange={setOpen}
        title="Fill supplier from a signature"
        description="Paste an email signature, letterhead or business-card text. AI suggests company and contact details; you choose which to use. Bank details are never read."
        placeholder={"e.g.\nRavi Kumar | Export Manager\nShree Agro Exports Pvt Ltd\n12 MG Road, Pune 411001, India\nGSTIN 27AAACS1234F1Z5 · +91 20 4000 1234 · shreeagro.com"}
        extract={run}
        onApply={apply}
        applyLabel="Fill the form"
      />
    </>
  );
}
