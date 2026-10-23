# Resume checklist

Flat, tickable list. Details and acceptance criteria are in
[`01-ai-assistant.md`](./01-ai-assistant.md) and
[`02-ui-ux-polish.md`](./02-ui-ux-polish.md).

**Provider decision:** AI runs on **Groq API** (`NEXT_GROQ_AI_API_KEY`), with
**Next.js + Convex**. Switched from Gemini on 24 Oct 2026.

---

## Phase 0 — Protect the current work ✅

- [x] Work committed (`368bee6`, `e373eea` on `feature/khatib/todos`).
- [x] `NEXT_GROQ_AI_API_KEY` set on the Convex **dev** deployment (`lovely-rat-249`).
      **Prod still needs it:** `npx convex env set NEXT_GROQ_AI_API_KEY <key> --prod`.
- [x] `npx convex dev --once` pushed schema/functions and regenerated `convex/_generated`.

## Phase 1 — Unblock the build ✅ (23 Oct)

- [x] `features/onboarding/onboarding-host.tsx`, `features/onboarding/help-menu.tsx`,
      `features/ai/ai-assistant-button.tsx`, `features/ai/ai-assistant-panel.tsx`.
- [x] Sidebar initials regex fix.

## Phase 2 — Switch AI to Groq ✅ (24 Oct)

- [x] `DEFAULT_AI_BASE_URL = "https://api.groq.com/openai/v1/"`.
- [x] `DEFAULT_AI_MODEL = "openai/gpt-oss-120b"` — verified against the key's live model list
      (`llama-3.3-70b-versatile` is no longer offered). Reasoning models get `reasoning_effort: "low"`.
- [x] `aiConfig()` reads `NEXT_GROQ_AI_API_KEY`.
- [x] `AI_DATA_NOTICE` rewritten for Groq.
- [x] `classifyHttpError()` names the Groq key; 429 uses `retry-after`.
- [x] `convex/ai.ts` provider string and "not configured" copy.
- [x] `.env.example` documents `NEXT_GROQ_AI_API_KEY`, `AI_MODEL`, `AI_BASE_URL`.
- [x] JSON mode verified live on Groq for trade/supplier extraction and clause drafting.
- [x] Quota: 100/user/day plus a new workspace cap of 900/day (`aiWorkspaceUsage` table);
      chat context trimmed for Groq's ~8k tokens/minute free-tier limit.
- [x] Unit tests in `tests/ai.test.ts` (21 tests). Found and fixed: a non-numeric price ("abc")
      was turned into 0.
- [x] Counterparty/commodity matching now uses real name similarity (`nameSimilarity`);
      unrelated search hits are no longer offered as "65% matches".

## Phase 3 — AI UI ✅ (24 Oct)

- [x] Chat panel (23 Oct).
- [x] Image/attachment support: not offered (backend has none).
- [x] Trade wizard **Fill from email** — `features/trades/ai-trade-import.tsx`.
- [x] Supplier form **Fill from signature** — `features/suppliers/ai-supplier-import.tsx`.
- [x] Trade overview **AI summary** with Outdated badge — `features/trades/ai-trade-summary.tsx`.
- [x] Template editor **Draft with AI** — `features/contracts/templates/ai-clause-drafter.tsx`.
- [x] Admin AI card (System Settings) — `features/admin/ai-settings-card.tsx`.
- [x] Permission gates: `trade.create`, `counterparty.create`, `contractTemplate.manage`,
      `settings.manage` checked in the UI and enforced again on the server.
- [x] Live end-to-end check on the dev deployment: status, chat, both extractions,
      trade summary and clause drafting all returned real Groq output.

## Phase 4 — Onboarding & Help Centre ✅ (24 Oct)

- [x] `app/(app)/help/page.tsx` + `features/onboarding/help-centre.tsx` (search, categories,
      role filter, guide detail, tour buttons).
- [x] "Help Centre" in `nav-config.ts` (creates `nav-help`) and in the `?` menu.
- [x] All 34 `data-tour` anchors in `tours.ts` resolve.
- [ ] Verify in a browser: welcome shows once, tour completion persists, checklist tick/dismiss/collapse.

## Phase 5 — QA

- [x] `npm run typecheck` · `npm run lint` (0 problems) · `npm test` (57 passing) · `npm run build`.
- [x] `trade-wizard.tsx` React Compiler warning fixed (`useWatch` / `form.subscribe` instead of `form.watch`).
- [x] Flaky 5 s test timeouts fixed (`testTimeout: 20_000` in `vitest.config.mts`).
- [x] `README.md` / `docs/ARCHITECTURE.md` updated (AI section, env vars, `/help`).
- [ ] **Manual, needs a browser:** 360 / 768 / 1440 px, light + dark, Admin / Manager / Staff / pending.
- [ ] **Manual:** print preview of contract and B/L; `no-print` respected.
- [ ] **Manual:** keyboard-only walkthrough; `Ctrl/⌘ K`, `?`, Esc; reduced motion.
- [ ] **Manual:** no console/hydration errors on any route.

---

## Commands

```powershell
npm run typecheck
npm run lint
npm test
npm run build

npx convex dev                                         # push functions/schema, codegen
npx convex env set NEXT_GROQ_AI_API_KEY <key> --prod   # production deployment still needs the key
npx convex env list                                    # verify it is set
```
