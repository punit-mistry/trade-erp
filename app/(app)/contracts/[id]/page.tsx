import type { Metadata } from "next";
import type { Id } from "@/convex/_generated/dataModel";
import { ContractDetail } from "@/features/contracts/contract-detail";

export const metadata: Metadata = { title: "Contract" };

export default async function ContractPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ContractDetail id={id as Id<"contracts">} />;
}
