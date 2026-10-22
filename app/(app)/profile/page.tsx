import type { Metadata } from "next";
import { ProfilePage } from "@/features/admin/profile-page";

export const metadata: Metadata = { title: "My profile" };

export default function Page() {
  return <ProfilePage />;
}
