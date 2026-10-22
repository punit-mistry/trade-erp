"use client";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** Only shortcuts that actually exist in the app. */
const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ["Ctrl / ⌘", "K"], label: "Open global search & quick actions" },
  { keys: ["Ctrl / ⌘", "B"], label: "Collapse / expand the sidebar" },
  { keys: ["?"], label: "Show this list of shortcuts" },
  { keys: ["Enter"], label: "Book Trade wizard: go to the next step" },
  { keys: ["Tab", "Shift + Tab"], label: "Move between fields and buttons" },
  { keys: ["→ / ←"], label: "Guided tour: next / previous step" },
  { keys: ["Esc"], label: "Close a dialog, menu or tour" },
];

export function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Work faster without the mouse.</DialogDescription>
        </DialogHeader>
        <ul className="divide-y rounded-lg border">
          {SHORTCUTS.map((s) => (
            <li key={s.label} className="flex items-center justify-between gap-4 px-3 py-2.5 text-sm">
              <span>{s.label}</span>
              <span className="flex shrink-0 items-center gap-1">
                {s.keys.map((k) => (
                  <kbd
                    key={k}
                    className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[11px] font-medium text-muted-foreground shadow-xs"
                  >
                    {k}
                  </kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
