import type { Metadata } from "next";
import { Suspense } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import { PageSkeleton } from "@/components/shared/states";
import { TradeDetail } from "@/features/trades/trade-detail";

export const metadata: Metadata = { title: "Trade" };

type Params = Promise<{ id: string }>;

// With Cache Components, runtime params must be read inside a Suspense boundary.
async function Detail({ params }: { params: Params }) {
  const { id } = await params;
  return <TradeDetail id={id as Id<"trades">} />;
}

export default function TradeDetailPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Detail params={params} />
    </Suspense>
  );
}
