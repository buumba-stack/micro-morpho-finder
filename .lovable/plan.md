# MicroFluor v2.5 — AI Review protection, quotas, and export provenance

## Audit of what exists today

- **Authentication: none.** There is no backend at all — no Lovable Cloud, no users, no database. All state lives in the browser (IndexedDB session store, local blank library).
- **AI Review path:** `AiPanel.tsx` → `src/lib/ai-client.ts` `requestQc()` → `POST /api/public/ai-qc` → `src/lib/gpt5.server.ts` → Lovable AI Gateway → `openai/gpt-5`. The endpoint is fully public and unauthenticated today.
- **AI Chat:** same gateway via `/api/public/ai-chat`. Untouched by this update.
- **`/api/public/ai-decide`:** exists, not referenced by any UI. Stays inactive.
- **Version number:** not stored anywhere. `package.json` has no version field; the only "version" strings are the blank-library schema version and Electron packaging metadata.
- **Exports:** two CSVs (`particlesCsv`, `summaryCsv`) built in `src/lib/export-results.ts`, triggered from `SummaryPanel.tsx`.
- **Old desktop builds:** the Electron app loads from `file://`, so `aiBaseUrl()` sends AI Review to the hosted `project--…lovable.app/api/public/ai-qc` — the *same* endpoint. Those builds send no credentials and have no way to authenticate. So: their AI Review will stop working once auth is enforced; they will receive a `client_update_required` response with a clear "update to v2.5" message. Their local deterministic analysis is entirely offline and is not touched.

## Plan

### 1. Backend (Lovable Cloud)

Cloud is added **only** as an access-control and accounting layer for AI Review. The auth client is loaded lazily and its failure is contained: if Cloud/auth is unreachable, the app still opens and the full local deterministic analysis (upload, detect, threshold, edit, blanks, exports) runs normally — only the AI Review buttons degrade to "AI Review unavailable — sign-in service unreachable". No analysis, viewer, export or session-store code path awaits a Cloud call.

Email confirmation is required at signup (verified email is the anti-abuse floor for the 5 free credits); no other identity checks, no payments. Credits are only granted to a confirmed user.

New tables:


- `profiles` — `user_id`, `email`, `created_at` (created by trigger on signup).
- `ai_review_credits` — `user_id` (PK), `credits_granted` (default 5), `credits_remaining` (default 5), `successful_reviews`, `created_at`, `updated_at`. Seeded with 5 by the same signup trigger.
- `user_roles` + `app_role` enum (`owner`, `admin`, `user`) + `has_role()` security-definer function — roles never live on profiles.
- `ai_review_audit` — `id`, `user_id`, `created_at`, `success`, `charged`, `owner_exempt`, `remaining_after`, `client_version`, `model`, `gateway_request_id`, `error_code`. Readable only by owner/admin.

All tables: RLS on, explicit GRANTs, users can read only their own credit row, and **no** policy allows users to write their own credits — only server-side/service-role code adjusts balances.

Owner identification and setup: you sign up (and confirm the email) once, then a migration/server-side grant inserts your `owner` role row keyed to your authenticated user id. Before rollout I verify the row exists in the database and run the owner test (more than 5 reviews, no deduction) **before** publishing. The server only ever checks `has_role(uid,'owner')` / `'admin'` — never a client-supplied flag, email or parameter. Any later backward-compatibility change must keep this role row and check intact.

Atomic accounting — reserve first, never decrement afterwards. Two security-definer SQL functions:
- `reserve_ai_review_credit(_user_id)` — a single conditional `UPDATE … SET credits_remaining = credits_remaining - 1 WHERE user_id = _user_id AND credits_remaining > 0 RETURNING credits_remaining`. The reservation happens **before** the gateway is contacted, so a user with 1 credit cannot launch two paid gateway calls: the row lock plus the `> 0` predicate lets exactly one request win; the other is refused before any gateway traffic.
- `release_ai_review_credit(_user_id)` — restores the reserved credit (capped at `credits_granted`) whenever the gateway or upstream model call fails, so failed calls never permanently consume a credit.

Owner/admin path skips both functions entirely, so no balance can ever be decremented for you.


### 2. `/api/public/ai-qc` enforcement

Order inside the existing handler, before any gateway contact:

1. Read `Authorization: Bearer <token>`; if absent or unsupported (every pre-2.5 desktop client) → HTTP 401 with a machine-readable body, not a bare status: `{ "error": "client_update_required", "minimum_version": "2.5", "message": "AI Review requires MicroFluor v2.5 or later. Please update MicroFluor to continue using AI Review." }`. Old clients surface that message; their offline local analysis is untouched and keeps working.
2. Validate the token server-side to get the real user id (ignore any user id/role/email in the body).
3. `has_role(owner|admin)` → allowed, no reservation.
4. Normal user → `reserve_ai_review_credit`; if it returns no row → HTTP **429** `{ "error": "ai_review_quota_exhausted", "message": "You have used your 5 free AI Reviews. Standard MicroFluor analysis remains available. Additional AI Review credits may be available in a future version." }`, and the gateway is never called. (No 402 — there is no payment system.)
5. Existing input validation and the existing prompt/model/schema call run unchanged.
6. On gateway or parse failure → `release_ai_review_credit`, log audit row with `charged=false`, return the error.
7. On success → increment `successful_reviews`, log audit row with `charged=true`.

Auth failure and validation failure both happen before reservation, so they can never cost a credit.

### 2b. `/api/public/ai-chat` enforcement (amended — Chat is no longer anonymous)

Same authentication gate, separate accounting. Chat never touches `ai_review_credits`.

1. No/invalid bearer token → HTTP 401 with the same `client_update_required` / `minimum_version: "2.5"` body shape.
2. Owner/admin (`has_role`) → unlimited, no cap, request still logged.
3. Normal user → count that user's **successful** chat rows in `ai_chat_usage` over the rolling last 24 hours; if `>= AI_CHAT_DAILY_LIMIT` → HTTP 429 `{ "error": "ai_chat_rate_limit_reached", "message": "You have reached the temporary AI Chat usage limit. Please try again later." }` **before** any gateway traffic.
4. Otherwise the existing streaming call runs completely unchanged — same prompt, `openai/gpt-5`, same SSE streaming and response format. A usage row is written when the stream completes successfully; failures are logged as `success=false` and do not count toward the cap.

`AI_CHAT_DAILY_LIMIT = 50` lives in **one** server-side constant (in `src/lib/ai-quota.server.ts`); the number appears nowhere else. It's an abuse-prevention limit, so the UI mentions it only in the error message — never as a pricing/quota feature.

New table `ai_chat_usage` — `id`, `user_id`, `created_at`, `success`, `owner_exempt`, `client_version`, `model`. Lightweight ledger only, no wallet, no credits.

### 3. Frontend (minimal)

- New `/auth` route (email + password with email confirmation required) and a small `useAuth` hook. Sign-in is needed for AI Review and AI Chat only — never to open the app or analyse images.
- `AiPanel.tsx`: both AI tabs require a session; when signed out each shows a short "Sign in to use AI Review / AI Chat" CTA. Deterministic analysis, uploads, editing, blanks and exports stay fully usable signed out, and also when Cloud is down (clear availability message, no interference with analysis).
- Header/AI panel shows `AI Reviews remaining: X / 5`, or `AI Reviews: Unlimited — Owner`, read from the server after each review. Display only; the server is authoritative.
- Zero-credit and chat-limit responses render their exact messages above.
- `ai-client.ts` attaches the bearer token and the client version header to both AI endpoints. AI Chat's prompt, model, streaming, parsing and conversational behaviour are otherwise untouched.

### 4. Version + provenance

- `package.json` gains the authoritative `"version": "2.5"`. `src/lib/app-version.ts` re-exports that single value (read from `package.json`), so no second hard-coded "2.5" exists. Exports, the `client_version` sent to both AI endpoints, and the desktop/Electron metadata in `scripts/package-windows.mjs` all read it.
- New `src/lib/analysis-run.ts`: `analysis_run_id` (`crypto.randomUUID()`) and `analysis_timestamp` (ISO-8601) generated once per completed analysis run and stored on the session — metadata only, never fed into any calculation or seed.
- Exports gain three **appended trailing columns** on both CSVs: `microfluor_version`, `analysis_run_id`, `analysis_timestamp`. No header renames, no reordering, no metadata rows above the header, no change to any measurement value, unit, column meaning or numeric precision. AI Review report/summary text carries the same three fields.
- The version written is the client's own constant, so historical desktop builds never self-label as 2.5.

### Scientific freeze

Frozen for this change: segmentation, particle detection, thresholds, calibration, morphology, circularity/shape-circularity, Feret, aspect ratio, inclusion/exclusion, blank handling, preprocessing, enumeration, report/regression math, ImageJ comparison, the AI Review prompt, the AI Chat prompt, `openai/gpt-5` and its parameters. Auth, quotas, rate limiting, versioning and provenance stay entirely outside the scientific decision path. `/api/public/ai-decide` and `openai-vision.server.ts` remain inactive. No payments, no new models or modalities, no UI redesign, no unrelated refactoring.

### Final access model

| Surface | Signed out | Normal user | Owner/admin |
|---|---|---|---|
| Local analysis + exports | works | works | works |
| AI Review | blocked pre-gateway | 5 free successful reviews | unlimited, no deduction |
| AI Chat | blocked pre-gateway | 50 successful / rolling 24 h | unlimited |

All owner requests are still logged for audit.



### Files touched

Changed: `src/routes/api/public/ai-qc.ts`, `src/routes/api/public/ai-chat.ts` (auth + cap wrapper only), `src/lib/ai-client.ts`, `src/components/AiPanel.tsx`, `src/components/SummaryPanel.tsx`, `src/lib/export-results.ts`, `src/components/AnalyzerApp.tsx`, `src/lib/study-types.ts`, `src/lib/session-store.ts`, `package.json`, `scripts/package-windows.mjs`.
New: `src/lib/app-version.ts`, `src/lib/analysis-run.ts`, `src/lib/ai-quota.server.ts` (auth + role check + reservation + chat cap constant), `src/routes/auth.tsx`, `src/hooks/useAuth.ts`, one Cloud migration (`profiles`, `ai_review_credits`, `user_roles`/`has_role`, `ai_review_audit`, `ai_chat_usage`, reserve/release functions, signup trigger).

### Tests before publishing

- **Signed out:** local analysis + exports work; AI Review and AI Chat both blocked pre-gateway.
- **New confirmed account:** 5/5 → review #1 leaves 4 → review #5 leaves 0 → #6 returns 429 `ai_review_quota_exhausted` with no gateway call; a simulated upstream failure leaves the balance unchanged; chat works and does not touch review credits; exceeding the configured chat cap returns 429 `ai_chat_rate_limit_reached` pre-gateway.
- **Owner:** role row verified in the database first; then 10+ reviews and 50+ chats (or a safe simulated equivalent) all allowed, zero deductions, no cap, requests logged.
- **Security:** unauthenticated POSTs to both endpoints rejected; fake user id / admin flag ignored; frontend credit tampering ineffective; concurrent last-credit race consumes exactly one entitlement; old client cannot bypass; secrets never leave the server.
- **Cloud down:** app launches, analyses, edits and exports normally; only AI + account display degrade with a clear message.
- **Scientific regression:** representative micrographs before/after — identical counts, measurements, morphology, circularity, calibration, thresholds, blank handling, classifications and exported numbers.
- **Provenance:** every export carries `microfluor_version = 2.5`, `analysis_run_id`, `analysis_timestamp`, and stays importable in R/Python/Excel.

