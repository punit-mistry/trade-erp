# Task 2 — UI/UX polish across modules

Status: **shell onboarding wired; Help Centre and QA still missing.** The three files
the shell imports were written on 23 Oct and `npm run build` is green. The Help Centre
route does not exist yet and the visual QA pass has not started.

---

## 1. What is already done (in the working tree)

Do not redo these; review them instead.

**App shell**
- `components/layout/topbar.tsx` — rebuilt: sidebar toggle, breadcrumbs, global search,
  Quick Create, AI button slot, notifications, help menu, account menu with theme
  switcher (light/dark/system) and role label.
- `components/layout/breadcrumbs.tsx` — `section › record › edit` breadcrumbs from
  `nav-config`, using the page-supplied record title.
- `components/layout/page-title.tsx` — `PageTitleProvider` / `useSetPageTitle`; already
  used by trade, supplier, contract and template detail pages.
- `components/layout/notifications.tsx` — pending-work popover, `data-tour="notifications"`.
- `components/layout/quick-create.tsx` — one-click create + menu, `data-tour="quick-create"`.
- `components/providers/theme-provider.tsx`, `app/layout.tsx` — `next-themes` wiring
  with system default and no flash.
- `components/layout/app-sidebar.tsx` — active indicator, icon-collapse tooltips,
  role-filtered nav, footer profile, `data-tour="nav-*"` anchors.

**Auth / forms**
- `app/signin/page.tsx` — redesigned sign-in/sign-up.
- `components/shared/password-input.tsx` — show/hide password field.
- `components/shared/page-header.tsx`, `table-parts.tsx`, `components/ui/{table,tabs}.tsx`
  — spacing, density, focus and sticky-header polish.

**Modules touched**
- Dashboard: `quick-shortcuts.tsx` (new), KPI cards, `data-tour` anchors for tours.
- Trades: detail, wizard, summary card, book-trade pages, form defaults.
- Suppliers: list/detail/editor/form.
- Contracts: detail, template editor, trade contract tab.
- Dispatch, B/L, documents, admin team, activity — small consistency fixes.
- Onboarding: welcome dialog, guided tours (driver.js), checklist panel, shortcuts
  dialog, UI store (`onboarding-store.ts`).

**Dependencies added:** `driver.js`, `next-themes` (`package.json`, lockfile).

---

## 2. Shell components (written 23 Oct — review, do not redo)

Both files below now exist and are wired into `app/(app)/layout.tsx` and
`components/layout/topbar.tsx`. The bullet lists are the behaviour they implement —
use them as a review checklist rather than a to-do list.

### 2.1 `features/onboarding/onboarding-host.tsx` (required by `app/(app)/layout.tsx`)

The host is the only thing that mounts the already-written pieces. It needs to:

- [ ] Read `api.onboarding.progress` (checklist items, completed/total, prefs) and
      `useViewer()` for role/name.
- [ ] Subscribe to `useOnboardingState()` from `onboarding-store.ts`.
- [ ] Render `<WelcomeDialog>` when `prefs.welcomeSeenAt` is `null`; on
      "Start guided tour" → `onboarding.startTour("workspace")`, on skip/close →
      `api.onboarding.updatePrefs({ welcomeSeen: true })`.
- [ ] Render `<ChecklistPanel>` unless `prefs.checklistDismissed`; pass collapsed state
      and persist via `updatePrefs({ checklistDismissed, checklistCollapsed })`.
      `checklistRequest` from the store must expand/show it (Help menu action).
- [ ] Render `<ShortcutsDialog>` bound to `shortcutsOpen`.
- [ ] Run a pending tour after navigation: when `pendingTour.path` is set, wait until
      `usePathname()` matches, then `runTour(id, completed => updatePrefs({ tourCompleted: id }))`;
      if `tourAvailable(id)` is false, clear the pending tour instead of failing.
- [ ] Do nothing (null) for signed-out/pending users — `AccountGate` should already
      prevent rendering, but the host must tolerate `progress === undefined`.
- [ ] Import no server-only APIs; this is a client component.

### 2.2 `features/onboarding/help-menu.tsx` (required by `components/layout/topbar.tsx`)

Top-bar `?` menu, wrapped in `data-tour="help"`:

- [ ] "Take the tour of this page" — map the current pathname to a `TourId`
      (`dashboard`, `suppliers`, `supplier-form`, `trades`, `book-trade`,
      `trade-detail`, `dispatch`, `documents`, `contract-templates`, `workspace`); hide
      the item when `tourAvailable(id)` is false.
- [ ] "Restart the workspace tour" → `onboarding.startTour("workspace")`.
- [ ] "Getting started checklist" → `onboarding.showChecklist()`.
- [ ] "Keyboard shortcuts" → `onboarding.openShortcuts()`.
- [ ] "Help Centre" → link to `/help` (see 2.3).
- [ ] Role-aware: do not offer tours for modules the viewer cannot see.

### 2.3 Help Centre route `/help` + navigation

`convex/lib/helpContent.ts` is complete and client-safe, but no route consumes it.

- [ ] `app/(app)/help/page.tsx` (+ `features/onboarding/help-centre.tsx`): categories
      from `HELP_CATEGORIES`, guides from `guidesForRole(viewer.role)`, search, guide
      detail with steps, and a "Take the tour" button where `guide.tourStep` exists.
- [ ] Add a "Help Centre" item to `components/layout/nav-config.ts`. The workspace tour
      expects `data-tour="nav-help"` (`features/onboarding/tours.ts` line 52), which is
      auto-generated from the href — `/help` will produce `nav-help`.
- [ ] Decide breadcrumb behaviour for `/help` (`findNavItem` needs the nav entry or it
      falls back to "Workspace").

---

## 3. Known bugs / regressions to fix

- [x] **Fixed 23 Oct — `components/layout/app-sidebar.tsx` initials regex:** was
      `name.split(/[s@.]+/)` (splitting on the letter `s`); now `/[\s@.]+/`, matching
      `topbar.tsx`.
- [ ] **`.env.example`:** wrong AI variable name and no trailing newline — see
      [`01-ai-assistant.md`](./01-ai-assistant.md) §1.
- [ ] **`convex/_generated/api.d.ts`** was hand-edited; regenerate with `npx convex dev`
      / `npx convex codegen` so it matches the schema and module list.
- [ ] **`trade-wizard.tsx` ESLint warning:** React Compiler skips the component because
      of the `form.watch()` subscription. It is a warning, not an error, but it means
      the component is not compiled — confirm behaviour, or refactor to
      `useWatch`/explicit handlers.
- [ ] Verify every tour anchor exists after the missing components land:
      `global-search`, `quick-create`, `notifications`, `ai-assistant`, `help`,
      `user-menu`, `nav-*`, `dash-kpis`, `dash-pending`, `dash-recent-contracts`,
      `dash-dispatch`, plus the module anchors in `tours.ts`.

---

## 4. Visual/UX QA still to do

No systematic pass was run. Suggested checklist per screen:

- [ ] 360 px (mobile), 768 px (tablet), 1440 px (desktop) — no horizontal scroll, no
      clipped tables, sticky bars don't overlap content.
- [ ] Light and dark theme; check contrast of badges, muted text, charts, stage overlay
      in tours, and the sign-in screen.
- [ ] Keyboard: tab order, visible focus rings, Esc closes dialogs/sheets, `?` shortcut,
      `Ctrl/⌘ K` search.
- [ ] Roles: Admin / Manager / Staff / pending user — nav items, buttons, empty states,
      and AI/help surfaces must not expose forbidden actions.
- [ ] Empty/loading/error states on every list and detail page (no layout jump between
      skeleton and data).
- [ ] Print: `no-print` applied to topbar/sidebar/dialogs/checklist, contract and B/L
      previews print cleanly.
- [ ] `prefers-reduced-motion`: tours and transitions respect it.
- [ ] Onboarding first-run: welcome dialog once, tour completes and is remembered,
      checklist ticks from real data, dismissal persists across reloads.
- [ ] Confirm the sidebar active indicator, icon-collapsed tooltips and mobile sheet
      close-on-navigate still behave.
- [ ] Spot-check the dashboards' new shortcuts row and KPI cards after data changes
      (numbers, caps `+`, tooltips).

---

## 5. Acceptance criteria for task 2

- [ ] `npm run typecheck` / `npm run build` pass (no missing modules).
- [ ] First sign-in shows the welcome dialog once; every tour starts from the `?` menu
      and from the Help Centre, skips missing anchors, and records completion.
- [ ] Checklist reflects real records, collapses, dismisses and reopens from the menu.
- [ ] Help Centre is reachable from the sidebar and the `?` menu and is role-filtered.
- [ ] No console errors, no hydration warnings, no theme flash.
- [ ] All breakpoints/themes/roles above checked and noted (add screenshots or notes in
      this folder if useful).
