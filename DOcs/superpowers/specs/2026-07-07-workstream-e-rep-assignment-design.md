# Workstream E — Rep & Assignment — Design

**Date:** 2026-07-07
**Batch:** Owner walkthrough batch 2. Roadmap workstream **E** (after A✅ B✅ C✅ D✅). Grounded by the WS-E code trace.
**Status:** Approved (2026-07-07) — both flagged decisions confirmed: live court seats → derive/persist tier (C4/C3); payout fields on the `User` row (C5). C18 = client-side accept loop; E ships as one workstream in 3 ordered waves.

## Scope

Rep creation + assignment quality-of-life, five items + one minor:
- **C2** — Assign dialog shows a labeled read-only **"Ticket amount"** line (today only the editable clerk-cost box shows).
- **C18** — clerk **"Accept all"** bulk-accept for Assigned tickets (+ the minor **rep-search** fix: include court/focus).
- **C4** — Add-Representative form becomes a **city-first cascade** (Province→District→City→Service→Court auto-narrowed by city→Name→Email→Phone→Password); **remove** the redundant free-text "Court City".
- **C5** — capture the rep's **payout details** (method + bank/JazzCash/EasyPaisa) so admin knows how to pay the clerk.
- **C3** — Assign-rep dropdown scopes by **court tier** (not just city): matching-tier reps first, "show others" toggle, **auto-assign when exactly one** matches.

## Decisions (defaulted to Recommended; CONFIRM on review)

1. **Rep court/tier — live court seats → derive tier.** C4's court picker is rebuilt off the live `/geo/cities/:id/courts` (auto-narrowed by the chosen city). The picked court seat's `courtLevel`/tier is **persisted on the rep** as a machine-readable tier, which C3 filters on. (Alt: an explicit CourtTier dropdown — rejected as a second thing to keep accurate.)
2. **Rep payout — fields on the `User` row.** Add payout columns to `User` (reusing the shared `PaymentMode` enum), edited in the Add/Edit-Rep form; staff-only. (Alt: a separate `RepresentativePayout` model — rejected as over-structured for one current method.)

## Grounding (from the WS-E trace)

- A **rep is a `User`** with `role: 'representative'` (no separate model). Created via `POST /users/representatives` → `UsersService.createRepresentative` (`users.service.ts:105-136`), DTO `CreateRepresentativeDto` (fields: name/email/phone/address/serviceFocus/court/**courtCity**/province/district/city/password). **No payment fields**, **no `courtLevel`/tier column**.
- `PaymentSettings` (schema `:836-846`) is the **platform's own** singleton accounts (bank/jazzCash/easyPaisa) — unrelated to reps. The shared `PaymentMode` enum = `JAZZ_CASH | EASY_PAISA | BANK_TRANSFER`.
- Add-Rep form (`representatives-board.tsx:513-663`): current order Name→Email→Phone→Password→Service (hardcoded `SERVICES` `:19-27`)→Court (hardcoded `COURTS` `:29-85`, filtered only by service)→**Court City (free text `:567`)**→Province→District→City (real `/geo/*` cascade). Two disconnected clusters; the geo cascade doesn't narrow the court.
- `representativeCandidates` (`tickets.service.ts:1432-1477`) is **city-only** today (matches `rep.courtCity`/`rep.city` vs the ticket city; empty on no-match, no full-pool fallback — the shipped city-scoping). It selects `court`/`courtCity`/`serviceFocus` but doesn't use them for tier. Assign dialog (`ticket-board.tsx:1329-1417`) rep `<select>` shows `name (city / district)`; the FE `Representative` type (`:85-90`) only carries id/name/city/district (drops the court fields the API already returns).
- Ticket tier: `courtTierFromCourtType(payload.select_court_type)` → `COURT_TIERS = ['lower','high','special','shariat','supreme','fcc']` (`@wusuq/shared`), used in pricing/required-fields, NOT in `representativeCandidates`.
- Assign dialog has an editable **clerk-cost** input seeded from `ticket.defaultClerkCost` — **`ticket.totalAmount` is never rendered** in the dialog (C2 gap). `TicketRow.totalAmount` is already on the object.
- Single accept: `acceptTicket` → `POST /tickets/:id/accept-assignment` (`tickets.clerk`, assignee-bound via `ensureClerkActionAllowed`). **No bulk-accept endpoint**; clerk rows have **no checkbox** (`isAdmin ? checkbox : null`). Admin bulk endpoints (`assign-bulk`, `bulk-actions`) are `tickets.write` (staff-only) and don't implement `accept`.
- Rep-search (`representatives-board.tsx:212-215`): filters name + `territory` (city, district) only — excludes `court`/`serviceFocus` though the table shows a "Court / Focus" column.

## Design

### C2 — read-only Ticket amount line (FE-only)
In the Assign dialog (`ticket-board.tsx`), add a labeled read-only line near the top: **"Ticket amount: {rs(assignTicket.totalAmount)}"** using the file's existing money helper. Distinct from the editable clerk-cost box (which is `defaultClerkCost`, internal). No backend change.

### C18 — clerk Accept-all + rep-search
- **Accept-all:** add a clerk-scoped selection affordance on ASSIGNED rows in the clerk view — a checkbox column (reuse the `selected` state pattern, ungated from `isAdmin` for the clerk/ASSIGNED case) + a "select all ASSIGNED" header checkbox + an **"Accept all"** button that **loops** `POST /tickets/:id/accept-assignment` over the selected ids (client-side `Promise.allSettled`, per-ticket errors surfaced; reuses the existing endpoint + `tickets.clerk` + assignee check — **no backend change**). Refresh the list after.
- **Rep-search (minor):** extend the `filtered` predicate to also match `(r.court ?? '')` and `(r.serviceFocus ?? '')`. One-line FE change.

### C4 — Add-Representative city-first cascade (live courts) + remove Court City
- **Reorder** the form to: Province → District → City/Tehsil → **Service** → **Court** → Name → Email → Phone → Password (+ Address, payout from C5). Reuse the existing `/geo/provinces|districts|cities` cascade already in the component.
- **Court picker off live seats:** replace the hardcoded `COURTS` catalog with the live **`/geo/cities/:id/courts`** fetch (the same endpoint the intake wizard uses), keyed on the selected City — so the court list auto-narrows to that city's seats. Keep Service as a filter/label on top (map Service→tier for grouping if useful). Persist the picked court's identity **and its `courtLevel`/tier** on the rep.
- **Remove "Court City"** free-text field (`:567`) + the `courtCity` key from the form state/payload. Update `representativeCandidates`' matcher to rely on `city`/`district` (no `courtCity`).
- Backend: `CreateRepresentativeDto` + `UpdateUserDto` gain a `courtLevel` (CourtTier string) — persisted on `User` (new column, see schema). Drop `courtCity` from the DTO (or leave the column nullable + no longer written).

### C5 — rep payout details (fields on User)
- **Schema:** add to `User` — `payoutMethod String?` (a `PaymentMode` value), `payoutBankName String?`, `payoutAccountTitle String?`, `payoutAccountNumber String?`, `payoutJazzCash String?`, `payoutEasyPaisa String?`. Migration (Neon-applied via `db execute` + `migrate resolve`).
- **DTO:** `CreateRepresentativeDto` + `UpdateUserDto` gain the 6 fields (optional; `payoutMethod` `@IsIn(PAYMENT_MODES)`).
- **Service:** `createRepresentative`/`update` persist them.
- **Form:** the Add/Edit-Rep form gains a payout section — a method selector (reuse the `PaymentMode` set) that reveals the relevant account fields (mirror the `PaymentMethodDetails` *input* shape, but as a form, not the read-only display).
- **Redaction:** `serializeUser` (and the `GET /users` list feeding the board) must **only expose payout fields to staff** — never to a rep about another rep or to consumers. Verify + gate.

### C3 — tier-scoped assignment (consumes C4's `courtLevel`)
- **Backend:** `representativeCandidates` gains an optional `tier` filter. When the ticket's tier is known, partition candidates: **matching-tier** (rep `courtLevel === ticket tier`) vs **others**. The Assign controller endpoint threads the ticket's tier (derived server-side via `courtTierFromCourtType` from the ticket payload) — the caller passes the ticket id or tier; do NOT trust a client tier. Return both groups (e.g. `{ matching: [...], others: [...] }`) or a flat list with a `tierMatch` boolean.
- **FE (Assign dialog):** show matching-tier reps first; an **"Show others"** toggle reveals the rest (distinct from the existing city-override toggle). **Auto-assign when exactly one** matching-tier rep: pre-select it in `openAssign`. Surface the rep's court/tier in the dropdown label (the API already returns it; add `court`/`courtLevel` to the FE `Representative` type).
- `assign` still enforces the city restriction unless `forceAssign` (unchanged); tier is an ordering/scoping aid, not a hard block (owner can still pick "others").

## Files (by item)

- **C2/C3/C18:** `apps/web/components/ticket-board.tsx` (Assign dialog + clerk checkboxes/Accept-all); `apps/api/src/tickets/tickets.service.ts` + `tickets.controller.ts` (`representativeCandidates` tier param).
- **C4/C5:** `apps/api/prisma/schema.prisma` + migration (User payout + courtLevel); `apps/api/src/users/dto/create-representative.dto.ts` + `update-user.dto.ts`; `apps/api/src/users/users.service.ts`; `apps/web/components/representatives-board.tsx` (form rebuild + payout + search). `serializeUser` redaction.

## Testing

- **API:** `createRepresentative` persists `courtLevel` + payout fields; `serializeUser` omits payout fields for non-staff callers; `representativeCandidates` partitions by tier (matching vs others) and stays city-scoped. Bulk-accept: N/A backend (client loop) — but if a bulk endpoint is chosen instead, test per-ticket assignee-binding.
- **Web:** Assign dialog renders the read-only ticket-amount line; clerk Accept-all loops accepts over selected ids; rep-search matches court/focus; Add-Rep form order + live-court narrowing + payout fields; C3 matching/others split + auto-assign-when-one.
- **Manual:** create a rep with a live-court pick (tier persisted) + payout details; assign a High-Court ticket → only tier-matching reps shown first, auto-selected when one; clerk selects several ASSIGNED tickets → Accept all.

## Build order (waves)
1. **Wave 1 (independent, no schema):** C2 (amount line) + C18 (accept-all + rep-search). FE-mostly.
2. **Wave 2 (schema):** C4 (cascade + live courts + courtLevel) + C5 (payout) — one migration, shared rep-form surface.
3. **Wave 3:** C3 (tier-scoped assign) — consumes Wave 2's `courtLevel`.

## Out of scope
- **C20** (one unified geo-UX across the whole app) — a larger intake/geo refactor → Workstream F.
- A separate Representative model (payout stays on `User`).
- Changing the DELIVERED/city-override assignment gates (tier is additive scoping, not a hard block).
- Rep data cleanup for existing anomalous rows (owner edits via the board).
