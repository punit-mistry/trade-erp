"use client";

import { ConvexAuthNextjsProvider } from "@convex-dev/auth/nextjs";
import { ConvexReactClient } from "convex/react";
import type { ReactNode } from "react";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const convex = convexUrl ? new ConvexReactClient(convexUrl) : null;

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  if (!convex) {
    return (
      <div className="mx-auto mt-24 max-w-lg rounded-lg border bg-card p-6 text-sm">
        <h1 className="mb-2 text-base font-semibold">Convex is not configured</h1>
        <p className="text-muted-foreground">
          <code className="font-mono">NEXT_PUBLIC_CONVEX_URL</code> is missing. Run{" "}
          <code className="font-mono">npx convex dev</code> to create a deployment and write{" "}
          <code className="font-mono">.env.local</code>, then restart <code className="font-mono">npm run dev</code>.
          See README.md → Setup.
        </p>
      </div>
    );
  }
  return <ConvexAuthNextjsProvider client={convex}>{children}</ConvexAuthNextjsProvider>;
}
