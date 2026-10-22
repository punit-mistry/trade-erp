import type { Metadata } from "next";
import { ActivityLogView } from "@/features/activity/activity-log-view";

export const metadata: Metadata = { title: "Activity Log" };

export default function ActivityPage() {
  return <ActivityLogView />;
}
