import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/shared/states";
import { DocumentCentre } from "@/features/documents/document-centre";

export const metadata: Metadata = { title: "Document Centre" };

export default function DocumentsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <DocumentCentre />
    </Suspense>
  );
}
