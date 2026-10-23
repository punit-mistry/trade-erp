# Pending work — handoff (23 Oct 2026)

This folder records exactly what is still unfinished after two background agents were
stopped mid-run by a Claude usage/rate limit. Nothing here is a new plan: it is the
delta between what is in the working tree today and what those two tasks were meant to
deliver.

The two interrupted tasks were:

1. **"Real free-tier AI assistant"** — a real LLM assistant (no canned answers) with
   chat, smart extraction and drafting, grounded in the user's permitted data.
2. **"UI/UX polish across modules"** — shell/navigation polish, dark mode, onboarding,
   guided tours and consistency passes across the app.

> **Update 24 Oct 2026:** tasks 1–5 are complete; see the table below.
>
> **Scope decision (from the user, after the interruption):** the AI provider is
> **Groq**, not Gemini. Stack is **Next.js + Convex**, key lives in
> **`NEXT_GROQ_AI_API_KEY`**. The backend was written against Gemini's
> OpenAI-compatible endpoint, so it must be switched to Groq — see
> [`01-ai-assistant.md`](./01-ai-assistant.md).

---

## Current state of the tree (verified, not assumed)

| Check | Result | Notes |
| --- | --- | --- |
| `npm run typecheck` | ✅ passes | after the three missing components were written |
| `npm run lint` | ✅ 0 errors, 1 warning | pre-existing `trade-wizard.tsx` React Compiler skip |
| `npm test` | ✅ 38 tests / 5 files pass | no AI/onboarding tests yet |
| `npm run build` | ✅ passes | Next.js 16.4.2, 19 routes |
| `convex/` deploy | ⚠️ not verified | new tables/modules need a `npx convex dev` push |

The three missing modules (`features/ai/ai-assistant-button.tsx`,
`features/onboarding/onboarding-host.tsx`, `features/onboarding/help-menu.tsx`) were
written on 23 Oct and the build is green. Their remaining follow-up work is listed in
the task table below and in the two detail files.

Working tree: **34 modified files + 18 untracked files** (uncommitted). The last commit
is `d467f47 Build Tradeline trading ERP on Next.js 16 + Convex`; all work described
here is on top of it and is **not committed yet**.

### Untracked files already written

| Area | Files |
| --- | --- |
| AI backend | `convex/ai.ts`, `convex/lib/ai.ts`, `convex/lib/helpContent.ts` |
| Onboarding backend | `convex/onboarding.ts` (+ schema tables in `convex/schema.ts`) |
| Shell / UI | `components/layout/{breadcrumbs,notifications,page-title,quick-create}.tsx`, `components/providers/theme-provider.tsx`, `components/shared/password-input.tsx` |
| Dashboard | `features/dashboard/quick-shortcuts.tsx` |
| Onboarding UI | `features/onboarding/{welcome-dialog,checklist-panel,shortcuts-dialog}.tsx`, `onboarding-store.ts`, `tour-runner.ts`, `tours.ts`, `tour.css` |

### Already-complete backend surface (do not rewrite)

`convex/ai.ts` is finished: `status`, `setEnabled`, `listThreads`, `messages`,
`sendMessage`, `retry`, `stop`, `deleteThread`, `extractTradeFromText`,
`extractSupplierFromText`, `tradeSummary`, `summariseTrade`, `draftClause`, plus the
streaming scheduler (`generateReply` → `patchAssistant`) and per-user daily quota.

`convex/onboarding.ts` is finished: `progress` (checklist computed from real records)
and `updatePrefs` (welcome seen, tours completed, checklist state).

`convex/lib/helpContent.ts` is finished: `HELP_GUIDES`, `HELP_CATEGORIES`,
`guidesForRole`, `findGuide`, `helpContentAsText`, `TourId`. It is a pure module, so
the Help UI can import it directly on the client — no query needed.

Schema is finished: `aiThreads`, `aiMessages`, `aiUsage`, `aiTradeSummaries`,
`userPrefs`, and `settings.aiEnabled`.

---

## What is missing, in recommended order

| # | Task | Status | Notes |
| --- | --- | --- | --- |
| 0 | Create 3 missing components | ✅ done (23 Oct) | build unblocked |
| 1 | Switch AI from Gemini to **Groq** (`NEXT_GROQ_AI_API_KEY`) | ✅ done (24 Oct) | model `openai/gpt-oss-120b`; key set on dev deployment |
| 2 | AI assistant chat panel | ✅ done | verified live |
| 2b | AI smart actions (extract / summarise / draft clause) + admin toggle | ✅ done (24 Oct) | verified live |
| 3 | Onboarding host behaviour | ✅ done | — |
| 4 | Help Centre `/help` + sidebar `nav-help` | ✅ done (24 Oct) | — |
| 5 | Known regressions (`.env.example`, wizard lint warning, flaky tests) | ✅ done (24 Oct) | — |
| 6 | Visual QA pass (breakpoints, dark mode, print, roles, keyboard) | ⬜ pending | needs a person with a browser |

**Still open:** task 6, and setting `NEXT_GROQ_AI_API_KEY` on the **production** Convex deployment.

Detailed tasks and acceptance criteria:

- [`01-ai-assistant.md`](./01-ai-assistant.md) — Groq migration + remaining AI UI
- [`02-ui-ux-polish.md`](./02-ui-ux-polish.md) — onboarding shell, Help Centre, bugs, QA
- [`03-checklist.md`](./03-checklist.md) — flat, tickable list to work from

---

## Environment notes

- `NEXT_GROQ_AI_API_KEY` is already present in `.env.local`.
- **Convex functions do not read `.env.local`.** The same key must be set on the
  Convex deployment:
  `npx convex env set NEXT_GROQ_AI_API_KEY <key>` (dev and prod separately).
- `.env.example` currently documents the wrong name (`GROQ_AI_API_KEY`) — fix as part
  of task 1.
- `convex/_generated/api.d.ts` was updated by hand for the new modules; regenerate it
  with `npx convex dev` (or `npx convex codegen`) instead of editing it manually.

## Verify commands

```powershell
npm run typecheck   # tsc app + convex
npm run lint
npm test
npm run build
npx convex dev      # push schema/functions, regenerate api.d.ts (needs deployment)
```

## Definition of done for this handoff

1. `npm run typecheck`, `npm run lint`, `npm test` and `npm run build` all pass.
2. The AI answers with **Groq** using `NEXT_GROQ_AI_API_KEY` set on the Convex
   deployment; unconfigured/disabled states are honest, never faked.
3. No placeholder or hard-coded assistant text anywhere; every AI surface has a
   loading, error, retry and stop path.
4. Welcome dialog, guided tours, getting-started checklist and shortcut help all work,
   and every `data-tour` anchor referenced by `features/onboarding/tours.ts` exists.
5. Every new surface passes a manual check at 360 px, 768 px and 1440 px, light and
   dark, and with Admin / Manager / Staff roles.
