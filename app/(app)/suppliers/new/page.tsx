import type { Metadata } from "next";
import { NewSupplierPage } from "@/features/suppliers/supplier-editor-pages";

export const metadata: Metadata = { title: "Add Supplier" };

export default async function Page({ searchParams }: { searchParams: Promise<{ cloneFrom?: string }> }) {
  const { cloneFrom } = await searchParams;
  return <NewSupplierPage cloneFrom={cloneFrom} />;
}
