"use client";

import { ErrorState } from "@/components/shared/states";

/** Route-segment error boundary: Convex query errors (incl. FORBIDDEN) land here. */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorState error={error} onRetry={reset} />;
}
