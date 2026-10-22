import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/shared/states";
import { TradesList } from "@/features/trades/trades-list";

export const metadata: Metadata = { title: "Physical Trades" };

export default function PhysicalTradesPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <TradesList />
    </Suspense>
  );
}
