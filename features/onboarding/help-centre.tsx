"use client";

import { useQuery } from "convex/react";
import { ArrowRight, BookOpen, CheckCircle2, Compass, Keyboard, LifeBuoy, ListChecks, Search, Sparkles } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { api } from "@/convex/_generated/api";
import {
  HELP_CATEGORIES,
  findGuide,
  guidesForRole,
  type HelpCategory,
  type HelpGuide,
  type TourId,
} from "@/convex/lib/helpContent";
import { useSetPageTitle } from "@/components/layout/page-title";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Section } from "@/components/shared/section";
import { PageSkeleton } from "@/components/shared/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useViewer } from "@/hooks/use-viewer";
import { cn } from "@/lib/utils";
import { onboarding } from "./onboarding-store";
import { TOURS } from "./tours";

const ROLE_LABEL = { admin: "Admin", manager: "Manager", staff: "Staff" } as const;

function matches(guide: HelpGuide, q: string): boolean {
  if (!q) return true;
  const hay = [guide.title, guide.summary, guide.category, ...guide.steps.flatMap((s) => [s.title, s.body]), ...(guide.tips ?? [])]
    .join(" ")
    .toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => hay.includes(word));
}

/**
 * Starts a guided tour. Tours bound to a page navigate there first; the
 * onboarding host runs the tour once that page has rendered. Returns false
 * when the tour can't be started from here (it needs a specific record open).
 */
function canLaunchTour(id: TourId): boolean {
  return id === "workspace" || Boolean(TOURS[id]?.path);
}

export function HelpCentre() {
  const { viewer } = useViewer();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const progress = useQuery(api.onboarding.progress);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<HelpCategory | "all">("all");

  const role = viewer?.role ?? null;
  const guides = useMemo(() => guidesForRole(role), [role]);
  const guideId = params.get("guide");
  const guide = guideId ? findGuide(guideId) : undefined;
  // A guide link for another role (e.g. shared by a colleague) falls back to the list.
  const visibleGuide = guide && role && guide.audience.includes(role) ? guide : undefined;
  useSetPageTitle(visibleGuide?.title);

  if (viewer === undefined) return <PageSkeleton />;

  const toursDone = new Set(progress?.prefs.toursCompleted ?? []);
  const launchTour = (id: TourId) => {
    const path = TOURS[id]?.path;
    onboarding.startTour(id, path);
    if (path && path !== pathname) router.push(path);
  };

  if (visibleGuide) {
    return <GuideDetail guide={visibleGuide} toursDone={toursDone} onTour={launchTour} />;
  }

  const filtered = guides.filter((g) => (category === "all" || g.category === category) && matches(g, query.trim()));
  const usedCategories = HELP_CATEGORIES.filter((c) => guides.some((g) => g.category === c));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Help Centre"
        description={`Step-by-step guides for every workflow${role ? `, shown for your role (${ROLE_LABEL[role]})` : ""}.`}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <QuickCard
          icon={Compass}
          title="Workspace tour"
          text="A two-minute walk through the menus and top bar."
          action={() => launchTour("workspace")}
          done={toursDone.has("workspace")}
        />
        <QuickCard
          icon={ListChecks}
          title="Getting started checklist"
          text={
            progress ? `${progress.completed} of ${progress.total} steps done, ticked from your real data.` : "Your first steps, ticked from real data."
          }
          action={() => onboarding.showChecklist()}
        />
        <QuickCard icon={Keyboard} title="Keyboard shortcuts" text="Search with Ctrl/⌘ K, open help with ?." action={() => onboarding.openShortcuts()} />
      </div>

      <div className="space-y-3">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search guides — e.g. clone trade, B/L, approve user"
            className="pl-8"
            aria-label="Search help guides"
            type="search"
          />
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by category">
          {(["all", ...usedCategories] as const).map((c) => (
            <Button
              key={c}
              type="button"
              size="xs"
              variant={category === c ? "default" : "outline"}
              aria-pressed={category === c}
              onClick={() => setCategory(c)}
            >
              {c === "all" ? "All guides" : c}
            </Button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No guides match"
          description={
            <>
              Try other words, or ask the <Sparkles className="inline size-3.5" /> AI assistant in the top bar.
            </>
          }
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setQuery("");
                setCategory("all");
              }}
            >
              Clear filters
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((g) => (
            <Link
              key={g.id}
              href={`/help?guide=${g.id}`}
              className="group flex flex-col rounded-lg border bg-card p-4 shadow-xs transition-colors hover:border-primary/40 hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <Badge variant="secondary" className="text-[10px]">
                  {g.category}
                </Badge>
                <span className="text-[11px] text-muted-foreground tabular">
                  {g.steps.length} step{g.steps.length === 1 ? "" : "s"}
                </span>
              </div>
              <h2 className="text-sm font-semibold">{g.title}</h2>
              <p className="mt-1 flex-1 text-xs leading-relaxed text-muted-foreground">{g.summary}</p>
              <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary">
                Read guide <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" />
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function QuickCard({
  icon: Icon,
  title,
  text,
  action,
  done,
}: {
  icon: typeof LifeBuoy;
  title: string;
  text: string;
  action: () => void;
  done?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={action}
      className="flex items-start gap-3 rounded-lg border bg-card p-3 text-left shadow-xs transition-colors hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground">
        <Icon className="size-4" />
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          {title}
          {done && <CheckCircle2 className="size-3.5 text-success" aria-label="Completed" />}
        </span>
        <span className="block text-xs text-muted-foreground">{text}</span>
      </span>
    </button>
  );
}

function GuideDetail({
  guide,
  toursDone,
  onTour,
}: {
  guide: HelpGuide;
  toursDone: Set<string>;
  onTour: (id: TourId) => void;
}) {
  return (
    <div className="space-y-4">
      <PageHeader
        title={guide.title}
        description={guide.summary}
        back={{ href: "/help", label: "Help Centre" }}
        meta={
          <span className="flex flex-wrap gap-1.5">
            <Badge variant="secondary">{guide.category}</Badge>
            <Badge variant="outline">For {guide.audience.map((r) => ROLE_LABEL[r]).join(", ")}</Badge>
          </span>
        }
      />
      <Section title="Steps" contentClassName="p-0">
        <ol className="divide-y">
          {guide.steps.map((step, i) => (
            <li key={i} className="flex gap-3 p-4">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1 space-y-2">
                <h3 className="text-sm font-semibold">{step.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{step.body}</p>
                {(step.href || step.tourStep) && (
                  <div className="flex flex-wrap gap-2">
                    {step.href && (
                      <Button asChild size="xs" variant="outline">
                        <Link href={step.href}>
                          Open this page <ArrowRight />
                        </Link>
                      </Button>
                    )}
                    {step.tourStep && canLaunchTour(step.tourStep) && (
                      <Button size="xs" variant="ghost" onClick={() => onTour(step.tourStep!)}>
                        <Compass /> {toursDone.has(step.tourStep) ? "Replay the tour" : "Take the tour"}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>
      </Section>
      {guide.tips && guide.tips.length > 0 && (
        <Section title="Tips">
          <ul className={cn("list-disc space-y-1 pl-5 text-sm text-muted-foreground")}>
            {guide.tips.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </Section>
      )}
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <BookOpen className="size-3.5" /> Still stuck? Ask the AI assistant in the top bar — it answers from these guides and
        your own data.
      </p>
    </div>
  );
}
