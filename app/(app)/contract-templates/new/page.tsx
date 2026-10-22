import type { Metadata } from "next";
import { TemplateEditor } from "@/features/contracts/templates/template-editor";

export const metadata: Metadata = { title: "New Contract Template" };

export default function NewContractTemplatePage() {
  return <TemplateEditor />;
}
