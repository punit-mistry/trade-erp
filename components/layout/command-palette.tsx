"use client";

import { useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeftRight,
  Building2,
  Clock,
  FileSignature,
  FileText,
  Loader2,
  Plus,
  Search,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { useDebouncedValue } from "@/hooks/use-debounce";
import { useViewer } from "@/hooks/use-viewer";
import { CONTRACT_STATUS, DIRECTION_LABEL, DOCUMENT_TYPE_LABEL, TRADE_STATUS } from "@/lib/status";
import { NAV } from "./nav-config";

type Recent = { href: string; label: string; kind: string };
const RECENT_KEY = "tradeline.recent";

function readRecent(): Recent[] {
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as Recent[]).slice(0, 6) : [];
  } catch {
    return [];
  }
}

function pushRecent(entry: Recent) {
  try {
    const next = [entry, ...readRecent().filter((r) => r.href !== entry.href)].slice(0, 6);
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable (private mode) — recent list is a convenience only.
  }
}

/** ⌘K / Ctrl+K global search: trades, suppliers, contracts, documents + quick actions. */
export function CommandPalette() {
  const router = useRouter();
  const { can } = useViewer();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [recent, setRecent] = useState<Recent[]>([]);
  const debounced = useDebouncedValue(term.trim(), 200);
  const results = useQuery(api.search.global, open && debounced.length >= 2 ? { term: debounced } : "skip");
  const searching = debounced.length >= 2 && (results === undefined || debounced !== term.trim());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const onOpenChange = (o: boolean) => {
    setOpen(o);
    if (o) setRecent(readRecent());
    else setTerm("");
  };

  const go = useCallback(
    (href: string, recentEntry?: Omit<Recent, "href">) => {
      if (recentEntry) pushRecent({ href, ...recentEntry });
      setOpen(false);
      setTerm("");
      router.push(href);
    },
    [router],
  );

  const hasResults =
    results &&
    (results.trades.length || results.counterparties.length || results.contracts.length || results.documents.length);
  const showDefault = debounced.length < 2;

  return (
    <>
      
<Button
  variant="outline"
  size="sm"
  onClick={() => onOpenChange(true)}
  className="flex h-8 w-8 items-center justify-center gap-2 px-0 text-muted-foreground sm:w-56 sm:justify-between sm:px-2.5"
  aria-label="Search (Ctrl+K)"
>
  <span className="flex min-w-0 items-center gap-2">
    <Search className="size-3.5 shrink-0" />
    <span className="hidden truncate sm:inline">
      Search trades, suppliers…
    </span>
  </span>

  <kbd className="hidden shrink-0 rounded border bg-muted px-1.5 font-mono text-[10px] sm:inline">
    Ctrl K
  </kbd>
</Button>

      <CommandDialog
        open={open}
        onOpenChange={onOpenChange}
        title="Search"
        description="Search trades, suppliers, contracts and documents"
      >
        <Command shouldFilter={showDefault}>
          <CommandInput
            placeholder="Trade no., counterparty, commodity, contract no.…"
            value={term}
            onValueChange={setTerm}
          />
          <CommandList className="max-h-[60vh]">
            {searching && (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Searching…
              </div>
            )}
            {!searching && !showDefault && !hasResults && (
              <CommandEmpty className="py-6 text-center text-sm">No matches for “{debounced}”.</CommandEmpty>
            )}

            {!searching && results && !showDefault && (
              <>
                {results.trades.length > 0 && (
                  <CommandGroup heading="Physical Trades">
                    {results.trades.map((t) => (
                      <CommandItem
                        key={t._id}
                        value={`trade-${t._id}`}
                        onSelect={() =>
                          go(`/physical-trades/${t._id}`, { label: `${t.tradeNumber} · ${t.counterpartyName ?? ""}`, kind: "Trade" })
                        }
                      >
                        <ArrowLeftRight />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">{t.tradeNumber}</div>
                          <div className="truncate text-xs text-muted-foreground">
                            {[t.direction && DIRECTION_LABEL[t.direction], t.counterpartyName, t.commodityName]
                              .filter(Boolean)
                              .join(" · ") || "—"}
                          </div>
                        </div>
                        <CommandShortcut>{TRADE_STATUS[t.status].label}</CommandShortcut>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
                {results.contracts.length > 0 && (
                  <CommandGroup heading="Contracts">
                    {results.contracts.map((c) => (
                      <CommandItem
                        key={c._id}
                        value={`contract-${c._id}`}
                        onSelect={() => go(`/contracts/${c._id}`, { label: c.contractNumber, kind: "Contract" })}
                      >
                        <FileSignature />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">
                            {c.contractNumber} <span className="text-xs text-muted-foreground">v{c.version}</span>
                          </div>
                          <div className="truncate text-xs text-muted-foreground">
                            {c.tradeNumber}
                            {c.counterpartyName ? ` · ${c.counterpartyName}` : ""}
                          </div>
                        </div>
                        <CommandShortcut>
                          {CONTRACT_STATUS[c.status as keyof typeof CONTRACT_STATUS]?.label ?? c.status}
                        </CommandShortcut>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
                {results.counterparties.length > 0 && (
                  <CommandGroup heading="Suppliers & Counterparties">
                    {results.counterparties.map((c) => (
                      <CommandItem
                        key={c._id}
                        value={`cp-${c._id}`}
                        onSelect={() => go(`/suppliers/${c._id}`, { label: c.name, kind: "Supplier" })}
                      >
                        <Building2 />
                        <div className="min-w-0 flex-1 truncate">{c.name}</div>
                        <CommandShortcut>{[c.code, c.country].filter(Boolean).join(" · ")}</CommandShortcut>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
                {results.documents.length > 0 && (
                  <CommandGroup heading="Documents">
                    {results.documents.map((d) => (
                      <CommandItem
                        key={d._id}
                        value={`doc-${d._id}`}
                        onSelect={() =>
                          go(d.tradeId ? `/physical-trades/${d.tradeId}?tab=documents` : `/documents?search=${encodeURIComponent(d.fileName)}`)
                        }
                      >
                        <FileText />
                        <div className="min-w-0 flex-1">
                          <div className="truncate">{d.fileName}</div>
                          <div className="truncate text-xs text-muted-foreground">
                            {DOCUMENT_TYPE_LABEL[d.docType]}
                            {d.tradeNumber ? ` · ${d.tradeNumber}` : ""}
                          </div>
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
              </>
            )}

            {showDefault && (
              <>
                {recent.length > 0 && (
                  <CommandGroup heading="Recently viewed">
                    {recent.map((r) => (
                      <CommandItem key={r.href} value={`recent ${r.label} ${r.href}`} onSelect={() => go(r.href)}>
                        <Clock />
                        <span className="truncate">{r.label}</span>
                        <CommandShortcut>{r.kind}</CommandShortcut>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
                <CommandGroup heading="Quick actions">
                  {can("trade.create") && (
                    <CommandItem value="Book trade new" onSelect={() => go("/physical-trades/new")}>
                      <Plus /> Book Trade
                    </CommandItem>
                  )}
                  {can("counterparty.create") && (
                    <CommandItem value="Add supplier new" onSelect={() => go("/suppliers/new")}>
                      <Plus /> Add Supplier
                    </CommandItem>
                  )}
                </CommandGroup>
                <CommandSeparator />
                <CommandGroup heading="Go to">
                  {NAV.flatMap((g) => g.items)
                    .filter((i) => !i.permission || can(i.permission))
                    .map((i) => (
                      <CommandItem key={i.href} value={`go ${i.title}`} onSelect={() => go(i.href)}>
                        <i.icon /> {i.title}
                      </CommandItem>
                    ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
