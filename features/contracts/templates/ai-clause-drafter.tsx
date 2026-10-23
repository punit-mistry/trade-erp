"use client";

import { useAction } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { AlertCircle, AlertTriangle, Loader2, Sparkles } from "lucide-react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { FormField } from "@/components/shared/form-field";
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
import { AiUsageNote, errorText, useAiAvailability } from "@/features/ai/ai-shared";
import { useViewer } from "@/hooks/use-viewer";

type Draft = FunctionReturnType<typeof api.ai.draftClause>;

/**
 * "Draft with AI" for the template editor. The draft is shown for review and
 * only added to the template when the user confirms; unknown {{variables}}
 * are flagged because they block template activation.
 */
export function AiClauseDrafter({ onInsert }: { onInsert: (clause: { heading: string; body: string }) => void }) {
  const { can } = useViewer();
  const ai = useAiAvailability();
  const draftClause = useAction(api.ai.draftClause);
  const [open, setOpen] = useState(false);
  const [heading, setHeading] = useState("");
  const [instruction, setInstruction] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);

  if (!can("contractTemplate.manage") || ai === undefined || !ai.status.configured) return null;

  function close(next: boolean) {
    if (running) return;
    setOpen(next);
    if (!next) {
      setDraft(null);
      setError(null);
    }
  }

  async function generate() {
    setRunning(true);
    setError(null);
    try {
      setDraft(await draftClause({ instruction, heading: heading.trim() || undefined }));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setRunning(false);
    }
  }

  function insert() {
    if (!draft) return;
    onInsert({ heading: draft.heading || heading.trim() || "Clause", body: draft.body });
    setInstruction("");
    setHeading("");
    close(false);
  }

  const instructionOk = instruction.trim().length >= 5 && instruction.length <= 1500;

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => setOpen(true)}
        disabled={!ai.available}
        title={ai.reason ?? "Describe a clause and let AI draft the wording"}
      >
        <Sparkles /> Draft with AI
      </Button>
      <Dialog open={open} onOpenChange={close}>
        <DialogContent className="max-h-[90vh] gap-3 overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary" /> Draft a clause with AI
            </DialogTitle>
            <DialogDescription>
              Describe what the clause should say. AI writes neutral commercial wording using only this template&apos;s
              variables. Have your legal team review it before activating the template.
            </DialogDescription>
          </DialogHeader>

          <FormField label="Heading (optional)" htmlFor="ai-clause-heading">
            <Input
              id="ai-clause-heading"
              value={heading}
              onChange={(e) => setHeading(e.target.value)}
              placeholder="e.g. Quality and weight"
              maxLength={120}
              disabled={running}
            />
          </FormField>
          <FormField label="What should it say?" htmlFor="ai-clause-instruction" required>
            <Textarea
              id="ai-clause-instruction"
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              rows={3}
              placeholder="e.g. Quality and weight final at loading port as per independent surveyor's certificate, cost for seller's account."
              disabled={running}
              maxLength={1500}
            />
          </FormField>
          <AiUsageNote />

          {draft && (
            <div className="space-y-2 rounded-lg border bg-muted/30 p-3" aria-live="polite">
              <p className="text-xs font-medium text-muted-foreground">Draft · {draft.model}</p>
              <p className="text-sm font-semibold">{draft.heading || heading || "Clause"}</p>
              <p className="text-sm whitespace-pre-wrap">{draft.body}</p>
              {draft.unknownVariables.length > 0 && (
                <p className="flex items-start gap-1.5 rounded-md bg-warning/10 p-2 text-xs text-warning">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  Uses unknown variables {draft.unknownVariables.map((u) => `{{${u}}}`).join(", ")}. Fix or remove them after
                  adding — the template can&apos;t be activated while they remain.
                </p>
              )}
            </div>
          )}

          {error && (
            <p className="flex items-start gap-1.5 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive" role="alert">
              <AlertCircle className="mt-0.5 size-3.5 shrink-0" /> {error}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => close(false)} disabled={running}>
              Cancel
            </Button>
            <Button
              type="button"
              variant={draft ? "outline" : "default"}
              onClick={() => void generate()}
              disabled={running || !instructionOk || !ai.available}
            >
              {running ? <Loader2 className="animate-spin" /> : <Sparkles />}
              {draft ? "Try again" : "Draft clause"}
            </Button>
            {draft && (
              <Button type="button" onClick={insert} disabled={running}>
                Add to template
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
