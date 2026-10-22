# Task 1 — Real AI assistant on **Groq** (Next.js + Convex)

Status: **backend written against Gemini; chat UI built 23 Oct.** The provider decision
is now **Groq API**, key **`NEXT_GROQ_AI_API_KEY`** (already in `.env.local`).
Stack: Next.js 16 + Convex. No canned/demo answers anywhere.

Still missing: Groq configuration switch (§1) and the smart-action surfaces (§2.3–2.4).
The chat button/panel (§2.1–2.2) exist; review them against the table below.

---

## 1. Switch provider from Gemini to Groq

Everything below is in `convex/lib/ai.ts` unless stated otherwise. The code already
talks to any OpenAI-compatible endpoint, so this is configuration plus copy — not a
rewrite.

- [ ] `DEFAULT_AI_BASE_URL` → `https://api.groq.com/openai/v1/`
      (the code appends `/` and then `chat/completions`, giving
      `https://api.groq.com/openai/v1/chat/completions`).
- [ ] `DEFAULT_AI_MODEL` → a current Groq model. Suggested default
      `llama-3.3-70b-versatile`; `llama-3.1-8b-instant` is the cheap/fast option.
      **Verify the model id and JSON-mode support in the Groq console before hard-coding
      it** — Groq's catalogue moves. Keep `AI_MODEL` as the override.
- [ ] `aiConfig()` — read `process.env.NEXT_GROQ_AI_API_KEY` (currently
      `GEMINI_API_KEY`). Keep `AI_BASE_URL` as an override.
- [ ] Update the file header comment (lines 1–11) to name Groq, the new env var and the
      new defaults.
- [ ] `AI_DATA_NOTICE` (line 21) — remove the Google/Gemini free-tier claim. Reword for
      Groq's free-tier terms (and keep the existing sentence that internal notes, bank
      details, emails and phone numbers are never sent). The notice is rendered in the
      AI panel via `ai.status`, so it must be accurate.
- [ ] `classifyHttpError()`:
  - 401/403 message says "check `GEMINI_API_KEY`" → `NEXT_GROQ_AI_API_KEY`.
  - 429 message says "midnight Pacific time" → Groq limits; prefer wording like
    "Groq rate limit reached — retry in a few seconds", and use the `retry-after`
    header if present (currently the body/headers are not passed through, only status
    and body text).
  - 400/404 hint about `AI_MODEL` is still correct.
- [ ] `convex/ai.ts` line ~116: `provider: "Google Gemini (free tier)"` →
      `"Groq (free tier)"`. Check every user-facing string in that file for Gemini
      references (`assertAvailable` message mentions `GEMINI_API_KEY`).
- [ ] `.env.example` — currently ends with `GROQ_AI_API_KEY` and no trailing newline.
      Replace with `NEXT_GROQ_AI_API_KEY` and note it must be set **on the Convex
      deployment** (`npx convex env set ...`), not only in `.env.local`.
- [ ] Check `AI_DAILY_CAP = 100` per user against Groq's free-tier limits
      (requests/min, tokens/min, requests/day). If the org limit is shared, add a
      workspace-level counter alongside the per-user one so one user cannot drain the
      quota for everyone.
- [ ] Keep the JSON-mode fallback (`400` → retry without `response_format`) — different
      Groq models support JSON mode differently. In JSON mode some Groq models require
      the word "JSON" in the messages; confirm the extraction/draft prompts satisfy
      that (see `TRADE_EXTRACT_PROMPT`, `SUPPLIER_EXTRACT_PROMPT`, `clauseDraftPrompt`).
- [ ] Set the deployment secret and redeploy:
      `npx convex env set NEXT_GROQ_AI_API_KEY <key>` then `npx convex dev`.
      `.env.local` alone is not visible to Convex functions.
- [ ] Add unit tests for the pure helpers (currently untested):
      `aiConfig()` env handling, `classifyHttpError()` mapping, `extractJsonObject()`,
      `normaliseTradeExtraction()`, `normaliseSupplierExtraction()`, `safeTradeFacts()`
      (must exclude internal notes and contact/bank fields), `utcDay()`.

**Do not** add an AI SDK dependency unless needed — the existing `fetch` + SSE parser
(`createSseParser`, `streamChatCompletion`) is provider-agnostic and tested by use.

---

## 2. AI UI

`features/ai/` was created on 23 Oct: `ai-assistant-button.tsx` (top bar) and
`ai-assistant-panel.tsx` (threads, streaming, stop/retry, context links, quota,
admin switch). The sections below document the intended behaviour for review; the
smart actions in §2.3–2.4 are still unbuilt.

### 2.1 `features/ai/ai-assistant-button.tsx` — ✅ built

- [ ] Client component rendered in `components/layout/topbar.tsx` next to Quick Create.
- [ ] Wrapped in `data-tour="ai-assistant"` (the workspace tour highlights it).
- [ ] Uses `api.ai.status` to show one of: not configured (admin hint), disabled,
      available. Must not look broken when AI is off.
- [ ] Opens the panel (sheet on mobile, popover/side panel on desktop).
- [ ] Accessible name, keyboard shortcut (e.g. `Ctrl/⌘ J`), visible tooltip.

### 2.2 `features/ai/ai-assistant-panel.tsx` — ✅ built

Wire to the finished backend:

| Backend (all in `convex/ai.ts`) | Use |
| --- | --- |
| `status` | configured / enabled / provider / model / notice / `dailyCap` / `usedToday` / `canManage` |
| `listThreads` | conversation switcher, newest first, max 30 |
| `messages({ threadId })` | reactive message list; streamed content appears live because `patchAssistant` writes to the DB |
| `sendMessage({ threadId?, content, page })` | send; pass `usePathname()` as `page` for page-aware answers |
| `retry({ messageId })` | retry failed answers only |
| `stop({ messageId })` | stop a pending/streaming answer; partial text is kept |
| `deleteThread` | delete conversation |
| `setEnabled` | admin on/off switch (`canManage`) |

- [ ] Render `status.notice` (data notice) and `usedToday / dailyCap`, with a clear
      quota-exhausted state (backend throws `CONFLICT` with a reset message).
- [ ] Render `contextRefs` on assistant messages as links (`href`, `label`).
- [ ] Markdown rendering (bold/lists/code) — keep it XSS-safe (no raw HTML).
- [ ] States: pending, streaming, done, error (+ retry), stopped, empty history,
      unconfigured, disabled, quota reached, long input (>4000 chars is rejected).
- [ ] Start a new conversation; auto-title is already done by `sendMessage`.
- [ ] Responsive: full-height sheet on mobile, resizable panel on desktop; scroll lock;
      focus trap; Esc closes.
- [ ] Do not invent answers client-side — when `available` is false, explain why.

### 2.3 Smart actions (all backend-complete, no UI yet)

- [ ] **Trade wizard — paste an email/PO:** call
      `api.ai.extractTradeFromText({ text })`, show per-field suggestions with
      confidence (`fields[name].value/confidence`), prefill only on user accept, and
      surface `matches.counterparties` / `matches.commodities` as picker suggestions.
      Permission: `trade.create`. Limit 8,000 chars.
- [ ] **Supplier form — paste signature/letterhead:** call
      `api.ai.extractSupplierFromText({ text })`; same accept-per-field pattern.
      Never auto-save. Permission: `counterparty.create`.
- [ ] **Trade detail — AI summary:** call `api.ai.summariseTrade({ tradeId })`, display
      via `api.ai.tradeSummary({ tradeId })`; show model, author, generated time and an
      **"outdated"** badge when `outdated` is true (trade changed since generation).
      Permission: view.
- [ ] **Contract template editor — draft a clause:** call
      `api.ai.draftClause({ instruction, heading })`; insert the returned
      `heading`/`body` into the clause with an explicit confirmation, and warn when
      `unknownVariables` is non-empty (unknown `{{variables}}` block template
      activation).
- [ ] Each action: disabled when AI unavailable, shows the daily-cap usage, has error
      messaging from the server (`friendlyError`) and never overwrites user input
      without consent.
- [ ] Add these buttons behind normal permissions (`useViewer().can(...)`), not just
      hidden by role name.

### 2.4 Admin switch

- [ ] Add an AI card/toggle in admin settings (Companies & Masters settings area or a
      dedicated settings tab) using `ai.status.canManage` + `api.ai.setEnabled`.
- [ ] Show provider (Groq), model, key-configured state, and the data notice.
- [ ] Toggling writes an `activityLogs` entry server-side (already implemented).

---

## 3. Acceptance criteria for task 1

- [ ] With no key: AI UI says "not configured — ask an administrator", and every call
      fails with the same message (no fabricated answer).
- [ ] With the key on the Convex deployment: chat streams token by token, survives
      reload (persisted), can be stopped, retried after an error, and lists context
      links.
- [ ] A pasted email fills trade/supplier fields only after review.
- [ ] Trade summaries regenerate and correctly show "outdated" after a trade edit.
- [ ] Clause drafting flags unknown template variables.
- [ ] Groq 429 is surfaced as a friendly, retryable message; auth failure names
      `NEXT_GROQ_AI_API_KEY`.
- [ ] No secrets reach the browser: only `NEXT_PUBLIC_*` may be public; the Groq key is
      read in Convex actions only.
- [ ] `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` pass.
