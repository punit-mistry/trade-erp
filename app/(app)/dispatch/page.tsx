import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/shared/states";
import { DispatchBoard } from "@/features/dispatch/dispatch-board";

export const metadata: Metadata = { title: "B/L & Dispatch" };

export default function DispatchPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <DispatchBoard />
    </Suspense>
  );
}
