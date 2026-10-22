"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { Clock, Loader2, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useViewer } from "@/hooks/use-viewer";

/**
 * Blocks the app until the viewer is an active, approved user. Pending or
 * disabled accounts see an explanatory screen (the server would reject all
 * their queries anyway).
 */
export function AccountGate({ children }: { children: ReactNode }) {
  const { viewer, isLoading } = useViewer();
  const { signOut } = useAuthActions();
  const router = useRouter();

  useEffect(() => {
    if (viewer === null) router.replace("/signin");
  }, [viewer, router]);

  if (isLoading || viewer === null || viewer === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" /> Loading workspace…
      </div>
    );
  }

  if (viewer.status !== "active" || !viewer.role) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-md rounded-lg border bg-card p-6 text-center shadow-xs">
          <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-full bg-warning/15 text-warning">
            <Clock className="size-5" />
          </div>
          <h1 className="text-base font-semibold">
            {viewer.status === "disabled" ? "Account disabled" : "Awaiting administrator approval"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {viewer.status === "disabled"
              ? "Your account has been disabled. Contact an administrator if you believe this is a mistake."
              : `Your account (${viewer.email}) has been created. An administrator must activate it and assign a role before you can access trading data.`}
          </p>
          <Button
            variant="outline"
            className="mt-5"
            onClick={async () => {
              await signOut();
              router.replace("/signin");
            }}
          >
            <LogOut /> Sign out
          </Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
