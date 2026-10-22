"use client";

import { useMutation } from "convex/react";
import { Loader2 } from "lucide-react";
import { useState, type ReactNode } from "react";
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
import { FormField, NumberInput } from "@/components/shared/form-field";
import { Textarea } from "@/components/ui/textarea";
import { getErrorMessage } from "@/lib/errors";
import { formatMoney } from "@/lib/format";

/**
 * Authorised total-value override (or recalculation back to quantity × price).
 * Server requires `trade.valueOverride` and records the reason in the audit log.
 */
export function ValueOverrideDialog({
  tradeId,
  currency,
  currentValue,
  computedValue,
  trigger,
}: {
  tradeId: Id<"trades">;
  currency?: string;
  currentValue?: number;
  computedValue?: number;
  trigger: ReactNode;
}) {
  const overrideValue = useMutation(api.trades.overrideValue);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"set" | "recalculate">("set");
  const [value, setValue] = useState<number | undefined>(currentValue);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);

  async function submit() {
    if (pending) return;
    setPending(true);
    try {
      await overrideValue({ id: tradeId, mode, totalValue: mode === "set" ? value : undefined, reason });
      toast.success(mode === "set" ? "Total value overridden" : "Total value recalculated");
      setOpen(false);
      setReason("");
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adjust total trade value</DialogTitle>
          <DialogDescription>
            Normally the value is quantity × price. Override only for an agreed lump sum or a historical record. The
            reason is kept in the audit history.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="inline-flex rounded-lg bg-muted p-0.5 text-xs">
            {(["set", "recalculate"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`h-7 rounded-md px-3 font-medium ${mode === m ? "bg-background shadow-xs" : "text-muted-foreground"}`}
              >
                {m === "set" ? "Set a value" : "Recalculate from quantity × price"}
              </button>
            ))}
          </div>
          {mode === "set" ? (
            <FormField label={`Total value${currency ? ` (${currency})` : ""}`} htmlFor="override-value" required>
              <NumberInput id="override-value" value={value} onValueChange={setValue} maxDecimals={2} />
            </FormField>
          ) : (
            <p className="rounded-md bg-muted px-3 py-2 text-sm">
              New value: <strong className="tabular">{formatMoney(computedValue, currency)}</strong>
              {computedValue === undefined && " — enter quantity and price first."}
            </p>
          )}
          <FormField label="Reason" htmlFor="override-reason" required>
            <Textarea
              id="override-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Historical value from signed contract; unit price to be confirmed"
            />
          </FormField>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={
              pending || !reason.trim() || (mode === "set" ? value === undefined : computedValue === undefined)
            }
          >
            {pending && <Loader2 className="animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
