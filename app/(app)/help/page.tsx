import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/shared/states";
import { HelpCentre } from "@/features/onboarding/help-centre";

export const metadata: Metadata = { title: "Help Centre" };

export default function HelpPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <HelpCentre />
    </Suspense>
  );
}
