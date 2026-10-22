"use client";

import { useMutation } from "convex/react";
import { useState, type ReactNode } from "react";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormField, NumberInput } from "@/components/shared/form-field";
import { LookupCombobox } from "@/components/shared/lookup-combobox";
import { getErrorMessage } from "@/lib/errors";

function nowLocalInput() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

/**
 * Records an FX rate exactly as obtained from an external source. Nothing is
 * fetched or calculated here — the user states the rate, its source and when
 * it applied, and a manager reviews it.
 */
export function RecordFxRateDialog({
  tradeId,
  defaultBase,
  defaultQuote,
  trigger,
}: {
  tradeId?: Id<"trades">;
  defaultBase?: string;
  defaultQuote?: string;
  trigger?: ReactNode;
}) {
  const record = useMutation(api.fx.record);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [base, setBase] = useState<string | undefined>(defaultBase);
  const [quote, setQuote] = useState<string | undefined>(defaultQuote);
  const [rate, setRate] = useState<number | undefined>();
  const [source, setSource] = useState("");
  const [when, setWhen] = useState(nowLocalInput);
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  function reset() {
    setBase(defaultBase);
    setQuote(defaultQuote);
    setRate(undefined);
    setSource("");
    setWhen(nowLocalInput());
    setNotes("");
    setErrors({});
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    const next: Record<string, string> = {};
    if (!base) next.base = "Select the base currency.";
    if (!quote) next.quote = "Select the quote currency.";
    if (base && quote && base === quote) next.quote = "Quote currency must differ from base.";
    if (rate === undefined || rate <= 0) next.rate = "Enter a rate greater than zero.";
    if (source.trim().length < 2) next.source = "State where this rate came from.";
    const ts = new Date(when).getTime();
    if (!when || Number.isNaN(ts)) next.when = "Enter when the rate applies.";
    setErrors(next);
    if (Object.keys(next).length) return;
    setPending(true);
    try {
      await record({
        baseCurrency: base!,
        quoteCurrency: quote!,
        rate: rate!,
        source: source.trim(),
        rateTimestamp: ts,
        tradeId,
        notes: notes.trim() || undefined,
      });
      toast.success("FX rate recorded — awaiting review");
      setOpen(false);
      reset();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (pending) return;
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" variant="outline">
            <Plus /> Record FX rate
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Record FX rate</DialogTitle>
            <DialogDescription>
              Enter the rate exactly as quoted by your source (bank deal confirmation, reference rate, etc.). The system
              does not look up or calculate exchange rates. A manager must verify it before it is relied on.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Base currency" required error={errors.base} htmlFor="fx-base">
              <LookupCombobox id="fx-base" kind="currency" value={base} onChange={setBase} invalid={!!errors.base} />
            </FormField>
            <FormField label="Quote currency" required error={errors.quote} htmlFor="fx-quote">
              <LookupCombobox id="fx-quote" kind="currency" value={quote} onChange={setQuote} invalid={!!errors.quote} />
            </FormField>
          </div>
          <FormField
            label="Rate"
            required
            htmlFor="fx-rate"
            error={errors.rate}
            help={base && quote ? `1 ${base} = ? ${quote}` : "Units of quote currency per 1 unit of base currency."}
          >
            <NumberInput id="fx-rate" value={rate} onValueChange={setRate} maxDecimals={8} aria-invalid={!!errors.rate} />
          </FormField>
          <FormField label="Source" required htmlFor="fx-source" error={errors.source} help="e.g. HDFC deal confirmation #4471">
            <Input id="fx-source" value={source} onChange={(e) => setSource(e.target.value)} maxLength={200} />
          </FormField>
          <FormField label="Rate date & time" required htmlFor="fx-when" error={errors.when}>
            <Input id="fx-when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
          </FormField>
          <FormField label="Notes" htmlFor="fx-notes">
            <Textarea id="fx-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              Record rate
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
