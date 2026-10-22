"use client";

import { useMutation } from "convex/react";
import { useMemo, useState, type KeyboardEvent } from "react";
import { Eye, EyeOff, Loader2, Save, Undo2, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { BlRecord } from "@/convex/blDocuments";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormField, NumberInput } from "@/components/shared/form-field";
import { LookupCombobox } from "@/components/shared/lookup-combobox";
import { useUnsavedChangesWarning } from "@/hooks/use-unsaved-changes";
import { getErrorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { BL_SECTIONS, toFormValues, type BlFieldDef, type BlFormValues } from "./bl-fields";

/** Comparable form snapshot: trims strings, treats "" as unset (matches server normalisation). */
function normalise(values: BlFormValues): string {
  const entries = Object.entries(values)
    .map(([k, v]): [string, unknown] => {
      if (typeof v === "string") return [k, v.trim() || undefined];
      if (Array.isArray(v)) return [k, (v as string[]).map((s) => s.trim()).filter(Boolean)];
      return [k, v];
    })
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(entries);
}

function TagInput({
  id,
  value,
  onChange,
  disabled,
}: {
  id: string;
  value: string[];
  onChange: (v: string[]) => void;
  disabled?: boolean;
}) {
  const [text, setText] = useState("");
  function commit() {
    const parts = text
      .split(/[,\n]/)
      .map((p) => p.trim().toUpperCase())
      .filter(Boolean);
    if (parts.length) onChange([...value, ...parts.filter((p) => !value.includes(p))]);
    setText("");
  }
  return (
    <div
      className={cn(
        "flex min-h-8 flex-wrap items-center gap-1 rounded-lg border border-input bg-transparent px-1.5 py-1 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50",
        disabled && "opacity-60",
      )}
    >
      {value.map((t) => (
        <span key={t} className="inline-flex items-center gap-1 rounded bg-secondary px-1.5 py-0.5 font-mono text-xs">
          {t}
          {!disabled && (
            <button
              type="button"
              aria-label={`Remove ${t}`}
              onClick={() => onChange(value.filter((v) => v !== t))}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="size-3" />
            </button>
          )}
        </span>
      ))}
      {!disabled && (
        <input
          id={id}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              commit();
            } else if (e.key === "Backspace" && text === "" && value.length) {
              onChange(value.slice(0, -1));
            }
          }}
          onBlur={commit}
          className="min-w-24 flex-1 bg-transparent px-1 text-sm outline-none"
          placeholder={value.length ? "" : "Type and press Enter"}
        />
      )}
    </div>
  );
}

/**
 * Structured B/L editor. Edits only the B/L record (overrides never touch the
 * trade). Read-only once the B/L leaves Draft/Prepared.
 */
export function BlForm({ bl, editable }: { bl: BlRecord; editable: boolean }) {
  const initial = useMemo(() => toFormValues(bl), [bl]);
  const [values, setValues] = useState<BlFormValues>(initial);
  const [saving, setSaving] = useState(false);
  const update = useMutation(api.blDocuments.update);

  // Re-sync when the server record changes and the user has no local edits.
  const dirty = normalise(values) !== normalise(initial);
  const [lastServer, setLastServer] = useState(() => normalise(initial));
  const server = normalise(initial);
  if (server !== lastServer) {
    // Adjust state during render (React-recommended over an effect).
    setLastServer(server);
    if (!dirty) setValues(initial);
  }
  useUnsavedChangesWarning(dirty);

  function set<K extends keyof BlFormValues>(key: K, value: BlFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  function toggleHidden(key: string) {
    setValues((v) => ({
      ...v,
      hiddenFields: v.hiddenFields.includes(key) ? v.hiddenFields.filter((k) => k !== key) : [...v.hiddenFields, key],
    }));
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    try {
      const fields: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(values)) fields[k] = v === undefined ? "" : v;
      // Numbers left blank are sent as undefined (cleared) rather than "".
      for (const k of ["quantity", "grossWeight", "netWeight", "originalsCount"]) {
        if (fields[k] === "") delete fields[k];
      }
      await update({ id: bl._id, fields: fields as Parameters<typeof update>[0]["fields"] });
      toast.success("B/L draft saved");
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  function renderControl(f: BlFieldDef) {
    const id = `bl-${f.key}`;
    const disabled = !editable;
    switch (f.kind) {
      case "textarea":
        return (
          <Textarea
            id={id}
            rows={f.wide ? 4 : 3}
            disabled={disabled}
            value={(values[f.key] as string | undefined) ?? ""}
            onChange={(e) => set(f.key, e.target.value as never)}
          />
        );
      case "number":
        return (
          <NumberInput
            id={id}
            disabled={disabled}
            value={values[f.key] as number | undefined}
            onValueChange={(n) => set(f.key, n as never)}
            maxDecimals={f.key === "originalsCount" ? 0 : 3}
          />
        );
      case "date":
        return (
          <Input
            id={id}
            type="date"
            disabled={disabled}
            value={(values[f.key] as string | undefined) ?? ""}
            onChange={(e) => set(f.key, e.target.value as never)}
          />
        );
      case "tags":
        return (
          <TagInput
            id={id}
            disabled={disabled}
            value={(values[f.key] as string[] | undefined) ?? []}
            onChange={(v) => set(f.key, v as never)}
          />
        );
      case "lookup":
        return (
          <LookupCombobox
            id={id}
            kind={f.lookup!}
            allowCustom
            disabled={disabled}
            value={values[f.key] as string | undefined}
            onChange={(v) => set(f.key, (v ?? "") as never)}
          />
        );
      default:
        return (
          <Input
            id={id}
            disabled={disabled}
            value={(values[f.key] as string | undefined) ?? ""}
            onChange={(e) => set(f.key, e.target.value as never)}
          />
        );
    }
  }

  return (
    <div className="space-y-4">
      {BL_SECTIONS.map((section) => (
        <section key={section.title} className="rounded-lg border bg-card shadow-xs">
          <div className="border-b px-4 py-2.5">
            <h3 className="text-sm font-semibold">{section.title}</h3>
            {section.description && <p className="text-xs text-muted-foreground">{section.description}</p>}
          </div>
          <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
            {section.fields.map((f) => {
              const hidden = values.hiddenFields.includes(f.key);
              return (
                <FormField
                  key={f.key}
                  label={f.label}
                  htmlFor={`bl-${f.key}`}
                  required={f.required}
                  help={f.help}
                  className={cn(
                    (f.wide || f.kind === "tags") && "sm:col-span-2 lg:col-span-3",
                    f.kind === "textarea" && !f.wide && "lg:col-span-1",
                  )}
                  badge={
                    f.internal ? (
                      <span className="text-[10px] text-muted-foreground">internal — not printed</span>
                    ) : editable ? (
                      <button
                        type="button"
                        onClick={() => toggleHidden(f.key)}
                        className={cn(
                          "ml-auto inline-flex items-center gap-1 text-[10px] hover:text-foreground",
                          hidden ? "text-warning" : "text-muted-foreground",
                        )}
                        aria-pressed={!hidden}
                        title={hidden ? "Hidden on printout — click to show" : "Shown on printout — click to hide"}
                      >
                        {hidden ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
                        {hidden ? "hidden" : "printed"}
                      </button>
                    ) : hidden ? (
                      <span className="text-[10px] text-warning">hidden on printout</span>
                    ) : undefined
                  }
                >
                  {renderControl(f)}
                </FormField>
              );
            })}
          </div>
        </section>
      ))}

      {editable && (
        <div className="sticky bottom-0 z-10 -mx-1 flex items-center justify-end gap-2 rounded-lg border bg-background/95 px-3 py-2 shadow-sm backdrop-blur">
          <span className="mr-auto text-xs text-muted-foreground">
            {dirty ? "Unsaved changes — saving updates only this B/L, never the trade." : "All changes saved."}
          </span>
          <Button variant="ghost" size="sm" disabled={!dirty || saving} onClick={() => setValues(initial)}>
            <Undo2 /> Discard
          </Button>
          <Button size="sm" onClick={save} disabled={!dirty || saving}>
            {saving ? <Loader2 className="animate-spin" /> : <Save />} Save Draft
          </Button>
        </div>
      )}
    </div>
  );
}
