"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

/** Server message from a ConvexError (or a plain Error), with an honest fallback. */
export function errorText(e: unknown): string {
  const data = (e as { data?: { message?: unknown } })?.data;
  if (data && typeof data.message === "string" && data.message) return data.message;
  if (e instanceof Error && e.message) return e.message;
  return "Something went wrong while contacting the AI service. Please try again.";
}

/** Minimal, XSS-safe inline formatting: **bold** and `code`. */
export function RichText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*\n]+\*\*|`[^`\n]+`)/g);
  return (
    <p className="whitespace-pre-wrap break-words">
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
          return (
            <strong key={i} className="font-semibold">
              {part.slice(2, -2)}
            </strong>
          );
        }
        if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
          return (
            <code key={i} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">
              {part.slice(1, -1)}
            </code>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </p>
  );
}

/**
 * AI availability for smart-action buttons. `reason` explains why AI can't be
 * used right now (null when it can); `undefined` while loading.
 */
export function useAiAvailability() {
  const status = useQuery(api.ai.status);
  if (status === undefined) return undefined;
  const quotaExhausted = status.dailyCap > 0 && status.usedToday >= status.dailyCap;
  const reason = !status.configured
    ? "AI isn't configured — ask an administrator."
    : !status.enabled
      ? "AI has been turned off by an administrator."
      : quotaExhausted
        ? `You've used today's ${status.dailyCap} AI requests. It resets at 00:00 UTC.`
        : null;
  return { status, available: reason === null, reason };
}

/** "12 / 100 AI requests used today" line for smart-action dialogs. */
export function AiUsageNote({ className }: { className?: string }) {
  const ai = useAiAvailability();
  if (!ai) return null;
  return (
    <p className={className ?? "text-[11px] text-muted-foreground"}>
      {ai.reason ?? `${ai.status.usedToday} / ${ai.status.dailyCap} AI requests used today · ${ai.status.provider}`}
    </p>
  );
}

/** Confidence (0–1) as a short label for review lists. */
export function confidenceLabel(c: number): { label: string; tone: "high" | "medium" | "low" } {
  if (c >= 0.85) return { label: "High", tone: "high" };
  if (c >= 0.6) return { label: "Medium", tone: "medium" };
  return { label: "Low", tone: "low" };
}
