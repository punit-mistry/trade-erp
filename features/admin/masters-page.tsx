"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { AccessDenied, PageSkeleton } from "@/components/shared/states";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useViewer } from "@/hooks/use-viewer";
import { CommoditiesTab } from "./commodities-tab";
import { CompaniesTab } from "./companies-tab";
import { LookupsTab } from "./lookups-tab";
import { SettingsTab } from "./settings-tab";

const TABS = ["companies", "commodities", "lists", "settings"] as const;
type Tab = (typeof TABS)[number];

export function MastersPage() {
  const { can, isLoading } = useViewer();
  const router = useRouter();
  const params = useSearchParams();
  const canSettings = can("settings.manage");
  const requested = params.get("tab") as Tab | null;
  const tab: Tab = requested && TABS.includes(requested) && (requested !== "settings" || canSettings) ? requested : "companies";

  if (isLoading) return <PageSkeleton />;
  if (!can("masters.manage")) {
    return <AccessDenied message="Companies & Masters is available to administrators and managers granted master-data access." />;
  }

  return (
    <div>
      <PageHeader
        title="Companies & Masters"
        description="Reusable master data — internal companies, commodities and reference lists — that pre-fills trades, contracts and B/Ls."
      />
      <Tabs value={tab} onValueChange={(v) => router.replace(`/admin/masters?tab=${v}`, { scroll: false })}>
        <TabsList className="mb-4">
          <TabsTrigger value="companies">Companies</TabsTrigger>
          <TabsTrigger value="commodities">Commodities</TabsTrigger>
          <TabsTrigger value="lists">Reference Lists</TabsTrigger>
          {canSettings && <TabsTrigger value="settings">System Settings</TabsTrigger>}
        </TabsList>
        <TabsContent value="companies">
          <CompaniesTab />
        </TabsContent>
        <TabsContent value="commodities">
          <CommoditiesTab />
        </TabsContent>
        <TabsContent value="lists">
          <LookupsTab />
        </TabsContent>
        {canSettings && (
          <TabsContent value="settings">
            <SettingsTab />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
