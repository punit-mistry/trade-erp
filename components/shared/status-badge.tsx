import { cn } from "@/lib/utils";
import type { StatusMeta, Tone } from "@/lib/status";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const TONE_CLASSES: Record<Tone, string> = {
  neutral: "bg-secondary text-secondary-foreground ring-border",
  info: "bg-info/10 text-info ring-info/25",
  brand: "bg-brand/10 text-brand ring-brand/25",
  success: "bg-success/10 text-success ring-success/25",
  warning: "bg-warning/15 text-[oklch(0.5_0.12_65)] ring-warning/30 dark:text-warning",
  danger: "bg-destructive/10 text-destructive ring-destructive/25",
  muted: "bg-muted text-muted-foreground ring-border",
  cyan: "bg-cyan/12 text-[oklch(0.5_0.1_215)] ring-cyan/30 dark:text-cyan",
};

const DOT_CLASSES: Record<Tone, string> = {
  neutral: "bg-muted-foreground/60",
  info: "bg-info",
  brand: "bg-brand",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-destructive",
  muted: "bg-muted-foreground/40",
  cyan: "bg-cyan",
};

/** Status pill. Pass a value + its metadata map, e.g. `<StatusBadge value={t.status} map={TRADE_STATUS} />`. */
export function StatusBadge<K extends string>({
  value,
  map,
  className,
}: {
  value: K | undefined | null;
  map: Record<K, StatusMeta>;
  className?: string;
}) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  const meta = map[value] ?? { label: value, tone: "neutral" as Tone };
  const pill = (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1.5 rounded-full px-2 text-[11px] font-medium whitespace-nowrap ring-1 ring-inset",
        TONE_CLASSES[meta.tone],
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", DOT_CLASSES[meta.tone])} aria-hidden />
      {meta.label}
    </span>
  );
  if (!meta.description) return pill;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{pill}</TooltipTrigger>
      <TooltipContent>{meta.description}</TooltipContent>
    </Tooltip>
  );
}

export function TonePill({ tone, children, className }: { tone: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1 rounded-full px-2 text-[11px] font-medium whitespace-nowrap ring-1 ring-inset",
        TONE_CLASSES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
