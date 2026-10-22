"use client";

import { useMutation, useQuery } from "convex/react";
import { format } from "date-fns";
import { ArrowDown, ArrowUp, Loader2, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { FormField } from "@/components/shared/form-field";
import { LookupCombobox } from "@/components/shared/lookup-combobox";
import { Section } from "@/components/shared/section";
import { PageSkeleton } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useUnsavedChangesWarning } from "@/hooks/use-unsaved-changes";
import { getErrorMessage } from "@/lib/errors";

type SettingsForm = {
  tradeNumberPrefix: string;
  contractNumberPrefix: string;
  blNumberPrefix: string;
  counterpartyCodePrefix: string;
  sequencePadding: number;
  defaultCurrency: string;
  dateFormat: string;
  maxUploadMb: number;
  allowedFileTypes: string[];
  dispatchChecklistTemplate: string[];
};

const PREFIX = /^[A-Z0-9]{1,8}$/;

function sample(prefix: string, padding: number, year = new Date().getFullYear(), withYear = true) {
  const seq = "1".padStart(Math.min(Math.max(padding || 0, 1), 8), "0");
  return withYear ? `${prefix || "?"}-${year}-${seq}` : `${prefix || "?"}-${seq}`;
}

function safeDateExample(pattern: string) {
  try {
    return format(new Date(), pattern);
  } catch {
    return "Invalid pattern";
  }
}

function toForm(settings: SettingsForm): SettingsForm {
  return {
    tradeNumberPrefix: settings.tradeNumberPrefix,
    contractNumberPrefix: settings.contractNumberPrefix,
    blNumberPrefix: settings.blNumberPrefix,
    counterpartyCodePrefix: settings.counterpartyCodePrefix,
    sequencePadding: settings.sequencePadding,
    defaultCurrency: settings.defaultCurrency,
    dateFormat: settings.dateFormat,
    maxUploadMb: settings.maxUploadMb,
    allowedFileTypes: settings.allowedFileTypes,
    dispatchChecklistTemplate: settings.dispatchChecklistTemplate,
  };
}

export function SettingsTab() {
  const settings = useQuery(api.settings.get);
  // Bumping the key re-mounts the form with the latest saved values ("Discard").
  const [formKey, setFormKey] = useState(0);
  if (!settings) return <PageSkeleton />;
  return <SettingsEditor key={formKey} initial={toForm(settings)} onReset={() => setFormKey((k) => k + 1)} />;
}

function SettingsEditor({ initial, onReset }: { initial: SettingsForm; onReset: () => void }) {
  const update = useMutation(api.settings.update);
  const [form, setForm] = useState<SettingsForm>(initial);
  const [fileTypesText, setFileTypesText] = useState(initial.allowedFileTypes.join("\n"));
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  useUnsavedChangesWarning(dirty);
  const reset = onReset;

  const set = <K extends keyof SettingsForm>(key: K, value: SettingsForm[K]) => {
    setForm({ ...form, [key]: value });
    setDirty(true);
  };

  const prefixError = (v: string) => (PREFIX.test(v) ? undefined : "1–8 characters, A–Z / 0–9 only.");
  const paddingError =
    !Number.isInteger(form.sequencePadding) || form.sequencePadding < 3 || form.sequencePadding > 8
      ? "Between 3 and 8."
      : undefined;
  const dateExample = safeDateExample(form.dateFormat);
  const uploadError = !(form.maxUploadMb >= 1 && form.maxUploadMb <= 100) ? "Between 1 and 100 MB." : undefined;
  const checklistError = form.dispatchChecklistTemplate.filter((s) => s.trim()).length === 0 ? "Add at least one item." : undefined;
  const hasErrors = Boolean(
    prefixError(form.tradeNumberPrefix) ||
      prefixError(form.contractNumberPrefix) ||
      prefixError(form.blNumberPrefix) ||
      prefixError(form.counterpartyCodePrefix) ||
      paddingError ||
      uploadError ||
      checklistError ||
      dateExample === "Invalid pattern",
  );

  async function save() {
    if (hasErrors) return;
    setSaving(true);
    try {
      await update({
        ...form,
        allowedFileTypes: fileTypesText.split(/[\n,]/).map((s) => s.trim()).filter(Boolean),
        dispatchChecklistTemplate: form.dispatchChecklistTemplate.map((s) => s.trim()).filter(Boolean),
      });
      toast.success("Settings saved");
      setDirty(false);
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  const checklist = form.dispatchChecklistTemplate;
  const moveItem = (i: number, delta: number) => {
    const next = [...checklist];
    [next[i], next[i + delta]] = [next[i + delta], next[i]];
    set("dispatchChecklistTemplate", next);
  };

  return (
    <div className="space-y-4 pb-16">
      <Section
        title="Numbering"
        description="Applies to new records only. Existing numbers never change. Sequences are allocated atomically, so concurrent users never get duplicates."
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {(
            [
              ["tradeNumberPrefix", "Trade number prefix", true],
              ["contractNumberPrefix", "Contract number prefix", true],
              ["blNumberPrefix", "B/L record prefix", true],
              ["counterpartyCodePrefix", "Supplier code prefix", false],
            ] as const
          ).map(([key, label, withYear]) => (
            <FormField
              key={key}
              label={label}
              htmlFor={`st-${key}`}
              error={prefixError(form[key])}
              help={`Next looks like ${sample(form[key], form.sequencePadding, undefined, withYear)}`}
            >
              <Input
                id={`st-${key}`}
                value={form[key]}
                onChange={(e) => set(key, e.target.value.toUpperCase())}
                className="font-mono uppercase"
                maxLength={8}
              />
            </FormField>
          ))}
          <FormField label="Sequence digits" htmlFor="st-padding" error={paddingError} help="4 → 0001">
            <Input
              id="st-padding"
              type="number"
              min={3}
              max={8}
              value={form.sequencePadding}
              onChange={(e) => set("sequencePadding", Number(e.target.value))}
            />
          </FormField>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Contract templates can override the contract prefix and format individually.
        </p>
      </Section>

      <Section title="Regional & formatting">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <FormField label="Default currency" htmlFor="st-currency" help="Pre-selected when no supplier default applies.">
            <LookupCombobox
              id="st-currency"
              kind="currency"
              value={form.defaultCurrency}
              onChange={(v) => v && set("defaultCurrency", v)}
            />
          </FormField>
          <FormField
            label="Document date format"
            htmlFor="st-date"
            error={dateExample === "Invalid pattern" ? "Invalid date-fns pattern." : undefined}
            help={`Example: ${dateExample}`}
            tip="Pattern tokens: dd = day, MMM = short month, MMMM = full month, MM = month number, yyyy = year."
          >
            <Input id="st-date" value={form.dateFormat} onChange={(e) => set("dateFormat", e.target.value)} className="font-mono" />
          </FormField>
        </div>
      </Section>

      <Section title="Document uploads" description="Enforced on the server for every upload, using the stored file’s real type and size.">
        <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
          <FormField label="Maximum file size (MB)" htmlFor="st-maxmb" error={uploadError}>
            <Input
              id="st-maxmb"
              type="number"
              min={1}
              max={100}
              value={form.maxUploadMb}
              onChange={(e) => set("maxUploadMb", Number(e.target.value))}
            />
          </FormField>
          <FormField label="Allowed file types (MIME, one per line)" htmlFor="st-types" help="e.g. application/pdf, image/png">
            <Textarea
              id="st-types"
              rows={6}
              className="font-mono text-xs"
              value={fileTypesText}
              onChange={(e) => {
                setFileTypesText(e.target.value);
                setDirty(true);
              }}
            />
          </FormField>
        </div>
      </Section>

      <Section
        title="Dispatch checklist template"
        description="Items created for every new shipment checklist. Existing checklists are not changed."
      >
        <ol className="space-y-2">
          {checklist.map((item, i) => (
            <li key={i} className="flex items-center gap-2">
              <span className="w-6 text-right text-xs text-muted-foreground tabular">{i + 1}.</span>
              <Input
                value={item}
                aria-label={`Checklist item ${i + 1}`}
                onChange={(e) => set("dispatchChecklistTemplate", checklist.map((c, j) => (j === i ? e.target.value : c)))}
                maxLength={120}
              />
              <Button variant="ghost" size="icon-sm" disabled={i === 0} onClick={() => moveItem(i, -1)} aria-label="Move up">
                <ArrowUp />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                disabled={i === checklist.length - 1}
                onClick={() => moveItem(i, 1)}
                aria-label="Move down"
              >
                <ArrowDown />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => set("dispatchChecklistTemplate", checklist.filter((_, j) => j !== i))}
                aria-label={`Remove item ${i + 1}`}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ol>
        {checklistError && <p className="mt-2 text-xs font-medium text-destructive">{checklistError}</p>}
        <Button
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={() => set("dispatchChecklistTemplate", [...checklist, ""])}
        >
          <Plus /> Add item
        </Button>
      </Section>

      <div className="sticky bottom-0 z-10 -mx-4 flex items-center justify-end gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur md:-mx-6 md:px-6">
        {dirty && <span className="mr-auto text-xs text-muted-foreground">You have unsaved changes.</span>}
        <Button variant="outline" onClick={reset} disabled={!dirty || saving}>
          <RotateCcw /> Discard
        </Button>
        <Button onClick={save} disabled={!dirty || saving || hasErrors}>
          {saving ? <Loader2 className="animate-spin" /> : <Save />} Save settings
        </Button>
      </div>
    </div>
  );
}
