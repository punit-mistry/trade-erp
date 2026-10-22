import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/shared/states";
import { ContractsList } from "@/features/contracts/contracts-list";

export const metadata: Metadata = { title: "Contracts" };

export default function ContractsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ContractsList />
    </Suspense>
  );
}
