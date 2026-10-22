"use client";

import { useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getErrorMessage } from "@/lib/errors";

/**
 * Confirmation for destructive / irreversible actions. Keeps the dialog open
 * and shows a pending state until `onConfirm` resolves; errors are toasted.
 * With `reason`, a reason textarea is shown (and required when `reason.required`).
 */
export function ConfirmDialog({
  trigger,
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  destructive = false,
  reason,
  successMessage,
  onConfirm,
  children,
}: {
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  reason?: { label: string; required?: boolean; placeholder?: string };
  successMessage?: string;
  onConfirm: (reason: string) => Promise<unknown> | unknown;
  children?: ReactNode;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = open ?? internalOpen;
  const setOpen = (o: boolean) => {
    if (!o) setText("");
    onOpenChange?.(o);
    if (open === undefined) setInternalOpen(o);
  };
  const [pending, setPending] = useState(false);
  const [text, setText] = useState("");
  const reasonMissing = reason?.required && text.trim() === "";

  async function handleConfirm() {
    if (pending || reasonMissing) return;
    setPending(true);
    try {
      await onConfirm(text.trim());
      if (successMessage) toast.success(successMessage);
      setOpen(false);
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setPending(false);
    }
  }

  return (
    <AlertDialog open={isOpen} onOpenChange={(o) => !pending && setOpen(o)}>
      {trigger && <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription asChild><div>{description}</div></AlertDialogDescription>}
        </AlertDialogHeader>
        {children}
        {reason && (
          <div className="space-y-1.5">
            <Label htmlFor="confirm-reason">
              {reason.label}
              {reason.required && <span className="text-destructive"> *</span>}
            </Label>
            <Textarea
              id="confirm-reason"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={reason.placeholder}
              rows={3}
            />
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <Button
            variant={destructive ? "destructive" : "default"}
            onClick={handleConfirm}
            disabled={pending || reasonMissing}
          >
            {pending && <Loader2 className="animate-spin" />}
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
