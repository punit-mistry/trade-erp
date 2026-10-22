"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

/**
 * Lets a page publish a human label for the current record (e.g. a trade
 * number) so the top-bar breadcrumb reads "Physical Trades › TRD-2026-0017"
 * instead of an id.
 */
const PageTitleContext = createContext<{ title: string | null; setTitle: (t: string | null) => void }>({
  title: null,
  setTitle: () => {},
});

export function PageTitleProvider({ children }: { children: ReactNode }) {
  const [title, setTitle] = useState<string | null>(null);
  return <PageTitleContext.Provider value={{ title, setTitle }}>{children}</PageTitleContext.Provider>;
}

export function usePageTitle() {
  return useContext(PageTitleContext).title;
}

/** Call from a detail page: `useSetPageTitle(trade?.tradeNumber)`. Cleared on unmount. */
export function useSetPageTitle(title: string | null | undefined) {
  const { setTitle } = useContext(PageTitleContext);
  useEffect(() => {
    setTitle(title ?? null);
    return () => setTitle(null);
  }, [title, setTitle]);
}
