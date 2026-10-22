import type { Metadata } from "next";
import { TemplateList } from "@/features/contracts/templates/template-list";

export const metadata: Metadata = { title: "Contract Templates" };

export default function ContractTemplatesPage() {
  return <TemplateList />;
}
