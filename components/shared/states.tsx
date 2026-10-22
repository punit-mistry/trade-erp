"use client";

import Link from "next/link";
import { AlertTriangle, Lock, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getErrorCode, getErrorMessage } from "@/lib/errors";

export function AccessDenied({ message }: { message?: string }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-20 text-center">
      <div className="mb-3 flex size-11 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <Lock className="size-5" />
      </div>
      <h2 className="text-base font-semibold">Access denied</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {message ?? "Your role does not have permission to view this page. Contact an administrator if you need access."}
      </p>
      <Button asChild variant="outline" className="mt-5">
        <Link href="/dashboard">Back to Dashboard</Link>
      </Button>
    </div>
  );
}

/** Error panel with retry; renders AccessDenied for permission errors. */
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const code = getErrorCode(error);
  if (code === "FORBIDDEN") return <AccessDenied message={getErrorMessage(error)} />;
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-20 text-center">
      <div className="mb-3 flex size-11 items-center justify-center rounded-full bg-warning/15 text-warning">
        <AlertTriangle className="size-5" />
      </div>
      <h2 className="text-base font-semibold">{code === "NOT_FOUND" ? "Not found" : "Unable to load this page"}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{getErrorMessage(error)}</p>
      {onRetry && (
        <Button variant="outline" className="mt-5" onClick={onRetry}>
          <RotateCw /> Try again
        </Button>
      )}
    </div>
  );
}

export function TableSkeleton({ rows = 8, columns = 6 }: { rows?: number; columns?: number }) {
  return (
    <div className="divide-y" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 px-4 py-3">
          {Array.from({ length: columns }).map((_, c) => (
            <Skeleton key={c} className="h-4 flex-1" style={{ maxWidth: c === 0 ? 140 : undefined }} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-7 w-64" />
      <Skeleton className="h-4 w-96 max-w-full" />
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
      <Skeleton className="h-72" />
    </div>
  );
}
