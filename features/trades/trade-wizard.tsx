"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useConvex, useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useForm, useWatch, type Resolver } from "react-hook-form";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  CloudOff,
  Copy,
  FileSignature,
  Loader2,
  Plus,
  Save,
  Send,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { applyDefaults, defaultsFromCompany, defaultsFromCounterparty, defaultsFromTemplate, markOverridden } from "@/convex/lib/inheritance";
import { computeTradeValue } from "@/convex/lib/money";
import { validateTrade } from "@/convex/lib/tradeValidation";
import type { TradeFields } from "@/convex/lib/validators";
import { EDITABLE_TRADE_STATUSES } from "@/convex/lib/workflow";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useUnsavedChangesWarning } from "@/hooks/use-unsaved-changes";
import { useViewer } from "@/hooks/use-viewer";
import { getErrorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { FIELD_STEP, STEPS, toTradeFields, tradeFormSchema, type StepId, type TradeFormValues } from "./form";
import { BasicsStep } from "./steps/basics-step";
import { ContractStep } from "./steps/contract-step";
import { QuantityStep } from "./steps/quantity-step";
import { ReviewStep } from "./steps/review-step";
import { TermsStep } from "./steps/terms-step";
import { AiTradeImport } from "./ai-trade-import";
import { TradeSummaryCard } from "./trade-summary-card";
import { useTradeAutosave, type SaveStatus } from "./use-trade-autosave";
import { WizardContext, type InheritSource, type TradeMeta, type WizardContextValue } from "./wizard-context";

const STEP_FIELDS: Record<StepId, (keyof TradeFields)[]> = { 1: [], 2: [], 3: [], 4: [], 5: [] };
for (const [field, step] of Object.entries(FIELD_STEP)) {
  if (field !== "totalValue" && step) STEP_FIELDS[step].push(field as keyof TradeFields);
}

/** Inherited values that depend on which side we play — re-derived when the direction changes. */
const DIRECTION_FIELDS: (keyof TradeFields)[] = ["sellerBankDetails", "buyerBankDetails", "consignee", "notifyParty", "alsoNotifyParty", "freightPayableBy"];

export type TradeWizardProps = {
  initialValues: TradeFormValues;
  initialTradeId?: Id<"trades">;
  initialStep?: StepId;
  cloneFrom?: { id: Id<"trades">; tradeNumber: string };
  template?: { id: Id<"tradeTemplates">; name: string };
  /** Apply the preselected counterparty's defaults on mount (e.g. `?counterpartyId=`). */
  applyCounterpartyDefaultsOnMount?: boolean;
  onAddAnother: () => void;
};

export function TradeWizard(props: TradeWizardProps) {
  const { initialValues, initialTradeId, cloneFrom, template } = props;
  const router = useRouter();
  const convex = useConvex();
  const { can } = useViewer();
  const transition = useMutation(api.trades.transition);

  const form = useForm<TradeFormValues>({
    defaultValues: initialValues,
    resolver: zodResolver(tradeFormSchema) as unknown as Resolver<TradeFormValues>,
    mode: "onChange",
  });

  const [step, setStep] = useState<StepId>(props.initialStep ?? 1);
  const [attempted, setAttempted] = useState<Set<StepId>>(
    () => new Set<StepId>(props.initialStep === 5 ? [1, 2, 3, 4, 5] : []),
  );
  const [inheritSource, setInheritSource] = useState<Record<string, InheritSource>>({});
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const topRef = useRef<HTMLDivElement>(null);

  const getFields = useCallback(() => toTradeFields(form.getValues()), [form]);
  const onCreated = useCallback((id: Id<"trades">) => {
    // Keep the wizard mounted but make refresh / re-login restore this draft.
    window.history.replaceState(null, "", `/physical-trades/${id}/edit`);
  }, []);
  const autosave = useTradeAutosave({
    initialTradeId,
    initialFields: useMemo(() => toTradeFields(initialValues), [initialValues]),
    cloneFromId: cloneFrom?.id,
    templateId: template?.id,
    getFields,
    onCreated,
  });
  const { schedule } = autosave;
  useUnsavedChangesWarning(autosave.hasUnsavedChanges);

  // Live server state of the trade (value flags, status) once it exists.
  const live = useQuery(api.trades.get, autosave.tradeId ? { id: autosave.tradeId } : "skip");
  const meta: TradeMeta = {
    tradeId: autosave.tradeId,
    tradeNumber: live?.trade.tradeNumber ?? autosave.tradeNumber,
    status: live?.trade.status ?? (autosave.tradeId ? "draft" : undefined),
    totalValue: live?.trade.totalValue,
    valueOverridden: live?.trade.valueOverridden,
    valueOverrideReason: live?.trade.valueOverrideReason,
    priceNeedsValidation: live?.trade.priceNeedsValidation,
    reviewNote: live?.trade.reviewNote,
  };
  const locked = meta.status !== undefined && !EDITABLE_TRADE_STATUSES.includes(meta.status);

  // Every change (user or defaults) schedules an autosave; user edits drop the "inherited" marker.
  useEffect(
    () =>
      form.subscribe({
        formState: { values: true },
        callback: ({ name, type }) => {
          if (!name || name === "inheritedFields") return;
          if (type === "change") {
            const inherited = form.getValues("inheritedFields");
            if (inherited?.includes(name)) form.setValue("inheritedFields", markOverridden(inherited, name));
          }
          schedule();
        },
      }),
    [form, schedule],
  );

  const values = useWatch({ control: form.control });
  const stored = meta.valueOverridden || meta.priceNeedsValidation;
  const issues = useMemo(
    () =>
      validateTrade({
        ...toTradeFields(values),
        totalValue: stored ? meta.totalValue : computeTradeValue(values.quantity, values.pricePerUom),
        valueOverridden: meta.valueOverridden,
        priceNeedsValidation: meta.priceNeedsValidation,
      }),
    [values, stored, meta.totalValue, meta.valueOverridden, meta.priceNeedsValidation],
  );
  const blocking = issues.filter((i) => i.severity === "error");
  const errors = form.formState.errors;

  // ------------------------------------------------------------- defaults
  const applySuggested = useCallback(
    (suggested: Partial<TradeFields>, source: InheritSource) => {
      const { patch, inheritedFields } = applyDefaults(form.getValues(), suggested);
      const keys = Object.keys(patch) as (keyof TradeFields)[];
      for (const key of keys) {
        form.setValue(key, patch[key] as never, { shouldDirty: true, shouldValidate: true });
      }
      form.setValue("inheritedFields", inheritedFields);
      if (keys.length) setInheritSource((prev) => ({ ...prev, ...Object.fromEntries(keys.map((k) => [k, source])) }));
      return keys.length;
    },
    [form],
  );

  /** Clears values previously inherited from a given source kind (e.g. when switching counterparty). */
  const clearInherited = useCallback(
    (predicate: (field: keyof TradeFields) => boolean) => {
      const inherited = form.getValues("inheritedFields") ?? [];
      const remove = inherited.filter((f) => predicate(f as keyof TradeFields));
      for (const f of remove) form.setValue(f as keyof TradeFields, undefined as never, { shouldDirty: true });
      form.setValue(
        "inheritedFields",
        inherited.filter((f) => !remove.includes(f)),
      );
    },
    [form],
  );

  const applyCounterparty = useCallback(
    async (id: Id<"counterparties">, announce: boolean) => {
      try {
        const cp = await convex.query(api.counterparties.get, { id });
        const n = applySuggested(defaultsFromCounterparty(cp, form.getValues("direction")), { kind: "counterparty", label: cp.name });
        if (announce && n > 0) toast.success(`Applied ${n} saved default${n === 1 ? "" : "s"} from ${cp.name}`);
      } catch (e) {
        toast.error(getErrorMessage(e, "Could not load counterparty defaults."));
      }
    },
    [convex, applySuggested, form],
  );

  const applyCompany = useCallback(
    async (id: Id<"companies">) => {
      try {
        const company = await convex.query(api.companies.get, { id });
        applySuggested(defaultsFromCompany(company, form.getValues("direction")), { kind: "company", label: company.name });
      } catch (e) {
        toast.error(getErrorMessage(e, "Could not load company defaults."));
      }
    },
    [convex, applySuggested, form],
  );

  const ctxValue: WizardContextValue = {
    form,
    meta,
    issues,
    can,
    goTo: (s) => {
      setStep(s);
      topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    },
    setField: (name, value) => {
      form.setValue(name, value as never, { shouldDirty: true, shouldValidate: true });
      const inherited = form.getValues("inheritedFields");
      if (inherited?.includes(name)) form.setValue("inheritedFields", markOverridden(inherited, name));
    },
    inheritedFrom: (name) => {
      const inherited = values.inheritedFields ?? [];
      if (!inherited.includes(name)) return null;
      return inheritSource[name] ?? { kind: "counterparty", label: "saved default" };
    },
    errorFor: (name) => {
      const formatError = name !== "totalValue" ? errors[name]?.message : undefined;
      if (typeof formatError === "string") return formatError;
      const s = FIELD_STEP[name];
      if (!s || !attempted.has(s)) return undefined;
      return issues.find((i) => i.field === name && i.severity === "error")?.message;
    },
    onCounterpartySelected: async (id) => {
      clearInherited((f) => inheritSource[f]?.kind === "counterparty");
      if (id) await applyCounterparty(id, true);
    },
    onCompanySelected: async (id) => {
      clearInherited((f) => inheritSource[f]?.kind === "company");
      if (id) await applyCompany(id);
    },
    onTemplateSelected: async (id) => {
      clearInherited((f) => inheritSource[f]?.kind === "template");
      if (!id) return;
      try {
        const res = await convex.query(api.contractTemplates.get, { id });
        applySuggested(defaultsFromTemplate(res.template), { kind: "template", label: res.template.name });
      } catch (e) {
        toast.error(getErrorMessage(e, "Could not load template clauses."));
      }
    },
    onDirectionChanged: async (direction) => {
      // Bank details and B/L parties depend on which side we play — re-derive inherited ones.
      clearInherited((f) => DIRECTION_FIELDS.includes(f));
      // Only sales are linked to a back-to-back purchase, and only sales have a sales basis.
      if (direction !== "sales") {
        if (form.getValues("purchaseTradeId")) form.setValue("purchaseTradeId", undefined, { shouldDirty: true });
        if (form.getValues("salesBasis")) form.setValue("salesBasis", undefined, { shouldDirty: true });
      }
      const { counterpartyId, companyId } = form.getValues();
      if (counterpartyId) await applyCounterparty(counterpartyId, false);
      if (companyId) await applyCompany(companyId);
    },
    reapplyCounterpartyDefaults: async () => {
      const id = form.getValues("counterpartyId");
      if (id) await applyCounterparty(id, true);
    },
  };

  // ------------------------------------------------------- mount defaults
  const companies = useQuery(api.companies.listActive);
  const mountDone = useRef(false);
  useEffect(() => {
    if (mountDone.current || companies === undefined) return;
    mountDone.current = true;
    const v = form.getValues();
    if (!v.companyId && !initialTradeId) {
      const def = companies.find((c) => c.isDefault) ?? companies[0];
      if (def) {
        form.setValue("companyId", def._id);
        // One-time mount default; applyCompany only sets state after awaiting the company query.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void applyCompany(def._id);
      }
    }
    if (props.applyCounterpartyDefaultsOnMount && v.counterpartyId) void applyCounterparty(v.counterpartyId, true);
  }, [companies, form, initialTradeId, applyCompany, applyCounterparty, props.applyCounterpartyDefaultsOnMount]);

  // ------------------------------------------------------------ actions
  async function validateFormat(): Promise<boolean> {
    const ok = await form.trigger();
    if (!ok) {
      const firstField = Object.keys(form.formState.errors)[0] as keyof TradeFields | undefined;
      const s = firstField ? FIELD_STEP[firstField] : undefined;
      if (s) setStep(s);
      toast.error("Please correct the highlighted fields.");
    }
    return ok;
  }

  async function run(key: string, fn: () => Promise<void>) {
    if (pendingAction) return;
    setPendingAction(key);
    try {
      await fn();
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setPendingAction(null);
    }
  }

  const saveDraft = () =>
    run("save", async () => {
      if (!(await validateFormat())) return;
      await autosave.save();
      toast.success("Draft saved");
    });

  const saveAndAddAnother = () =>
    run("another", async () => {
      if (!(await validateFormat())) return;
      await autosave.save();
      toast.success("Draft saved — starting a new trade");
      props.onAddAnother();
    });

  const saveAndPreview = () =>
    run("preview", async () => {
      if (!(await validateFormat())) return;
      const id = await autosave.save();
      router.push(`/physical-trades/${id}?tab=contract`);
    });

  const moveTo = (to: "pending_review" | "confirmed") =>
    run(to, async () => {
      setAttempted(new Set<StepId>([1, 2, 3, 4, 5]));
      if (!(await validateFormat())) return;
      if (blocking.length > 0) {
        toast.error("Complete the required fields first.");
        return;
      }
      const id = await autosave.save();
      await transition({ id, to });
      toast.success(to === "confirmed" ? "Trade confirmed" : "Trade submitted for review");
      router.push(`/physical-trades/${id}`);
    });

  async function next() {
    const ok = await form.trigger(STEP_FIELDS[step]);
    setAttempted((prev) => new Set(prev).add(step));
    if (!ok) {
      toast.error("Please correct the highlighted fields.");
      return;
    }
    ctxValue.goTo(Math.min(5, step + 1) as StepId);
  }

  const leaveHref = autosave.tradeId ? `/physical-trades/${autosave.tradeId}` : "/physical-trades";
  const busy = pendingAction !== null;

  return (
    <WizardContext.Provider value={ctxValue}>
      <div ref={topRef} className="scroll-mt-20" />
      {cloneFrom && (
        <Banner icon={Copy} tone="info">
          Copied from <strong>{cloneFrom.tradeNumber}</strong>. Update the fields that changed — the original trade is not affected,
          and the copy gets a new trade number, contract number and a fresh workflow.
        </Banner>
      )}
      {template && (
        <Banner icon={Copy} tone="info">
          Started from trade template <strong>{template.name}</strong>. Review the pre-filled terms before saving.
        </Banner>
      )}
      {meta.reviewNote && meta.status === "draft" && (
        <Banner icon={AlertCircle} tone="warning">
          Returned for correction: {meta.reviewNote}
        </Banner>
      )}
      {locked && (
        <Banner icon={AlertCircle} tone="warning">
          This trade is now {meta.status?.replace("_", " ")} and can no longer be edited. Changes here will not be saved.
        </Banner>
      )}

      <AiTradeImport />
      <Stepper step={step} onStep={ctxValue.goTo} attempted={attempted} issues={issues} />

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px] xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="order-2 min-w-0 rounded-lg border bg-card p-4 shadow-xs md:p-6 lg:order-1">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (step < 5) void next();
            }}
            noValidate
          >
            {step === 1 && <BasicsStep />}
            {step === 2 && <QuantityStep />}
            {step === 3 && <TermsStep />}
            {step === 4 && <ContractStep />}
            {step === 5 && <ReviewStep />}
            <button type="submit" hidden aria-hidden tabIndex={-1} />
          </form>
        </div>
        <div className="order-1 lg:order-2" data-tour="wizard-summary">
          <TradeSummaryCard />
        </div>
      </div>

      {/* Sticky action bar */}
      <div className="sticky bottom-0 z-10 -mx-4 mt-4 border-t bg-background/95 px-4 py-3 shadow-[0_-6px_16px_-10px_rgb(15_23_42/0.25)] backdrop-blur md:-mx-6 md:px-6" data-tour="wizard-actions">
        <div className="flex flex-wrap items-center gap-2">
          <CancelButton
            dirty={autosave.hasUnsavedChanges}
            hasDraft={Boolean(autosave.tradeId)}
            disabled={busy}
            onLeave={() => router.push(leaveHref)}
          />
          <SaveIndicator status={autosave.status} error={autosave.error} onRetry={() => void autosave.save().catch(() => undefined)} />
          <span className="hidden text-xs text-muted-foreground tabular md:inline">· Step {step} of {STEPS.length}</span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {step > 1 && (
              <Button type="button" variant="outline" onClick={() => ctxValue.goTo((step - 1) as StepId)} disabled={busy}>
                <ArrowLeft /> Back
              </Button>
            )}
            {step < 5 ? (
              <>
                <Button type="button" variant="outline" onClick={saveDraft} disabled={busy || locked}>
                  {pendingAction === "save" ? <Loader2 className="animate-spin" /> : <Save />} Save Draft
                </Button>
                <Button type="button" onClick={() => void next()} disabled={busy}>
                  Next: {STEPS[step as 1 | 2 | 3 | 4].short} <ArrowRight />
                </Button>
              </>
            ) : (
              <>
                <Button type="button" variant="outline" onClick={saveDraft} disabled={busy || locked}>
                  {pendingAction === "save" ? <Loader2 className="animate-spin" /> : <Save />} Save Draft
                </Button>
                <Button type="button" variant="outline" onClick={saveAndAddAnother} disabled={busy || locked}>
                  {pendingAction === "another" ? <Loader2 className="animate-spin" /> : <Plus />} Save & Add Another
                </Button>
                <Button type="button" variant="outline" onClick={saveAndPreview} disabled={busy || locked}>
                  {pendingAction === "preview" ? <Loader2 className="animate-spin" /> : <FileSignature />} Save & Preview Contract
                </Button>
                {can("trade.confirm") ? (
                  <Button type="button" onClick={() => moveTo("confirmed")} disabled={busy || locked || blocking.length > 0}>
                    {pendingAction === "confirmed" ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Confirm Trade
                  </Button>
                ) : null}
                {meta.status !== "pending_review" && (
                  <Button
                    type="button"
                    variant={can("trade.confirm") ? "outline" : "default"}
                    onClick={() => moveTo("pending_review")}
                    disabled={busy || locked || blocking.length > 0}
                  >
                    {pendingAction === "pending_review" ? <Loader2 className="animate-spin" /> : <Send />} Submit for Review
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </WizardContext.Provider>
  );
}

function Banner({
  icon: Icon,
  tone,
  children,
}: {
  icon: typeof Copy;
  tone: "info" | "warning";
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "mb-3 flex items-start gap-2 rounded-lg border px-3 py-2 text-sm",
        tone === "info" ? "border-info/30 bg-info/10" : "border-warning/40 bg-warning/10",
      )}
      role="status"
    >
      <Icon className={cn("mt-0.5 size-4 shrink-0", tone === "info" ? "text-info" : "text-warning")} />
      <div>{children}</div>
    </div>
  );
}

function Stepper({
  step,
  onStep,
  attempted,
  issues,
}: {
  step: StepId;
  onStep: (s: StepId) => void;
  attempted: Set<StepId>;
  issues: { step: number; severity: string }[];
}) {
  return (
    <nav aria-label="Booking steps" data-tour="wizard-steps" className="space-y-2">
      <ol className="flex gap-1 overflow-x-auto rounded-lg border bg-card p-1 shadow-xs">
        {STEPS.map((s) => {
          const id = s.id as StepId;
          const hasError = attempted.has(id) && issues.some((i) => i.step === id && i.severity === "error");
          const complete = attempted.has(id) && !hasError && id !== step;
          const current = id === step;
          return (
            <li key={s.id} className="min-w-0 flex-1">
              <button
                type="button"
                onClick={() => onStep(id)}
                aria-current={current ? "step" : undefined}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
                  current && "bg-accent text-accent-foreground",
                )}
              >
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular",
                    current && "border-primary bg-primary text-primary-foreground",
                    complete && "border-success bg-success text-primary-foreground",
                    hasError && "border-destructive bg-destructive text-primary-foreground",
                  )}
                >
                  {hasError ? "!" : complete ? <Check className="size-3.5" /> : s.id}
                </span>
                <span className={cn("truncate font-medium", !current && "text-muted-foreground", "hidden sm:inline")}>{s.title}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <div className="flex items-start justify-between gap-3 px-1">
        <div className="min-w-0">
          <p className="text-sm font-semibold">
            <span className="text-muted-foreground tabular">Step {step} of {STEPS.length} · </span>
            {STEPS[step - 1].title}
          </p>
          <p className="text-xs text-muted-foreground">{STEPS[step - 1].hint}</p>
        </div>
        <div
          className="mt-1.5 h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-muted sm:w-40"
          role="progressbar"
          aria-label="Booking progress"
          aria-valuemin={1}
          aria-valuemax={STEPS.length}
          aria-valuenow={step}
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-300 motion-reduce:transition-none"
            style={{ width: `${(step / STEPS.length) * 100}%` }}
          />
        </div>
      </div>
    </nav>
  );
}

function SaveIndicator({ status, error, onRetry }: { status: SaveStatus; error: string | null; onRetry: () => void }) {
  if (status === "idle") return <span className="text-xs text-muted-foreground">Not saved yet</span>;
  if (status === "pending" || status === "saving")
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">
        <Loader2 className="size-3.5 animate-spin" /> Saving…
      </span>
    );
  if (status === "error")
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-destructive" aria-live="assertive" title={error ?? undefined}>
        <CloudOff className="size-3.5" /> Unable to save{error ? `: ${error}` : ""}
        <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" onClick={onRetry}>
          Retry
        </Button>
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-success" aria-live="polite">
      <CheckCircle2 className="size-3.5" /> Saved
    </span>
  );
}

function CancelButton({
  dirty,
  hasDraft,
  disabled,
  onLeave,
}: {
  dirty: boolean;
  hasDraft: boolean;
  disabled: boolean;
  onLeave: () => void;
}) {
  if (!dirty)
    return (
      <Button type="button" variant="ghost" onClick={onLeave} disabled={disabled}>
        <X /> {hasDraft ? "Close" : "Cancel"}
      </Button>
    );
  return (
    <ConfirmDialog
      trigger={
        <Button type="button" variant="ghost" disabled={disabled}>
          <X /> Cancel
        </Button>
      }
      title="Leave with unsaved changes?"
      description={
        hasDraft
          ? "Your latest edits have not been saved yet. The previously saved draft is kept."
          : "This trade has not been saved. Leaving will discard what you entered."
      }
      confirmLabel="Discard & leave"
      destructive
      onConfirm={onLeave}
    />
  );
}
