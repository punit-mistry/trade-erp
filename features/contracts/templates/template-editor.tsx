"use client";

import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFieldArray, useForm, useWatch, type Path } from "react-hook-form";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BookOpen,
  CheckCircle2,
  Copy,
  FilePlus2,
  Loader2,
  PauseCircle,
  Plus,
  Save,
  Star,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  KNOWN_VARIABLES,
  SAMPLE_VARIABLES,
  extractVariables,
  renderContract,
  validateTemplateText,
} from "@/convex/lib/templateEngine";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FormField } from "@/components/shared/form-field";
import { PageHeader } from "@/components/shared/page-header";
import { Section } from "@/components/shared/section";
import { StatusBadge, TonePill } from "@/components/shared/status-badge";
import { AccessDenied, PageSkeleton } from "@/components/shared/states";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useUnsavedChangesWarning } from "@/hooks/use-unsaved-changes";
import { useViewer } from "@/hooks/use-viewer";
import { getErrorMessage } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import { TEMPLATE_STATUS } from "@/lib/status";
import { cn } from "@/lib/utils";
import { ContractPreview } from "../contract-preview";
import { useTemplateActions } from "./template-actions";
import { VariablePicker } from "./variable-reference";

const ANY_COMPANY = "__any__";

const schema = z.object({
  name: z.string().min(2, "Name is required.").max(120, "Name is too long."),
  description: z.string().max(500),
  direction: z.enum(["any", "purchase", "sales"]),
  companyId: z.string(),
  title: z.string().min(1, "Document title is required."),
  header: z.string(),
  intro: z.string(),
  footer: z.string(),
  numberingFormat: z.string().refine((s) => s.includes("{seq}"), "Must include {seq} so numbers are unique."),
  numberPrefix: z.string().regex(/^[A-Za-z0-9-]{0,12}$/, "Letters, digits and hyphens only (max 12)."),
  defaultPackingClause: z.string(),
  defaultDocumentsClause: z.string(),
  defaultArbitrationClause: z.string(),
  defaultBankClause: z.string(),
  defaultShippingClause: z.string(),
  clauses: z
    .array(z.object({ heading: z.string().min(1, "Clause heading is required."), body: z.string() }))
    .min(1, "Add at least one clause."),
});
type FormValues = z.infer<typeof schema>;
/** Fields where {{variables}} may be inserted from the picker. */
const VARIABLE_FIELD = /^(title|header|intro|footer|default[A-Za-z]+Clause|clauses\.\d+\.(heading|body))$/;

/** Starter wording — clearly sample text that the business must review before use. */
const STARTER: FormValues = {
  name: "",
  description: "",
  direction: "any",
  companyId: ANY_COMPANY,
  title: "{{direction}} Contract",
  header: "",
  intro:
    "This contract is made on {{tradeDate}} between {{sellerName}} (the Seller) and {{buyerName}} (the Buyer), who agree to buy and sell the goods below on the following terms.",
  footer: "{{companyName}} · Contract {{contractNumber}} · Our ref. {{tradeNumber}}",
  numberingFormat: "{prefix}-{year}-{seq}",
  numberPrefix: "",
  defaultPackingClause: "",
  defaultDocumentsClause: "",
  defaultArbitrationClause: "",
  defaultBankClause: "",
  defaultShippingClause: "",
  clauses: [
    { heading: "Commodity", body: "{{commodity}}" },
    { heading: "Quantity", body: "{{quantity}} {{tolerance}}" },
    { heading: "Price", body: "{{pricePerUom}}, {{incoterm}} {{dischargeLocation}}.\nTotal value: {{totalValue}} ({{totalValueWords}})." },
    {
      heading: "Shipment",
      body: "Shipment period: {{shipmentPeriod}}.\nPort of loading: {{loadLocation}}. Port of discharge: {{dischargeLocation}}.\nPartial shipment: {{partialShipment}}.",
    },
    { heading: "Origin", body: "{{originOfGoods}}" },
    { heading: "Packing", body: "{{packingClause}}" },
    { heading: "Payment", body: "{{paymentTerms}}\n\nSeller's bank details:\n{{sellerBankDetails}}" },
    { heading: "Documents", body: "{{documentsClause}}" },
    { heading: "Arbitration", body: "{{arbitrationClause}}" },
    { heading: "Other conditions", body: "{{otherConditions}}\n{{additionalTerms}}" },
  ],
};

const opt = (s: string) => (s.trim() === "" ? undefined : s.trim());

function toPayload(v: FormValues) {
  return {
    name: v.name.trim(),
    description: opt(v.description),
    direction: v.direction,
    companyId: v.companyId && v.companyId !== ANY_COMPANY ? (v.companyId as Id<"companies">) : undefined,
    title: v.title.trim(),
    header: opt(v.header),
    intro: opt(v.intro),
    footer: opt(v.footer),
    numberingFormat: v.numberingFormat.trim(),
    numberPrefix: opt(v.numberPrefix)?.toUpperCase(),
    defaultPackingClause: opt(v.defaultPackingClause),
    defaultDocumentsClause: opt(v.defaultDocumentsClause),
    defaultArbitrationClause: opt(v.defaultArbitrationClause),
    defaultBankClause: opt(v.defaultBankClause),
    defaultShippingClause: opt(v.defaultShippingClause),
    clauses: v.clauses.map((c) => ({ heading: c.heading.trim(), body: c.body.trim() })),
  };
}

export function numberingExample(format: string, prefix: string) {
  return (format || "")
    .replaceAll("{prefix}", prefix || "CTR")
    .replaceAll("{year}", String(new Date().getFullYear()))
    .replaceAll("{seq}", "0001")
    .replaceAll("{tradeNumber}", "TRD-2026-0017");
}

export function TemplateEditor({ templateId }: { templateId?: Id<"contractTemplates"> }) {
  const router = useRouter();
  const { can, isLoading } = useViewer();
  const manage = can("contractTemplate.manage");
  const data = useQuery(api.contractTemplates.get, templateId ? { id: templateId } : "skip");
  const companies = useQuery(api.companies.listActive);
  const create = useMutation(api.contractTemplates.create);
  const update = useMutation(api.contractTemplates.update);
  const actions = useTemplateActions();
  const [saving, setSaving] = useState(false);
  const active = useRef<{ name: string; el: HTMLInputElement | HTMLTextAreaElement } | null>(null);

  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: STARTER, mode: "onBlur" });
  const { register, control, handleSubmit, formState, reset, getValues, setValue } = form;
  const clauses = useFieldArray({ control, name: "clauses" });
  const loadedId = useRef<string | null>(null);

  useEffect(() => {
    if (!data || loadedId.current === data.template._id) return;
    loadedId.current = data.template._id;
    const t = data.template;
    reset({
      name: t.name,
      description: t.description ?? "",
      direction: t.direction,
      companyId: t.companyId ?? ANY_COMPANY,
      title: t.title,
      header: t.header ?? "",
      intro: t.intro ?? "",
      footer: t.footer ?? "",
      numberingFormat: t.numberingFormat,
      numberPrefix: t.numberPrefix ?? "",
      defaultPackingClause: t.defaultPackingClause ?? "",
      defaultDocumentsClause: t.defaultDocumentsClause ?? "",
      defaultArbitrationClause: t.defaultArbitrationClause ?? "",
      defaultBankClause: t.defaultBankClause ?? "",
      defaultShippingClause: t.defaultShippingClause ?? "",
      clauses: t.clauses,
    });
  }, [data, reset]);

  const isNew = !templateId;
  const template = data?.template;
  const editable = manage && (isNew || template?.status === "draft");
  useUnsavedChangesWarning(editable && formState.isDirty);

  const values = useWatch({ control }) as Partial<FormValues>;
  const preview = useMemo(() => {
    const t = {
      title: values.title ?? "",
      header: values.header || undefined,
      intro: values.intro || undefined,
      footer: values.footer || undefined,
      clauses: (values.clauses ?? []).map((c) => ({ heading: c?.heading ?? "", body: c?.body ?? "" })),
    };
    const texts = [
      t.title,
      t.header,
      t.intro,
      t.footer,
      values.defaultPackingClause,
      values.defaultDocumentsClause,
      values.defaultArbitrationClause,
      values.defaultBankClause,
      values.defaultShippingClause,
      ...t.clauses.flatMap((c) => [c.heading, c.body]),
    ].filter((s): s is string => Boolean(s));
    return { rendered: renderContract(t, SAMPLE_VARIABLES), unknown: validateTemplateText(texts) };
  }, [values]);

  if (isLoading || (templateId && data === undefined)) return <PageSkeleton />;
  if (isNew && !manage) return <AccessDenied message="Only managers and administrators can create contract templates." />;


  function insertVariable(variable: string) {
    if (!editable) return;
    const target = active.current;
    if (!target || !document.body.contains(target.el)) {
      toast.info("Click into a text field first, then pick a variable to insert it at the cursor.");
      return;
    }
    const current = (getValues(target.name as Path<FormValues>) as string | undefined) ?? "";
    const start = target.el.selectionStart ?? current.length;
    const end = target.el.selectionEnd ?? start;
    const token = `{{${variable}}}`;
    setValue(target.name as Path<FormValues>, (current.slice(0, start) + token + current.slice(end)) as never, {
      shouldDirty: true,
    });
    const el = target.el;
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  }

  async function save(values: FormValues, then?: "activate") {
    if (saving) return;
    setSaving(true);
    try {
      const payload = toPayload(values);
      if (isNew) {
        const id = await create(payload);
        reset(values);
        toast.success("Template saved as draft v1.");
        router.replace(`/contract-templates/${id}`);
        return;
      }
      await update({ id: templateId!, ...payload });
      reset(values);
      if (then === "activate") {
        await actions.activate(templateId!);
      } else {
        toast.success("Draft saved.");
      }
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  const errors = formState.errors;
  const exampleNumber = numberingExample(values.numberingFormat ?? "", values.numberPrefix ?? "");

  return (
    <form onSubmit={handleSubmit((v) => save(v))} className="space-y-4" noValidate>
      <PageHeader
        back={{ href: "/contract-templates", label: "Contract Templates" }}
        title={isNew ? "New contract template" : (template?.name ?? "Template")}
        meta={
          template && (
            <>
              <span className="text-sm text-muted-foreground">v{template.version}</span>
              <StatusBadge value={template.status} map={TEMPLATE_STATUS} />
              {template.isDefault && (
                <TonePill tone="brand">
                  <Star className="size-3" /> Default
                </TonePill>
              )}
            </>
          )
        }
        description={
          template
            ? `Created by ${data?.createdByName ?? "—"} · updated ${formatDateTime(template.updatedAt)}${data?.updatedByName ? ` by ${data.updatedByName}` : ""}`
            : "Write the wording once with {{variables}}; every contract fills them from the trade."
        }
        actions={
          template &&
          manage && (
            <>
              {template.status !== "draft" && (
                <Button type="button" variant="outline" onClick={() => actions.newVersion(template._id)}>
                  <FilePlus2 /> {data?.hasDraftVersion ? "Open Draft Version" : "New Version"}
                </Button>
              )}
              <Button type="button" variant="outline" onClick={() => actions.clone(template._id)}>
                <Copy /> Clone
              </Button>
              {template.status === "inactive" && (
                <Button type="button" variant="outline" onClick={() => actions.activate(template._id)}>
                  <CheckCircle2 /> Activate
                </Button>
              )}
              {template.status === "active" && !template.isDefault && (
                <Button type="button" variant="outline" onClick={() => actions.makeDefault(template._id)}>
                  <Star /> Set as Default
                </Button>
              )}
              {template.status === "active" && (
                <ConfirmDialog
                  title={`Deactivate ${template.name}?`}
                  description="Existing contracts keep their wording. New contracts will no longer use this template."
                  confirmLabel="Deactivate"
                  destructive
                  onConfirm={() => actions.deactivate(template._id)}
                  trigger={
                    <Button type="button" variant="outline">
                      <PauseCircle /> Deactivate
                    </Button>
                  }
                />
              )}
            </>
          )
        }
      />

      <Alert>
        <BookOpen />
        <AlertDescription>
          Contract wording is your organisation&apos;s responsibility — have it reviewed by your commercial/legal team. The
          system fills in trade data but does not guarantee legal compliance.
          {!editable && template && manage && " This version is not a draft, so it is read-only — create a new version to change it."}
        </AlertDescription>
      </Alert>

      {preview.unknown.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>Unknown variables</AlertTitle>
          <AlertDescription>
            {preview.unknown.map((u) => `{{${u}}}`).join(", ")} — not recognised. Use the variable list; the template cannot be
            activated until these are fixed.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_290px]">
        <Tabs defaultValue="edit" className="min-w-0">
          <TabsList>
            <TabsTrigger value="edit">Template</TabsTrigger>
            <TabsTrigger value="preview">Live preview</TabsTrigger>
          </TabsList>
          <TabsContent value="edit">
            <fieldset
              disabled={!editable}
              className="space-y-4"
              onFocus={(e) => {
                const el = e.target;
                if ((el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) && VARIABLE_FIELD.test(el.name)) {
                  active.current = { name: el.name, el };
                }
              }}
            >
              <Section title="General">
                <div className="grid gap-4 md:grid-cols-2">
                  <FormField label="Template name" htmlFor="name" required error={errors.name?.message}>
                    <Input id="name" {...register("name")} placeholder="e.g. Standard Sales Contract" />
                  </FormField>
                  <FormField label="Document title" htmlFor="title" required error={errors.title?.message} help="Printed at the top, e.g. SALES CONTRACT.">
                    <Input id="title" {...register("title")} />
                  </FormField>
                  <FormField label="Used for" htmlFor="direction" tip="Which trades this template is suggested for.">
                    <Select
                      value={values.direction ?? "any"}
                      onValueChange={(v) => setValue("direction", v as FormValues["direction"], { shouldDirty: true })}
                      disabled={!editable}
                    >
                      <SelectTrigger id="direction" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Purchase &amp; Sales</SelectItem>
                        <SelectItem value="purchase">Purchase trades</SelectItem>
                        <SelectItem value="sales">Sales trades</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormField>
                  <FormField label="Company" htmlFor="companyId" tip="Restrict to one internal company, or leave as any company.">
                    <Select
                      value={values.companyId || ANY_COMPANY}
                      onValueChange={(v) => setValue("companyId", v, { shouldDirty: true })}
                      disabled={!editable}
                    >
                      <SelectTrigger id="companyId" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ANY_COMPANY}>Any company</SelectItem>
                        {(companies ?? []).map((c) => (
                          <SelectItem key={c._id} value={c._id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormField>
                  <FormField label="Description" htmlFor="description" className="md:col-span-2">
                    <Input id="description" {...register("description")} placeholder="When should staff use this template?" />
                  </FormField>
                </div>
              </Section>

              <Section title="Numbering" description="Applied when a contract has no printed contract number on the trade.">
                <div className="grid gap-4 md:grid-cols-3">
                  <FormField
                    label="Numbering format"
                    htmlFor="numberingFormat"
                    required
                    error={errors.numberingFormat?.message}
                    tip="Tokens: {prefix}, {year}, {seq} (running number per prefix and year), {tradeNumber}."
                    className="md:col-span-2"
                  >
                    <Input id="numberingFormat" {...register("numberingFormat")} className="font-mono" />
                  </FormField>
                  <FormField label="Prefix" htmlFor="numberPrefix" error={errors.numberPrefix?.message} help="Blank = system default (Settings).">
                    <Input id="numberPrefix" {...register("numberPrefix")} className="font-mono uppercase" placeholder="CTR" />
                  </FormField>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Example: <span className="font-mono text-foreground">{exampleNumber || "—"}</span>
                </p>
              </Section>

              <Section title="Header & introduction" description="Click a field, then pick a variable on the right to insert it.">
                <div className="grid gap-4">
                  <FormField label="Header text" htmlFor="header" help="Right-hand side of the letterhead (e.g. registration no., contact).">
                    <Textarea id="header" rows={2} {...register("header")} />
                  </FormField>
                  <FormField label="Introduction" htmlFor="intro">
                    <Textarea id="intro" rows={3} {...register("intro")} />
                  </FormField>
                </div>
              </Section>

              <Section
                title="Clauses"
                description="Numbered automatically in the order shown."
                actions={
                  editable && (
                    <Button type="button" size="sm" variant="outline" onClick={() => clauses.append({ heading: "", body: "" })}>
                      <Plus /> Add clause
                    </Button>
                  )
                }
              >
                {errors.clauses?.root?.message && <p className="mb-2 text-xs text-destructive">{errors.clauses.root.message}</p>}
                {errors.clauses?.message && <p className="mb-2 text-xs text-destructive">{errors.clauses.message}</p>}
                <ol className="space-y-3">
                  {clauses.fields.map((field, i) => {
                    const c = values.clauses?.[i];
                    const unknown = extractVariables(`${c?.heading ?? ""} ${c?.body ?? ""}`).filter((n) => !KNOWN_VARIABLES.has(n));
                    return (
                      <li key={field.id} className={cn("rounded-md border p-3", unknown.length > 0 && "border-destructive/50")}>
                        <div className="flex items-start gap-2">
                          <span className="mt-1.5 w-6 shrink-0 text-sm font-semibold text-muted-foreground tabular">{i + 1}.</span>
                          <div className="min-w-0 flex-1 space-y-2">
                            <Input
                              aria-label={`Clause ${i + 1} heading`}
                              placeholder="Heading (e.g. Payment)"
                              {...register(`clauses.${i}.heading`)}
                             
                              aria-invalid={Boolean(errors.clauses?.[i]?.heading) || undefined}
                            />
                            {errors.clauses?.[i]?.heading && (
                              <p className="text-xs text-destructive">{errors.clauses[i]?.heading?.message}</p>
                            )}
                            <Textarea
                              aria-label={`Clause ${i + 1} text`}
                              rows={3}
                              placeholder="Clause wording with {{variables}}"
                              {...register(`clauses.${i}.body`)}
                             
                            />
                            {unknown.length > 0 && (
                              <p className="text-xs text-destructive">Unknown: {unknown.map((u) => `{{${u}}}`).join(", ")}</p>
                            )}
                          </div>
                          {editable && (
                            <div className="flex shrink-0 flex-col gap-1">
                              <Button type="button" size="icon-xs" variant="ghost" aria-label="Move up" disabled={i === 0} onClick={() => clauses.move(i, i - 1)}>
                                <ArrowUp />
                              </Button>
                              <Button
                                type="button"
                                size="icon-xs"
                                variant="ghost"
                                aria-label="Move down"
                                disabled={i === clauses.fields.length - 1}
                                onClick={() => clauses.move(i, i + 1)}
                              >
                                <ArrowDown />
                              </Button>
                              <Button
                                type="button"
                                size="icon-xs"
                                variant="ghost"
                                aria-label="Remove clause"
                                className="text-destructive"
                                disabled={clauses.fields.length === 1}
                                onClick={() => clauses.remove(i)}
                              >
                                <Trash2 />
                              </Button>
                            </div>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </Section>

              <Section
                title="Default clauses"
                description="Suggested into new trades that use this template (packing, documents, arbitration) and reusable wording for bank and shipping terms."
              >
                <div className="grid gap-4 md:grid-cols-2">
                  {(
                    [
                      ["defaultPackingClause", "Packing clause"],
                      ["defaultDocumentsClause", "Documents clause"],
                      ["defaultArbitrationClause", "Arbitration clause"],
                      ["defaultBankClause", "Bank clause"],
                      ["defaultShippingClause", "Shipping clause"],
                    ] as const
                  ).map(([name, label]) => (
                    <FormField key={name} label={label} htmlFor={name}>
                      <Textarea id={name} rows={3} {...register(name)} />
                    </FormField>
                  ))}
                </div>
              </Section>

              <Section title="Footer">
                <FormField label="Footer text" htmlFor="footer" help="Printed at the bottom of every page, next to the page number.">
                  <Textarea id="footer" rows={2} {...register("footer")} />
                </FormField>
              </Section>
            </fieldset>
          </TabsContent>
          <TabsContent value="preview">
            <div className="rounded-lg border bg-muted/40 p-3 sm:p-6">
              <p className="mb-3 text-xs text-muted-foreground">Rendered with sample data. Real contracts use the trade&apos;s stored values.</p>
              <ContractPreview
                data={{
                  contractNumber: exampleNumber || "CTR-0001",
                  version: template?.version ?? 1,
                  status: "preview",
                  snapshot: {
                    title: preview.rendered.title,
                    header: preview.rendered.header,
                    intro: preview.rendered.intro,
                    footer: preview.rendered.footer,
                    clauses: preview.rendered.clauses,
                    variables: SAMPLE_VARIABLES,
                  },
                }}
              />
            </div>
          </TabsContent>
        </Tabs>

        <aside className="space-y-4 lg:sticky lg:top-16 lg:self-start">
          <Section title="Insert variable" description={editable ? "Inserts at the cursor of the last field you clicked." : "Read-only version."}>
            <VariablePicker onInsert={insertVariable} />
          </Section>
          {data && data.versions.length > 0 && (
            <Section title="Versions">
              <ul className="space-y-1.5 text-sm">
                {data.versions.map((v) => (
                  <li key={v._id} className="flex items-center justify-between gap-2">
                    <Link
                      href={`/contract-templates/${v._id}`}
                      className={cn("hover:underline", v._id === template?._id && "font-semibold")}
                    >
                      v{v.version}
                    </Link>
                    <span className="flex items-center gap-1">
                      {v.isDefault && <Star className="size-3 text-primary" aria-label="Default" />}
                      <StatusBadge value={v.status} map={TEMPLATE_STATUS} />
                    </span>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </aside>
      </div>

      {editable && (
        <div className="sticky bottom-0 z-20 -mx-4 border-t bg-background/95 backdrop-blur md:-mx-6">
          <div className="flex flex-wrap items-center justify-end gap-2 px-4 py-2.5 md:px-6">
            <span className="mr-auto text-xs text-muted-foreground">
              {formState.isDirty ? "Unsaved changes" : isNew ? "New draft" : "All changes saved"}
            </span>
            {formState.isDirty ? (
              <ConfirmDialog
                title="Discard unsaved changes?"
                description="Your edits to this template have not been saved."
                confirmLabel="Discard changes"
                destructive
                onConfirm={() => {
                  reset();
                  router.push("/contract-templates");
                }}
                trigger={
                  <Button type="button" variant="ghost" disabled={saving}>
                    Cancel
                  </Button>
                }
              />
            ) : (
              <Button type="button" variant="ghost" onClick={() => router.push("/contract-templates")} disabled={saving}>
                {isNew ? "Cancel" : "Close"}
              </Button>
            )}
            <Button type="submit" variant={isNew ? "default" : "outline"} disabled={saving}>
              {saving ? <Loader2 className="animate-spin" /> : <Save />}
              Save Draft
            </Button>
            {!isNew && (
              <Button
                type="button"
                disabled={saving || preview.unknown.length > 0}
                onClick={handleSubmit((v) => save(v, "activate"))}
              >
                <CheckCircle2 /> Save &amp; Activate
              </Button>
            )}
          </div>
        </div>
      )}
    </form>
  );
}
