"use client";

import { HelpCircle } from "lucide-react";
import { forwardRef, useState, type ComponentProps, type ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Label + control + help + error wrapper used by every form.
 * `help` renders as a small line under the field; `tip` adds an (i) tooltip
 * next to the label for unfamiliar commercial terms.
 */
export function FormField({
  label,
  htmlFor,
  required,
  help,
  tip,
  error,
  badge,
  className,
  children,
}: {
  label: ReactNode;
  htmlFor?: string;
  required?: boolean;
  help?: ReactNode;
  tip?: ReactNode;
  error?: string;
  badge?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-center gap-1.5">
        <label htmlFor={htmlFor} className="text-[13px] font-medium leading-none">
          {label}
          {required && (
            <span className="text-destructive" aria-hidden>
              {" "}
              *
            </span>
          )}
        </label>
        {tip && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" className="text-muted-foreground hover:text-foreground" aria-label="Field help">
                <HelpCircle className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">{tip}</TooltipContent>
          </Tooltip>
        )}
        {badge}
      </div>
      {children}
      {error ? (
        <p className="text-xs font-medium text-destructive" role="alert">
          {error}
        </p>
      ) : help ? (
        <p className="text-xs text-muted-foreground">{help}</p>
      ) : null}
    </div>
  );
}

/** Small marker shown next to a label when a value was inherited from supplier defaults. */
export function InheritedBadge({ source = "supplier default" }: { source?: string }) {
  return (
    <span className="rounded bg-cyan/12 px-1.5 py-px text-[10px] font-medium text-[oklch(0.48_0.1_215)] dark:text-cyan">
      from {source}
    </span>
  );
}

/**
 * Numeric input that keeps the user's raw text while typing and reports a
 * parsed number (or undefined when empty/invalid). Rejects negatives unless
 * `allowNegative`.
 */
export const NumberInput = forwardRef<
  HTMLInputElement,
  Omit<ComponentProps<typeof Input>, "value" | "onChange" | "type"> & {
    value: number | undefined;
    onValueChange: (value: number | undefined) => void;
    maxDecimals?: number;
    allowNegative?: boolean;
  }
>(function NumberInput({ value, onValueChange, maxDecimals = 4, allowNegative = false, className, ...props }, ref) {
  const [text, setText] = useState(value === undefined ? "" : String(value));
  // Re-sync the raw text when the value changes from outside (e.g. defaults
  // applied, form reset) — derived during render instead of in an effect.
  const [syncedValue, setSyncedValue] = useState(value);
  if (syncedValue !== value) {
    setSyncedValue(value);
    const parsed = text.trim() === "" ? undefined : Number(text.replace(/,/g, ""));
    if (parsed !== value) setText(value === undefined ? "" : String(value));
  }
  const pattern = allowNegative ? /^-?\d*\.?\d*$/ : /^\d*\.?\d*$/;
  return (
    <Input
      ref={ref}
      inputMode="decimal"
      autoComplete="off"
      className={cn("tabular text-right", className)}
      value={text}
      onChange={(e) => {
        const raw = e.target.value.replace(/,/g, "");
        if (!pattern.test(raw)) return;
        const decimals = raw.includes(".") ? raw.split(".")[1].length : 0;
        if (decimals > maxDecimals) return;
        setText(raw);
        const n = raw === "" || raw === "." || raw === "-" ? undefined : Number(raw);
        onValueChange(n !== undefined && Number.isFinite(n) ? n : undefined);
      }}
      {...props}
    />
  );
});
