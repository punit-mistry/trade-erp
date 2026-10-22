"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Lock } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { EDITABLE_TRADE_STATUSES } from "@/convex/lib/workflow";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/shared/combobox";
import { PageHeader } from "@/components/shared/page-header";
import { PageSkeleton } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { todayIso } from "@/lib/format";
import { TRADE_STATUS } from "@/lib/status";
import { fromTrade, type StepId, type TradeFormValues } from "./form";
import { TradeWizard } from "./trade-wizard";

function parseStep(raw: string | null): StepId | undefined {
  const n = Number(raw);
  return n >= 1 && n <= 5 ? (n as StepId) : undefined;
}

function TemplateStarter() {
  const templates = useQuery(api.tradeTemplates.list);
  const router = useRouter();
  if (!templates || templates.length === 0) return null;
  return (
    <div className="w-full sm:w-72">
      <Combobox
        options={templates.map((t) => ({
          value: t._id,
          label: t.name,
          description: t.sourceTradeNumber ? `From ${t.sourceTradeNumber}` : t.description,
        }))}
        value={undefined}
        onChange={(id) => id && router.push(`/physical-trades/new?template=${id}`)}
        placeholder="Start from a saved template…"
        searchPlaceholder="Search trade templates…"
        clearable={false}
      />
    </div>
  );
}

/** /physical-trades/new — blank, cloned (?cloneFrom=), templated (?template=) or for a counterparty (?counterpartyId=). */
export function NewTradePage() {
  const params = useSearchParams();
  // The source is frozen per wizard instance: after the first autosave the URL is
  // replaced with /physical-trades/<id>/edit (no query), which must not reset the form.
  // A *new* source in the URL (e.g. "Start from template") starts a fresh instance.
  const urlSource = {
    cloneFrom: params.get("cloneFrom") as Id<"trades"> | null,
    templateId: params.get("template") as Id<"tradeTemplates"> | null,
    counterpartyId: params.get("counterpartyId") as Id<"counterparties"> | null,
  };
  const urlKey = `${urlSource.cloneFrom ?? ""}|${urlSource.templateId ?? ""}|${urlSource.counterpartyId ?? ""}`;
  const [source, setSource] = useState(urlSource);
  const [seenKey, setSeenKey] = useState(urlKey);
  const [instance, setInstance] = useState(0);
  if (urlKey !== seenKey) {
    setSeenKey(urlKey);
    if (urlKey !== "||") {
      setSource(urlSource);
      setInstance((i) => i + 1);
    }
  }
  const { cloneFrom, templateId, counterpartyId } = source;

  const cloneSource = useQuery(api.trades.getCloneSource, cloneFrom ? { id: cloneFrom } : "skip");
  const template = useQuery(api.tradeTemplates.get, templateId ? { id: templateId } : "skip");
  const loading = (cloneFrom && cloneSource === undefined) || (templateId && template === undefined);

  // Only read by the wizard on mount (form defaultValues), so recomputing per render is harmless.
  let initialValues: TradeFormValues | null = null;
  if (!loading) {
    const base: TradeFormValues = { tradeDate: todayIso() };
    if (cloneFrom && cloneSource) initialValues = { ...cloneSource.fields, ...base };
    else if (templateId && template) initialValues = { ...template.fields, ...base };
    else if (counterpartyId) initialValues = { ...base, counterpartyId };
    else initialValues = base;
  }

  return (
    <>
      <PageHeader
        title="Book Trade"
        description="Five short steps. Your draft saves automatically, so you can leave and come back."
        back={{ href: "/physical-trades", label: "Physical Trades" }}
        actions={!cloneFrom && !templateId ? <TemplateStarter /> : undefined}
      />
      {!initialValues ? (
        <PageSkeleton />
      ) : (
        <TradeWizard
          key={`${instance}-${cloneFrom ?? ""}-${templateId ?? ""}`}
          initialValues={initialValues}
          cloneFrom={cloneFrom && cloneSource ? { id: cloneFrom, tradeNumber: cloneSource.tradeNumber } : undefined}
          template={templateId && template ? { id: templateId, name: template.name } : undefined}
          applyCounterpartyDefaultsOnMount={Boolean(counterpartyId && !cloneFrom && !templateId)}
          onAddAnother={() => {
            window.history.replaceState(null, "", "/physical-trades/new");
            setSource({ cloneFrom: null, templateId: null, counterpartyId: null });
            setInstance((i) => i + 1);
            window.scrollTo({ top: 0 });
          }}
        />
      )}
    </>
  );
}

/** /physical-trades/[id]/edit — resumes a saved draft. */
export function EditTradePage({ id }: { id: Id<"trades"> }) {
  const data = useQuery(api.trades.get, { id });
  const params = useSearchParams();
  const router = useRouter();
  // Freeze initial values at first load: live updates (our own autosaves) must not reset the form.
  const [initial, setInitial] = useState<TradeFormValues | null>(null);
  if (data && !initial) setInitial(fromTrade(data.trade));

  if (!data || !initial) return <PageSkeleton />;
  const { trade } = data;
  const editable = EDITABLE_TRADE_STATUSES.includes(trade.status);

  return (
    <>
      <PageHeader
        title={<span className="font-mono">{trade.tradeNumber}</span>}
        meta={<StatusBadge value={trade.status} map={TRADE_STATUS} />}
        description={editable ? "Editing draft. Changes save automatically." : undefined}
        back={{ href: `/physical-trades/${id}`, label: "Back to trade" }}
      />
      {!editable ? (
        <div className="mx-auto max-w-lg rounded-lg border bg-card p-6 text-center shadow-xs">
          <Lock className="mx-auto mb-2 size-5 text-muted-foreground" />
          <h2 className="text-base font-semibold">This trade can no longer be edited</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {trade.tradeNumber} is {TRADE_STATUS[trade.status].label.toLowerCase()}. Confirmed, cancelled and closed trades are
            locked so issued contracts and documents stay consistent. Clone it to book a similar trade.
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <Button variant="outline" asChild>
              <Link href={`/physical-trades/${id}`}>View trade</Link>
            </Button>
            <Button onClick={() => router.push(`/physical-trades/new?cloneFrom=${id}`)}>Clone Trade</Button>
          </div>
        </div>
      ) : (
        <TradeWizard
          initialValues={initial}
          initialTradeId={id}
          initialStep={parseStep(params.get("step"))}
          onAddAnother={() => router.push("/physical-trades/new")}
        />
      )}
    </>
  );
}
