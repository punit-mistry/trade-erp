"use client";

import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { TradeStatus } from "@/convex/lib/validators";
import { TRADE_TRANSITIONS } from "@/convex/lib/workflow";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FormField } from "@/components/shared/form-field";
import { useViewer } from "@/hooks/use-viewer";
import { getErrorMessage } from "@/lib/errors";

/** Confirm, then open the Book Trade wizard prefilled from the source trade. */
export function CloneTradeDialog({
  tradeId,
  tradeNumber,
  open,
  onOpenChange,
  trigger,
}: {
  tradeId: Id<"trades">;
  tradeNumber: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: ReactNode;
}) {
  const router = useRouter();
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      trigger={trigger}
      title={`Clone ${tradeNumber}?`}
      description={
        <div className="space-y-2">
          <p>
            A new Book Trade form opens with this trade&apos;s commodity, quantity, price, terms, clauses and bank details
            filled in. Nothing is saved until you make a change or save.
          </p>
          <p>
            The copy gets a new trade number and starts as a <strong>Draft</strong>. Contract numbers, issued documents,
            B/L and dispatch progress are not copied. {tradeNumber} stays unchanged.
          </p>
        </div>
      }
      confirmLabel="Clone Trade"
      onConfirm={() => router.push(`/physical-trades/new?cloneFrom=${tradeId}`)}
    />
  );
}

export function CreateTemplateDialog({
  tradeId,
  tradeNumber,
  open,
  onOpenChange,
}: {
  tradeId: Id<"trades">;
  tradeNumber: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const createFromTrade = useMutation(api.tradeTemplates.createFromTrade);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    try {
      await createFromTrade({ tradeId, name, description: description || undefined });
      toast.success(`Template “${name.trim()}” created. Use it from Book Trade → Start from template.`);
      onOpenChange(false);
      setName("");
      setDescription("");
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent>
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Create template from {tradeNumber}</DialogTitle>
            <DialogDescription>
              Saves this trade&apos;s counterparty, commodity, quantity, price and terms as a reusable starting point.
              Record-specific values (dates, buyer reference, printed contract number, internal notes) are not included.
            </DialogDescription>
          </DialogHeader>
          <FormField label="Template name" htmlFor="tpl-name" required>
            <Input id="tpl-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. TSR-10 CIF Mersin — monthly" maxLength={120} />
          </FormField>
          <FormField label="Description" htmlFor="tpl-desc">
            <Textarea id="tpl-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || name.trim().length < 2}>
              {pending && <Loader2 className="animate-spin" />} Create Template
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const TRANSITION_COPY: Partial<Record<TradeStatus, { description: string; reason?: { label: string; required: boolean } }>> = {
  pending_review: { description: "The trade will be locked for staff edits and sent to a manager for approval." },
  confirmed: {
    description:
      "Confirming locks the commercial terms. The contract, B/L and dispatch are tracked separately and are not marked complete by this.",
  },
  draft: {
    description: "The trade goes back to Draft so the preparer can correct it.",
    reason: { label: "What needs correcting?", required: true },
  },
  cancelled: {
    description: "Cancelled trades are excluded from active contracts and closed-trade metrics. This cannot be undone.",
    reason: { label: "Cancellation reason", required: true },
  },
  closed: {
    description: "Closing marks the trade as commercially complete. It does not mark any documents or checklist items as complete.",
  },
};

/** Status transition buttons allowed for the viewer from the trade's current status. */
export function TradeStatusActions({
  tradeId,
  tradeNumber,
  status,
  blockingCount,
}: {
  tradeId: Id<"trades">;
  tradeNumber: string;
  status: TradeStatus;
  blockingCount: number;
}) {
  const { can } = useViewer();
  const transition = useMutation(api.trades.transition);
  const allowed = TRADE_TRANSITIONS[status].filter((t) => can(t.permission));
  return (
    <>
      {allowed.map((t) => {
        const copy = TRANSITION_COPY[t.to];
        const needsComplete = t.to === "pending_review" || t.to === "confirmed";
        const disabled = needsComplete && blockingCount > 0;
        const destructive = t.to === "cancelled";
        return (
          <ConfirmDialog
            key={t.to}
            trigger={
              <Button
                variant={destructive ? "destructive" : t.to === "confirmed" ? "default" : "outline"}
                size="sm"
                disabled={disabled}
                title={disabled ? `Complete ${blockingCount} required field(s) first` : undefined}
              >
                {t.label}
              </Button>
            }
            title={`${t.label} — ${tradeNumber}?`}
            description={copy?.description}
            confirmLabel={t.label}
            destructive={destructive}
            reason={copy?.reason}
            successMessage={`${tradeNumber}: ${t.label.toLowerCase()} done`}
            onConfirm={(reason) => transition({ id: tradeId, to: t.to, note: reason || undefined })}
          />
        );
      })}
    </>
  );
}

/** Cancel with mandatory reason (used from the listing's More menu). */
export function CancelTradeDialog({
  tradeId,
  tradeNumber,
  open,
  onOpenChange,
}: {
  tradeId: Id<"trades">;
  tradeNumber: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const transition = useMutation(api.trades.transition);
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Cancel ${tradeNumber}?`}
      description={TRANSITION_COPY.cancelled?.description}
      confirmLabel="Cancel Trade"
      destructive
      reason={{ label: "Cancellation reason", required: true }}
      successMessage={`${tradeNumber} cancelled`}
      onConfirm={(reason) => transition({ id: tradeId, to: "cancelled", note: reason })}
    />
  );
}
