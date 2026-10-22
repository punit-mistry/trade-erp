import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/shared/states";
import { MastersPage } from "@/features/admin/masters-page";

export const metadata: Metadata = { title: "Companies & Masters" };

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <MastersPage />
    </Suspense>
  );
}
