import { cookies } from "next/headers";
import { AccountGate } from "@/components/layout/account-gate";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { PageTitleProvider } from "@/components/layout/page-title";
import { Topbar } from "@/components/layout/topbar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { OnboardingHost } from "@/features/onboarding/onboarding-host";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false";
  return (
    <AccountGate>
      <PageTitleProvider>
        <SidebarProvider defaultOpen={defaultOpen}>
          <AppSidebar />
          <SidebarInset className="min-w-0">
            <Topbar />
            <div id="main-content" className="mx-auto w-full max-w-[1600px] flex-1 p-4 md:p-6">
              {children}
            </div>
          </SidebarInset>
        </SidebarProvider>
        {/* Welcome dialog, guided tours and getting-started checklist (features/onboarding). */}
        <OnboardingHost />
      </PageTitleProvider>
    </AccountGate>
  );
}
