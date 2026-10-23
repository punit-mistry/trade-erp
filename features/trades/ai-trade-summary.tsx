"use client";

import { useAction, useQuery } from "convex/react";
import { AlertCircle, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Section } from "@/components/shared/section";
import { AiUsageNote, errorText, RichText, useAiAvailability } from "@/features/ai/ai-shared";
import { formatDateTime } from "@/lib/format";

/**
 * On-demand AI status summary of one trade. The stored summary is shown to
 * everyone who can see the trade and is flagged "outdated" once the trade
 * changes; generating a new one counts against the user's daily AI quota.
 */
export function AiTradeSummary({ tradeId }: { tradeId: Id<"trades"> }) {
  const ai = useAiAvailability();
  const summary = useQuery(api.ai.tradeSummary, { tradeId });
  const summarise = useAction(api.ai.summariseTrade);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Nothing to show when AI was never set up and no summary exists.
  if (ai === undefined || summary === undefined) return null;
  if (!ai.status.configured && !summary) return null;

  async function generate() {
    setRunning(true);
    setError(null);
    try {
      await summarise({ tradeId });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setRunning(false);
    }
  }

  return (
    <Section
      title={
        <span className="inline-flex items-center gap-1.5">
          <Sparkles className="size-3.5 text-primary" /> AI summary
          {summary?.outdated && (
            <Badge variant="outline" className="h-4 border-warning/40 bg-warning/10 px-1.5 text-[10px] text-warning">
              Outdated
            </Badge>
          )}
        </span>
      }
      description={
        summary
          ? summary.outdated
            ? "The trade changed after this summary was written — regenerate it."
            : "Status, gaps and next steps, generated from this trade's data."
          : "Status, gaps and next steps in a few lines."
      }
      actions={
        ai.status.configured && (
          <Button
            type="button"
            size="xs"
            variant={summary && !summary.outdated ? "ghost" : "outline"}
            onClick={() => void generate()}
            disabled={running || !ai.available}
            title={ai.reason ?? undefined}
            aria-label={summary ? "Regenerate AI summary" : "Generate AI summary"}
          >
            {running ? <Loader2 className="animate-spin" /> : summary ? <RefreshCw /> : <Sparkles />}
            {summary ? "Regenerate" : "Generate"}
          </Button>
        )
      }
    >
      <div className="space-y-2 text-sm" aria-live="polite" aria-busy={running}>
        {summary ? (
          <>
            <div className={summary.outdated ? "opacity-70" : undefined}>
              <RichText text={summary.content} />
            </div>
            <p className="text-[11px] text-muted-foreground">
              {summary.generatedByName} · {formatDateTime(summary.generatedAt)} · {summary.model}. AI can be wrong — check
              the figures against the trade.
            </p>
          </>
        ) : running ? (
          <p className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> Reading the trade, contract, B/L and checklist…
          </p>
        ) : (
          <AiUsageNote />
        )}
        {error && (
          <p className="flex items-start gap-1.5 text-xs text-destructive" role="alert">
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" /> {error}
          </p>
        )}
      </div>
    </Section>
  );
}
