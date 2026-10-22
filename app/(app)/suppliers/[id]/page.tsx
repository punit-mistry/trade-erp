import type { Metadata } from "next";
import type { Id } from "@/convex/_generated/dataModel";
import { SupplierDetail } from "@/features/suppliers/supplier-detail";

export const metadata: Metadata = { title: "Supplier" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SupplierDetail id={id as Id<"counterparties">} />;
}
