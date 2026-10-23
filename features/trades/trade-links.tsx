"use client";

import { useQuery } from "convex/react";
import { Link2 } from "lucide-react";
import Link from "next/link";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { Section } from "@/components/shared/section";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatQuantity } from "@/lib/format";
import { TRADE_STATUS } from "@/lib/status";

/** Back-to-back links: the purchase a sale ships from, or the sales a purchase supplies. */
export function TradeLinks({ trade }: { trade: Doc<"trades"> }) {
  const links = useQuery(api.trades.links, { id: trade._id });
  if (!links) return null;
  if (trade.direction === "sales" && !links.purchase) return null;
  if (trade.direction === "purchase" && links.sales.length === 0) return null;

  const remaining = trade.quantity !== undefined ? trade.quantity - links.linkedQuantity : undefined;

  return (
    <Section
      title={
        <span className="inline-flex items-center gap-1.5">
          <Link2 className="size-3.5" /> Back-to-back
        </span>
      }
      description={
        trade.direction === "sales"
          ? "This sale ships goods bought on the purchase below; its supplier/factory is the B/L shipper."
          : "Sales shipped from this purchase."
      }
    >
      <ul className="space-y-2 text-sm">
        {(links.purchase ? [links.purchase] : links.sales).map((t) => (
          <li key={t._id} className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <Link href={`/physical-trades/${t._id}`} className="font-mono text-primary hover:underline">
                {t.tradeNumber}
              </Link>
              <div className="truncate text-xs text-muted-foreground">
                {[t.counterpartyName, t.quantity !== undefined ? formatQuantity(t.quantity, t.uom) : undefined].filter(Boolean).join(" · ")}
              </div>
            </div>
            <StatusBadge value={t.status} map={TRADE_STATUS} />
          </li>
        ))}
      </ul>
      {trade.direction === "purchase" && trade.quantity !== undefined && (
        <p className="mt-3 border-t pt-2 text-xs text-muted-foreground">
          Sold: <span className="font-medium text-foreground">{formatQuantity(links.linkedQuantity, trade.uom)}</span> of{" "}
          {formatQuantity(trade.quantity, trade.uom)}
          {remaining !== undefined && (
            <span className={remaining < 0 ? "font-medium text-warning" : undefined}>
              {" "}
              · {remaining < 0 ? `oversold by ${formatQuantity(-remaining, trade.uom)}` : `${formatQuantity(remaining, trade.uom)} unallocated`}
            </span>
          )}
        </p>
      )}
    </Section>
  );
}
