# Workstream G — Admin Powers — Design

**Date:** 2026-07-07
**Batch:** Owner walkthrough batch 2. Roadmap workstream **G** — the **final** batch-2 chunk (after A✅ B✅ C✅ D✅ E✅ F✅). Grounded by the WS-G code trace.
**Status:** Draft — two decisions flagged, defaulted to the Recommended option while the user was away; **confirm on review before building.**

## Scope

- **B12** — give admins delete-ticket: surface the existing soft-archive on the Unpaid/Paid tabs + a per-row delete (with confirm), and fix the two dead bulk options. FE-only (backend already archives).
- **B6** — cap phone length consistently FE + BE (PK already 10-digit; fix the loose generic path + add server-side max).
- **B13** — **deferred (decision 2):** the HC Rs 350-vs-700 is a stale rate (broken `seed-pricing.ts` parser), not a code bug — owner corrects it on the editable rate board; the parser realignment is tracked as a separate follow-up.

## Decisions (defaulted to Recommended; CONFIRM on review)

1. **B12 depth — delete on all tabs + per-row + fix dead options**, reusing the existing `/tickets/bulk-actions` soft-archive (no backend change; single-ticket = a 1-element bulk call). (Alt: bulk-only, or add a dedicated `DELETE /tickets/:id` — not needed.)
2. **B13 — defer + flag the parser.** Owner corrects the HC row on `/settings/pricing` (WS-D3 made it editable); the `seed-pricing.ts` parser realignment is a tracked follow-up, NOT built in G.

## Grounding (from the WS-G trace)

- **B12 backend exists:** `bulkAction('delete')` (`tickets.service.ts:1592-1600`) soft-archives (`archivedAt`, audit 4.2); `POST /tickets/bulk-actions` (`tickets.controller.ts:586-596`, `tickets.write`); DTO `BulkTicketActionDto` `action ∈ ['complete','delete']`, `ticketIds: string[]` (a 1-element array works). No single-ticket endpoint.
- **B12 FE gap:** `ticket-board.tsx:1023-1043` — the toolbar renders the bulk `Delete Tickets` dropdown **only when `status !== 'UNPAID' && status !== 'PAID'`** (Unpaid/Paid tabs get the Assign button instead). No per-row delete on any tab (row menu = View Details / Assign / Timeline). The dropdown also lists `download-invoice`/`send-invoice` options that are NOT in the DTO allow-list → **selecting them 400s** (dead UI).
- **B6:** `SignupDto.phone` (`auth/dto/signup.dto.ts:23-25`) = `@IsString() @MinLength(7)`, **no `@MaxLength`**. Sibling DTOs (`create-user`/`create-representative`/`update-user`) also unbounded. FE (`consumer/signup/page.tsx`): `PK_PHONE_REGEX = /^(\+?92|0)?3\d{9}$/` already enforces 10 local digits; `GENERIC_PHONE_REGEX = /^\+?\d[\d\s\-()]{5,18}\d$/` (non-PK) is loose (~19-20 chars); the phone `<Input>` has **no `maxLength`**. The dial prefix is composed at submit (`+<dial><digits>`), so the DTO receives the full E.164 string.
- **B13:** HC base resolves from xlsx-seeded `PricingRule` rows (`(region, courtLevel='High Court', flow, yearBand)`); court-type strings match on both sides (verified — not a string bug). `seed-pricing.ts` currently **aborts** ("Punjab case-record bands contributed 0 drafts") so no xlsx edit reaches the DB; the live price is from the last good seed. The rate board (`PATCH /pricing-rules/:id` accepts `basePrice`) lets an admin hand-correct it.

## Design

### B12 — delete-ticket (FE-only)
- **Bulk delete on all tabs:** remove the `UNPAID/PAID` exclusion so the `Delete Tickets` bulk dropdown + Apply render on every status tab (keep the Assign button where it applies — render both on Unpaid/Paid rather than swapping). Reuses `runBulkAction` → `POST /tickets/bulk-actions {action:'delete', ticketIds}`.
- **Per-row delete:** add a delete (trash) action to the admin row menu (next to Timeline), gated to admins, that opens a **confirm dialog** ("Archive this ticket? It's removed from lists, dues, and settlement.") and on confirm calls `POST /tickets/bulk-actions {action:'delete', ticketIds:[ticket.id]}`, then refreshes. Show only for admins (`isAdmin`), not clerks/consumers.
- **Fix the dead options:** `download-invoice`/`send-invoice` bulk options currently 400 — **remove them from the dropdown** (they were never wired to the DTO). (If the owner wants bulk invoice later, that's a separate feature; don't fake it.)
- Copy the archive semantics into the confirm text (reversible in DB, no restore UI today — accurate, no overclaim).

### B6 — phone length cap (FE + BE)
- **FE input:** add `maxLength={countryCode === 'PK' ? 10 : 15}` to the signup phone `<Input>` (immediate feedback; the field holds local digits only).
- **FE generic regex:** tighten `GENERIC_PHONE_REGEX` to a digits-length bound (7–15 digits) rather than the loose filler-char `{5,18}` (which conflates formatting with length). PK path unchanged (already correct).
- **BE authoritative gate:** add `@MaxLength(16)` to `SignupDto.phone` (covers `+` + up to 15 E.164 digits) — the server-side backstop for direct API calls / stale clients. Add the same to `CreateUserDto.phone`, `CreateRepresentativeDto.phone`, `UpdateUserDto.phone` for consistency (all currently unbounded). Extend `signup.dto.spec.ts` (has a too-short test) with a too-long case.
- **Do NOT hardcode "10" server-side** — the DTO receives the composed international string incl. dial code; 10 is the PK-specific FE-regex rule only.

### B13 — deferred
No code in G. **Owner action:** on `/settings/pricing`, find the HC row for the mis-priced ticket's `(region, yearBand, setType)` (visible in the ticket's stored `formPayload`/`priceBreakdown`) and correct `basePrice` 350 → 700. **Follow-up (tracked, not built):** realign `seed-pricing.ts`'s xlsx parser with `pricing-sheet.xlsx` so re-seeding works and future xlsx edits land — its own investigation/workstream.

## Files

- `apps/web/components/ticket-board.tsx` — B12 (bulk delete on all tabs + per-row delete + confirm; drop dead options).
- `apps/api/src/auth/dto/signup.dto.ts` (+ `signup.dto.spec.ts`), `apps/api/src/users/dto/{create-user,create-representative,update-user}.dto.ts` — B6 `@MaxLength`.
- `apps/web/app/(auth)/consumer/signup/page.tsx` — B6 `maxLength` + generic regex tighten.

## Testing

- **B12:** (mostly FE/e2e) the Delete bulk action + per-row delete appear for admins on Unpaid/Paid, post a 1-element bulk-actions delete, and the dead invoice options are gone. (Node-env limits; e2e/`test.fixme` per the usual pattern, or assert the option list.)
- **B6:** `signup.dto.spec.ts` rejects an over-long phone (`@MaxLength(16)`) and still accepts a valid one; FE generic-regex unit if extractable (a 16-digit generic number fails). Manual: signup can't type past the cap; a 19-digit number is rejected FE + BE.
- **Manual:** admin archives a ticket from a row + from the Unpaid tab bulk action → it drops out of lists/dues; signup phone capped.

## Out of scope / deferred
- **B13 code fix** (owner rate-board edit; parser realignment tracked separately).
- A **restore/unarchive** UI (archive is reversible in DB; no un-archive surface today — flagged, not built).
- Bulk invoice download/send (the dead options are removed, not implemented).
- A dedicated single-ticket DELETE endpoint (reusing bulk is sufficient).
