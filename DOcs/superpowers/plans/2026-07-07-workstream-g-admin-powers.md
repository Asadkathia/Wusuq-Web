# Workstream G — Admin Powers — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Give admins delete-ticket (reusing the existing soft-archive) and cap phone length consistently FE + BE.

**Architecture:** B12 is FE-only on `ticket-board.tsx` (the soft-archive `bulk-actions` endpoint already exists). B6 adds a `@MaxLength` server-side gate + tightens the FE input/regex. B13 is deferred (owner rate-board edit; parser realignment tracked separately).

**Tech Stack:** Next.js 16/React 19, NestJS/class-validator; Jest.

**Spec:** `DOcs/superpowers/specs/2026-07-07-workstream-g-admin-powers-design.md`.

## Global Constraints

- **B12 reuses `POST /tickets/bulk-actions {action:'delete', ticketIds}`** (soft-archive, `tickets.write`, admin-only) — single-ticket = a 1-element array. NO backend change. Per-row delete is **admin-only** (`isAdmin`), behind a confirm dialog. Remove the `download-invoice`/`send-invoice` bulk options (they 400 — not in the DTO allow-list).
- **B6 cap is E.164, not "10" server-side** — the DTO receives the composed international string (`+<dial><digits>`), so `@MaxLength(16)` (`+` + 15 digits). "10" is the PK-only FE-regex rule (already enforced by `PK_PHONE_REGEX`). Don't break the dial-prefix composition.
- Run `pnpm typecheck` + `pnpm lint` + tests before each commit. Commit trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

## File Structure

- `apps/web/components/ticket-board.tsx` — B12.
- `apps/api/src/auth/dto/signup.dto.ts` (+ `signup.dto.spec.ts`), `apps/api/src/users/dto/{create-user,create-representative,update-user}.dto.ts` — B6 BE.
- `apps/web/app/(auth)/consumer/signup/page.tsx` — B6 FE.

**Wave 1 (parallel, file-disjoint):** Task 1 (B12, `ticket-board.tsx`) ‖ Task 2 (B6, signup DTOs + page).

---

### Task 1: B12 — admin delete-ticket (FE-only)

**Files:**
- Modify: `apps/web/components/ticket-board.tsx`

- [ ] **Step 1: Bulk delete on all tabs** — the toolbar (~1023-1043) renders the bulk action `<select>`+Apply only when `status !== 'UNPAID' && status !== 'PAID'` (Unpaid/Paid show the Assign button instead). Change it so the **bulk action select + Apply render on every tab**, and the "Assign selected to clerk" button ALSO renders on Unpaid/Paid (render both there, not either/or). Keep `runBulkAction` (`~573`) as-is.
- [ ] **Step 2: Drop the dead options** — remove the `<option value="download-invoice">` and `<option value="send-invoice">` (~1041-1042) — they 400 (not in `BulkTicketActionDto`'s `IsIn(['complete','delete'])`). Leave `complete` + `delete`.
- [ ] **Step 3: Per-row delete (admin-only, confirm)** — add a delete action to the admin ticket row (next to View Details / Timeline, ~1281/1386), shown only when `isAdmin`. On click, open a confirm dialog ("Archive this ticket? It's removed from lists, dues, and settlement. This can't be undone from the app.") and on confirm call `apiClient.post('/tickets/bulk-actions', { action: 'delete', ticketIds: [ticket.id] })`, then `loadTickets()`. Reuse the file's existing dialog/modal + busy-flag patterns; flash on success/error.
- [ ] **Step 4: Typecheck + lint** (`cd apps/web && pnpm typecheck && pnpm lint`); `pnpm test` green.
- [ ] **Step 5: Commit** — `feat(web): admin delete-ticket — bulk on all tabs + per-row archive; drop dead invoice options (B12)`.

---

### Task 2: B6 — phone length cap (FE + BE)

**Files:**
- Modify: `apps/api/src/auth/dto/signup.dto.ts`
- Modify: `apps/api/src/auth/dto/signup.dto.spec.ts`
- Modify: `apps/api/src/users/dto/create-user.dto.ts`, `create-representative.dto.ts`, `update-user.dto.ts`
- Modify: `apps/web/app/(auth)/consumer/signup/page.tsx`

- [ ] **Step 1: Write the failing test** — extend `signup.dto.spec.ts` (has a too-short test at ~32): add a too-long case, e.g. `phone: '+' + '9'.repeat(20)` → expect a `phone` validation error. Run → FAIL.
- [ ] **Step 2: BE cap** — add `@MaxLength(16)` to `SignupDto.phone` (import `MaxLength` from `class-validator`; keep `@MinLength(7)`). Add the same `@MaxLength(16)` to the `phone` field on `CreateUserDto`, `CreateRepresentativeDto`, `UpdateUserDto` (all currently `@IsOptional() @IsString()` unbounded). Run → PASS; full API suite green.
- [ ] **Step 3: FE input + regex** — in `consumer/signup/page.tsx`: add `maxLength={countryCode === 'PK' ? 10 : 15}` to the phone `<Input>` (~282-293; the field holds LOCAL digits only, so 10 for PK / 15 generic). Tighten `GENERIC_PHONE_REGEX` (~19) to a digits-length bound — e.g. `/^\+?\d[\d\s\-()]{5,13}\d$/` → prefer a clean digits-only check: strip non-digits then require length 7–15. Leave `PK_PHONE_REGEX` unchanged (already correct). Don't touch the submit-time dial-prefix composition (~106-110).
- [ ] **Step 4: Typecheck + lint** both apps; `pnpm test` (API + web) green.
- [ ] **Step 5: Commit** — `feat(auth): cap phone length (E.164 max server-side, tighten FE input + generic regex) (B6)`.

---

## Self-Review

**Spec coverage:** B12 → Task 1 (bulk on all tabs + per-row + drop dead options). B6 → Task 2 (BE `@MaxLength` + FE maxLength/regex). B13 deferred (no task, by decision). All in-scope mapped.

**Placeholder scan:** the toolbar/row/DTO line refs are from the trace; each step names the exact change. No TODOs.

**Type consistency:** B12 reuses the existing `runBulkAction`/`bulk-actions` shape. B6 `@MaxLength(16)` consistent across all four DTOs; FE `maxLength` is local-digit count (10/15), BE cap is composed-string length (16) — intentionally different, documented.

## Parallelization
- **Wave 1:** Task 1 (`ticket-board.tsx`) ‖ Task 2 (signup DTOs + page) — file-disjoint, 2 parallel agents.

## Verification (end-to-end)
1. `cd apps/api && pnpm test && pnpm typecheck` + `cd apps/web && pnpm typecheck && pnpm lint && pnpm test` clean.
2. Manual: admin archives a ticket from a row (confirm dialog) + via the Unpaid-tab bulk Delete → it drops out of lists/dues; the dead invoice bulk options are gone; signup rejects a 19-digit phone (FE can't type past the cap; BE rejects a crafted long value).

## Deferred (tracked, not built)
- **B13** — owner corrects the HC rate on `/settings/pricing`; `seed-pricing.ts` parser realignment is a separate follow-up.
- Restore/unarchive UI; bulk invoice download/send; a dedicated single-ticket DELETE endpoint.
