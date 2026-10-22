import type { Metadata } from "next";
import type { Id } from "@/convex/_generated/dataModel";
import { TemplateEditor } from "@/features/contracts/templates/template-editor";

export const metadata: Metadata = { title: "Contract Template" };

export default async function ContractTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TemplateEditor key={id} templateId={id as Id<"contractTemplates">} />;
}
