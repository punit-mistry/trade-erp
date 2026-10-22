import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/shared/states";
import { NewTradePage } from "@/features/trades/book-trade-pages";

export const metadata: Metadata = { title: "Book Trade" };

export default function BookTradePage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <NewTradePage />
    </Suspense>
  );
}
