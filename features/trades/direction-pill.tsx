import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { TonePill } from "@/components/shared/status-badge";

/** Purchase (we buy) / Sales (we sell) marker used across trade screens. */
export function DirectionPill({ direction }: { direction: "purchase" | "sales" | undefined }) {
  if (!direction) return <span className="text-muted-foreground">—</span>;
  return direction === "purchase" ? (
    <TonePill tone="info">
      <ArrowDownLeft className="size-3" /> Purchase
    </TonePill>
  ) : (
    <TonePill tone="cyan">
      <ArrowUpRight className="size-3" /> Sales
    </TonePill>
  );
}
