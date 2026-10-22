import type { Metadata } from "next";
import { TeamPage } from "@/features/admin/team-page";

export const metadata: Metadata = { title: "Team & Access" };

export default function Page() {
  return <TeamPage />;
}
