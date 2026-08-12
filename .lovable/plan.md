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

1. Read `Authorization: Bearer <token>`; if absent → `401` with `{ code: "client_update_required", message: "AI Review requires MicroFluor v2.5 or later. Please update MicroFluor to continue using AI Review." }`.
2. Validate the token server-side to get the real user id (ignore any user id/role/email in the body).
3. `has_role(owner|admin)` → allowed, no reservation.
4. Normal user → `reserve_ai_review_credit`; if it returns no row → `402` with the quota message, and the gateway is never called.
5. Existing input validation and the existing prompt/model/schema call run unchanged.
6. On gateway or parse failure → `refund_ai_review_credit`, log audit row with `charged=false`, return the error.
7. On success → increment `successful_reviews`, log audit row with `charged=true`.

Auth failure and validation failure both happen before reservation, so they can never cost a credit.

### 3. Frontend (minimal)

- New `/auth` route (email + password sign-in/sign-up) and a small `useAuth` hook.
- `AiPanel.tsx`: AI Review buttons require a session; when signed out show a short "Sign in to use AI Review" CTA. Deterministic analysis, uploads, editing, exports, AI Chat all stay usable signed out.
- Header/AI panel shows `AI Reviews remaining: X / 5`, or `AI Reviews: Unlimited — Owner`, read from the server after each review. Display only.
- Zero-credit response renders exactly: "You have used your 5 free AI Reviews. Standard MicroFluor analysis remains available. Additional AI Review credits may be available in a future version."
- `ai-client.ts` attaches the bearer token and `X-MicroFluor-Client: MicroFluor/2.5` + `client_version` to AI Review requests only.

### 4. Version + provenance

- New single source of truth `src/lib/app-version.ts` exporting `MICROFLUOR_VERSION = "2.5"`; `package.json` `version` set to `2.5` and the packaging script reads it. Nothing else hard-codes the number.
- New `src/lib/analysis-run.ts`: `analysis_run_id` (`crypto.randomUUID()`) and `analysis_timestamp` (ISO-8601) generated once per completed analysis run and stored on the session — metadata only, never fed into any calculation or seed.
- Exports gain three **appended trailing columns** on both CSVs: `microfluor_version`, `analysis_run_id`, `analysis_timestamp`. No header renames, no reordering, no metadata rows above the header, no value/precision changes. AI Review report/summary text also carries the three fields.
- The version written is the client's own constant, so historical desktop builds never self-label as 2.5.

### Explicit non-changes

No change to particle detection, thresholding, calibration, measurements, circularity/shape-circularity, classification, blank handling, crops, QC or report math, CSV values/units/precision, the AI Review prompt, or the `openai/gpt-5` model. AI Chat untouched. `/api/public/ai-decide` and `openai-vision.server.ts` stay inactive. No payments, no new features.

### Files touched

Changed: `src/routes/api/public/ai-qc.ts`, `src/lib/ai-client.ts`, `src/components/AiPanel.tsx`, `src/components/SummaryPanel.tsx`, `src/lib/export-results.ts`, `src/components/AnalyzerApp.tsx`, `src/lib/study-types.ts`, `src/lib/session-store.ts`, `package.json`, `scripts/package-windows.mjs`, `src/start.ts` (bearer middleware only if needed).
New: `src/lib/app-version.ts`, `src/lib/analysis-run.ts`, `src/lib/ai-quota.server.ts`, `src/routes/auth.tsx`, `src/hooks/useAuth.ts`, one Cloud migration.

### Tests after implementation

Quota sequence 5→0 and blocked 6th (no gateway call), simulated upstream failure leaves balance unchanged, persistence across refresh/logout/login, unauthenticated curl rejected, frontend tampering ineffective, spoofed user id/admin flag ignored, concurrent last-credit double-spend prevented, owner unlimited past 6/10+ reviews with zero deduction, scientific regression on existing micrographs (counts, measurements, morphology, thresholds identical), and export verification.
