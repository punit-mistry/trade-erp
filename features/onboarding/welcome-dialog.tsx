"use client";

import { ArrowLeftRight, Building2, Compass, FileSignature, ShieldCheck, Ship, Sparkles, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ROLE_LABELS } from "@/convex/lib/roles";
import type { Role } from "@/convex/lib/validators";

type Point = { icon: LucideIcon; title: string; body: string };

const ROLE_POINTS: Record<Role, Point[]> = {
  admin: [
    { icon: Building2, title: "Set up your company", body: "Add your legal entity, bank details and signatory in Companies & Masters." },
    { icon: Users, title: "Approve your team", body: "New sign-ups wait for you in Team & Access — assign Manager or Staff." },
    { icon: FileSignature, title: "Activate a contract template", body: "Review the wording with legal, then activate and set it as default." },
    { icon: ShieldCheck, title: "Stay in control", body: "Every change is audited in the Activity Log." },
  ],
  manager: [
    { icon: ShieldCheck, title: "Approve trades", body: "Confirm trades submitted for review, or return them with a note." },
    { icon: FileSignature, title: "Issue contracts", body: "Generate from trade data, issue, send and track signature." },
    { icon: Ship, title: "Run dispatch", body: "Verify B/Ls and clear blockers on the dispatch board." },
    { icon: ArrowLeftRight, title: "Book and clone trades", body: "The wizard reuses supplier defaults so you type less." },
  ],
  staff: [
    { icon: Building2, title: "Add suppliers", body: "Save contacts, bank details and default terms once." },
    { icon: ArrowLeftRight, title: "Book trades", body: "Follow the 5-step wizard — drafts save automatically." },
    { icon: FileSignature, title: "Prepare contracts & B/Ls", body: "Generate drafts from the trade; a Manager issues them." },
    { icon: Ship, title: "Work the checklist", body: "Upload documents and complete your dispatch items." },
  ],
};

export function WelcomeDialog({
  open,
  role,
  name,
  onStartTour,
  onSkip,
}: {
  open: boolean;
  role: Role;
  name?: string | null;
  onStartTour: () => void;
  onSkip: () => void;
}) {
  const first = name?.split(" ")[0];
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onSkip()}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-xl">
        <div className="relative bg-sidebar px-6 pt-6 pb-5 text-sidebar-foreground">
          <div
            aria-hidden
            className="pointer-events-none absolute -top-16 -right-16 size-48 rounded-full bg-sidebar-primary/25 blur-3xl"
          />
          <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-sidebar-accent px-2.5 py-1 text-[11px] font-medium text-sidebar-accent-foreground">
            <Sparkles className="size-3" /> Signed in as {ROLE_LABELS[role]}
          </div>
          <DialogHeader className="space-y-1.5 text-left">
            <DialogTitle className="text-xl text-sidebar-accent-foreground">
              Welcome{first ? `, ${first}` : ""}! Let&apos;s get you trading.
            </DialogTitle>
            <DialogDescription className="text-sidebar-foreground/80">
              Tradeline connects suppliers, trades, contracts, B/Ls and documents in one record — create once, reuse
              everywhere. Here&apos;s what you&apos;ll typically do:
            </DialogDescription>
          </DialogHeader>
        </div>
        <ul className="grid gap-3 px-6 py-5 sm:grid-cols-2">
          {ROLE_POINTS[role].map((p) => (
            <li key={p.title} className="flex gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground">
                <p.icon className="size-4" />
              </span>
              <span>
                <span className="block text-sm font-medium">{p.title}</span>
                <span className="block text-xs leading-relaxed text-muted-foreground">{p.body}</span>
              </span>
            </li>
          ))}
        </ul>
        <DialogFooter className="border-t bg-muted/40 px-6 py-4 sm:justify-between">
          <p className="hidden self-center text-xs text-muted-foreground sm:block">
            Restart any time from the <span className="font-medium">?</span> menu.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onSkip}>
              Explore on my own
            </Button>
            <Button onClick={onStartTour} autoFocus>
              <Compass /> Start guided tour
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
