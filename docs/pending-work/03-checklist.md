# Resume checklist

Flat, tickable list. Details and acceptance criteria are in
[`01-ai-assistant.md`](./01-ai-assistant.md) and
[`02-ui-ux-polish.md`](./02-ui-ux-polish.md).

**Provider decision:** AI must run on **Groq API** (`NEXT_GROQ_AI_API_KEY`), with
**Next.js + Convex**. The existing backend targets Gemini and must be switched.

---

## Phase 0 — Protect the current work

- [ ] Commit or stash the current tree before editing (34 modified + 18 untracked files,
      last commit `d467f47`). Nothing here is committed yet.
- [ ] Confirm `NEXT_GROQ_AI_API_KEY` is in `.env.local` (it is) and add it to the Convex
      deployment: `npx convex env set NEXT_GROQ_AI_API_KEY <key>`.
- [ ] Run `npx convex dev` once to push the new schema and regenerate
      `convex/_generated/api.d.ts` (do not hand-edit generated files).

## Phase 1 — Unblock the build ✅ (23 Oct)

- [x] Create `features/onboarding/onboarding-host.tsx` (welcome + checklist + shortcuts
      + pending tour runner).
- [x] Create `features/onboarding/help-menu.tsx` (top-bar `?` menu, `data-tour="help"`).
- [x] Create `features/ai/ai-assistant-button.tsx` + `features/ai/ai-assistant-panel.tsx`.
- [x] `npm run typecheck`, `npm run lint` and `npm run build` → green.
- [x] Fix `components/layout/app-sidebar.tsx` initials regex: `/[s@.]+/` →
      `/[\s@.]+/`.

## Phase 2 — Switch AI to Groq

- [ ] `convex/lib/ai.ts`: `DEFAULT_AI_BASE_URL = "https://api.groq.com/openai/v1/"`.
- [ ] `convex/lib/ai.ts`: `DEFAULT_AI_MODEL` → current Groq model (verify in console;
      start with `llama-3.3-70b-versatile`).
- [ ] `convex/lib/ai.ts`: read `process.env.NEXT_GROQ_AI_API_KEY`.
- [ ] Rewrite `AI_DATA_NOTICE` for Groq free-tier terms (remove Google claim).
- [ ] Update `classifyHttpError()`: key name in 401/403, 429 wording (Groq/retry-after).
- [ ] Update `convex/ai.ts` provider string + any `GEMINI_API_KEY` copy.
- [ ] `.env.example`: `GROQ_AI_API_KEY` → `NEXT_GROQ_AI_API_KEY`, add trailing newline,
      note it belongs on the Convex deployment.
- [ ] Confirm JSON mode works for the chosen model (or rely on the existing 400 retry);
      ensure prompts contain the word "JSON" if the model requires it.
- [ ] Review `AI_DAILY_CAP = 100` against Groq limits; add a shared/global cap if the
      free quota is per-org.
- [ ] Add unit tests for `aiConfig`, `classifyHttpError`, `extractJsonObject`,
      extraction normalisers, `safeTradeFacts`, `utcDay`.

## Phase 3 — AI UI

- [x] `features/ai/ai-assistant-panel.tsx`: thread list, streaming messages, composer,
      stop / retry / delete, context links, quota indicator, data notice, empty/error
      states, responsive sheet/panel, keyboard + focus handling.
- [ ] Image/attachment support: **not in the backend** — do not promise it in the UI
      unless added.
- [ ] Trade wizard: paste email → `api.ai.extractTradeFromText`, review suggestions,
      matches for counterparties/commodities, prefill on accept.
- [ ] Supplier form: paste signature/letterhead → `api.ai.extractSupplierFromText`.
- [ ] Trade detail: AI summary (`api.ai.summariseTrade` / `tradeSummary`) with
      model, author, and "outdated" badge.
- [ ] Template editor: `api.ai.draftClause` with confirmation + unknown-variable warning.
- [ ] Admin AI card: `api.ai.status.canManage` + `api.ai.setEnabled`, provider/model/key
      state.
- [ ] Verify permission gates: `trade.create`, `counterparty.create`,
      `contractTemplate.manage`, `settings.manage`, view-only chat.

## Phase 4 — Onboarding & Help Centre

- [ ] `app/(app)/help/page.tsx` + Help Centre UI using `HELP_GUIDES` /
      `guidesForRole` / `HELP_CATEGORIES` / `findGuide`; tour buttons where
      `guide.tourStep` is set.
- [ ] Add Help Centre to `components/layout/nav-config.ts` (creates `nav-help`).
- [x] Wire help-menu actions to the onboarding store; hide page-tour action when the
      tour has no anchors on the current page.
- [ ] Verify welcome-once, tour completion persistence, checklist tick/dismiss/collapse.
- [ ] Verify every `data-tour` anchor in `features/onboarding/tours.ts` resolves.

## Phase 5 — QA

- [ ] `npm run typecheck` · `npm run lint` · `npm test` · `npm run build` all pass.
- [ ] Manual pass at 360 / 768 / 1440 px, light + dark, Admin / Manager / Staff /
      pending.
- [ ] Print preview of contract and B/L; `no-print` respected.
- [ ] Keyboard-only walkthrough; `Ctrl/⌘ K`, `?`, Esc.
- [ ] Reduced-motion check.
- [ ] No console/hydration errors on any route.
- [ ] Update `README.md` / `docs/ARCHITECTURE.md` if they describe AI or shell
      behaviour (check for Gemini references).

---

## Quick file map

| Need | File |
| --- | --- |
| AI provider config, prompts, JSON/SSE helpers | `convex/lib/ai.ts` |
| AI actions/queries, quota, streaming scheduler | `convex/ai.ts` |
| AI tables + `settings.aiEnabled` + `userPrefs` | `convex/schema.ts` |
| Onboarding checklist/prefs backend | `convex/onboarding.ts` |
| Help guides / tour ids (client-safe) | `convex/lib/helpContent.ts` |
| Tour definitions | `features/onboarding/tours.ts` |
| driver.js runner | `features/onboarding/tour-runner.ts` |
| Transient onboarding UI state | `features/onboarding/onboarding-store.ts` |
| Checklist / welcome / shortcuts UI | `features/onboarding/{checklist-panel,welcome-dialog,shortcuts-dialog}.tsx` |
| Shell wiring | `app/(app)/layout.tsx`, `components/layout/topbar.tsx` |
| Nav + breadcrumbs | `components/layout/{nav-config,breadcrumbs,page-title}.tsx` |
| Missing components | `features/onboarding/{onboarding-host,help-menu}.tsx`, `features/ai/*` |

## Commands

```powershell
npm run typecheck
npm run lint
npm test
npm run build

npx convex dev                                  # push functions/schema, codegen
npx convex env set NEXT_GROQ_AI_API_KEY <key>   # secret for Convex actions
npx convex env list                             # verify it is set
```
