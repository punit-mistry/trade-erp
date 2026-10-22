import type { Metadata } from "next";
import type { Id } from "@/convex/_generated/dataModel";
import { EditSupplierPage } from "@/features/suppliers/supplier-editor-pages";

export const metadata: Metadata = { title: "Edit Supplier" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EditSupplierPage id={id as Id<"counterparties">} />;
}
