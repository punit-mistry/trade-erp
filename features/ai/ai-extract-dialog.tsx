"use client";

import { AlertCircle, Loader2, Sparkles } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { AiUsageNote, confidenceLabel, errorText, useAiAvailability } from "./ai-shared";

const MAX_CHARS = 8000;

/** One reviewable suggestion. `choices` turns the row into a pick-one (e.g. matching a supplier). */
export type ExtractRow = {
  key: string;
  label: string;
  /** What the AI read in the text. */
  found: string;
  confidence: number;
  /** Shown instead of a checkbox when the value can't be applied (e.g. unknown unit). */
  blockedReason?: string;
  /** Replaces the current value — shown so the user knows what they'd lose. */
  current?: string;
  choices?: { value: string; label: string; hint?: string }[];
  /** Pre-selected choice value (only when the match is strong). */
  defaultChoice?: string;
};

/** Selected rows → chosen value ("" for plain rows, the choice value for pick-one rows). */
export type ExtractSelection = Record<string, string>;

export function AiExtractDialog({
  open,
  onOpenChange,
  title,
  description,
  placeholder,
  extract,
  onApply,
  applyLabel = "Apply selected",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  placeholder: string;
  extract: (text: string) => Promise<{ rows: ExtractRow[]; model: string; dropped: number }>;
  onApply: (selection: ExtractSelection) => Promise<void> | void;
  applyLabel?: string;
}) {
  const ai = useAiAvailability();
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<"input" | "running" | "review" | "applying">("input");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ rows: ExtractRow[]; model: string; dropped: number } | null>(null);
  const [selection, setSelection] = useState<ExtractSelection>({});

  function reset() {
    setPhase("input");
    setError(null);
    setResult(null);
    setSelection({});
  }

  function close(next: boolean) {
    if (phase === "running" || phase === "applying") return;
    onOpenChange(next);
    if (!next) {
      reset();
      setText("");
    }
  }

  async function run() {
    setPhase("running");
    setError(null);
    try {
      const res = await extract(text);
      setResult(res);
      // Pre-tick confident suggestions only; weak ones stay for the user to opt into.
      const initial: ExtractSelection = {};
      for (const row of res.rows) {
        if (row.blockedReason) continue;
        if (row.choices) {
          if (row.defaultChoice) initial[row.key] = row.defaultChoice;
        } else if (row.confidence >= 0.6) initial[row.key] = "";
      }
      setSelection(initial);
      setPhase("review");
    } catch (e) {
      setError(errorText(e));
      setPhase("input");
    }
  }

  async function apply() {
    setPhase("applying");
    try {
      await onApply(selection);
      close(false);
    } catch (e) {
      setError(errorText(e));
      setPhase("review");
    }
  }

  const tooShort = text.trim().length < 10;
  const tooLong = text.length > MAX_CHARS;
  const selectedCount = Object.keys(selection).length;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[90vh] gap-3 overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" /> {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {phase === "input" || phase === "running" ? (
          <div className="space-y-2">
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={placeholder}
              rows={10}
              className="max-h-80 font-mono text-xs"
              disabled={phase === "running" || ai?.available === false}
              aria-label="Text to read"
              autoFocus
            />
            <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
              <AiUsageNote />
              <span className={cn("tabular", tooLong && "font-medium text-destructive")}>
                {text.length.toLocaleString()} / {MAX_CHARS.toLocaleString()}
              </span>
            </div>
          </div>
        ) : (
          result && (
            <ReviewList
              rows={result.rows}
              selection={selection}
              onChange={setSelection}
              disabled={phase === "applying"}
            />
          )
        )}

        {result && phase !== "input" && phase !== "running" && (
          <p className="text-[11px] text-muted-foreground">
            Read by {result.model}.{" "}
            {result.dropped > 0 &&
              `${result.dropped} value${result.dropped === 1 ? " was" : "s were"} ignored because they didn't look valid. `}
            Nothing is saved until you apply and then save the form yourself.
          </p>
        )}

        {error && (
          <p className="flex items-start gap-1.5 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive" role="alert">
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" /> {error}
          </p>
        )}

        <DialogFooter>
          {phase === "review" || phase === "applying" ? (
            <>
              <Button variant="ghost" onClick={reset} disabled={phase === "applying"}>
                Start over
              </Button>
              <Button onClick={() => void apply()} disabled={selectedCount === 0 || phase === "applying"}>
                {phase === "applying" && <Loader2 className="animate-spin" />} {applyLabel}
                {selectedCount > 0 && ` (${selectedCount})`}
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => close(false)} disabled={phase === "running"}>
                Cancel
              </Button>
              <Button
                onClick={() => void run()}
                disabled={phase === "running" || tooShort || tooLong || ai?.available !== true}
                title={ai?.reason ?? undefined}
              >
                {phase === "running" ? <Loader2 className="animate-spin" /> : <Sparkles />}
                {phase === "running" ? "Reading…" : "Read with AI"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const TONE: Record<"high" | "medium" | "low", string> = {
  high: "border-success/40 bg-success/10 text-success",
  medium: "border-warning/40 bg-warning/10 text-warning",
  low: "border-destructive/30 bg-destructive/5 text-destructive",
};

function ReviewList({
  rows,
  selection,
  onChange,
  disabled,
}: {
  rows: ExtractRow[];
  selection: ExtractSelection;
  onChange: (s: ExtractSelection) => void;
  disabled: boolean;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border bg-muted/40 p-4 text-sm">
        <p className="font-medium">Nothing usable was found</p>
        <p className="mt-1 text-xs text-muted-foreground">
          The text didn&apos;t contain details the AI could read with confidence. Start over with more of the message.
        </p>
      </div>
    );
  }
  const toggle = (key: string, value: string | null) => {
    const next = { ...selection };
    if (value === null) delete next[key];
    else next[key] = value;
    onChange(next);
  };
  return (
    <div className="divide-y rounded-lg border">
      <p className="bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        Tick the suggestions to use. Low-confidence values are left unticked.
      </p>
      {rows.map((row) => {
        const conf = confidenceLabel(row.confidence);
        const checked = row.key in selection;
        const id = `ai-row-${row.key}`;
        return (
          <div key={row.key} className="flex items-start gap-3 px-3 py-2.5 text-sm">
            {row.blockedReason ? (
              <span className="mt-0.5 size-4 shrink-0" aria-hidden />
            ) : (
              <Checkbox
                id={id}
                checked={checked}
                disabled={disabled}
                onCheckedChange={(v) => toggle(row.key, v ? (row.choices ? (row.defaultChoice ?? row.choices[0]?.value ?? "") : "") : null)}
                className="mt-0.5"
                aria-label={`Use ${row.label}`}
              />
            )}
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
                  {row.label}
                </label>
                <Badge variant="outline" className={cn("h-4 px-1.5 text-[10px]", TONE[conf.tone])}>
                  {conf.label} confidence
                </Badge>
              </div>
              <p className="break-words font-medium">{row.found}</p>
              {row.current && !row.blockedReason && (
                <p className="text-[11px] text-muted-foreground">Replaces: {row.current}</p>
              )}
              {row.blockedReason && <p className="text-[11px] text-warning">{row.blockedReason}</p>}
              {row.choices && !row.blockedReason && (
                <select
                  className="mt-1 h-8 w-full rounded-md border bg-background px-2 text-sm disabled:opacity-50"
                  value={selection[row.key] ?? ""}
                  disabled={disabled}
                  onChange={(e) => toggle(row.key, e.target.value || null)}
                  aria-label={`Match for ${row.label}`}
                >
                  <option value="">Don&apos;t set — I&apos;ll pick it myself</option>
                  {row.choices.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                      {c.hint ? ` — ${c.hint}` : ""}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
