import type { Metadata } from "next";
import { Suspense } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import { PageSkeleton } from "@/components/shared/states";
import { EditTradePage } from "@/features/trades/book-trade-pages";

export const metadata: Metadata = { title: "Edit Trade" };

type Params = Promise<{ id: string }>;

// With Cache Components, runtime params must be read inside a Suspense boundary.
async function Edit({ params }: { params: Params }) {
  const { id } = await params;
  return <EditTradePage id={id as Id<"trades">} />;
}

export default function EditTradeRoute({ params }: { params: Params }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Edit params={params} />
    </Suspense>
  );
}
