# Plan — client review batch 9 fixes

Spec: `DOcs/superpowers/specs/2026-09-21-client-review-batch9-findings.md`.
Branch: `fix/batch9-client-review` (from `724b599`). Baseline: **726 API tests green**.

## Global constraints

1. **Never hide a charge input without zeroing its column server-side by capability.** A hidden
   input whose column stays writable is the §4 defect: the consumer is never billed it, but
   `computeClerkEarningsBreakdown` still pays the representative for it.
2. **`computeTicketTotal`, `buildPricingResolveInput`, `computeClerkEarningsBreakdown` and
   `sumMixedCurrencyToPkr` are single sources.** Never hand-roll their formulas.
3. **A shared money rule fixed on one surface is not fixed.** This project has shipped that bug
   four times (batch-4 A, batch-5 A, batch-8 review finding 2, and §4 here). When a task changes
   a money rule, enumerate EVERY endpoint and screen that consumes it.
4. `finalizeRemainderCore` / `saveClerkCharges` must **never** write the four `clerk*Charges`
   snapshot columns — guarded by `expectFinalizeNeverWritesClerkSnapshot`. Don't delete it.
5. Never coerce an absent clerk snapshot (`null`) to `0` before the payout cap.
6. Web tests are ESM with no jsdom: components are asserted by **source-level guard tests** that
   match real JSX usage (`/<Foo\b/`, `/\{BAR\}/`), never a bare identifier. **Mutation-test every
   new guard**: break the source, confirm the test fails, restore.
7. No Prisma migration in this batch. If a task appears to need one, stop and report.
8. Verify with `pnpm test` (API), `pnpm --filter @wusuq/web test`, `pnpm lint`, `pnpm typecheck`.

---

## Task 1 — §3 Dynamic representative charge rows  🔴 money

**Root cause.** `clerkCostFields` (`apps/web/components/ticket-board.tsx:551-567`) is a flat,
unconditional array of 8 entries. Every representative sees every charge row on every ticket.

**Owner decision (2026-09-21):** rows must be dynamic per intake + service; for an attested
order nothing non-attested may appear, and vice versa. The client's red ✗ on the **Photocopy**
pair for a Case-Files ticket is **confirmed** — Case Files bills its pages through the
attested/non-attested counts, so photocopy is a redundant third counter there.

**Do:**
1. `packages/shared/src/index.ts` — set `judicial_case_files.printing = false` in
   `SERVICE_CHARGE_CAPABILITIES`. Leave the three non-judicial copy flows at `printing: true`.
   Document why in a comment (the client's own words + that Case Files counts pages through
   attestation). This one line propagates to the dialog, `finalizeRemainderCore` and
   `saveClerkCharges` together.
2. `ticket-board.tsx` — derive the visible rows from the ticket instead of the flat array:
   - `chargeCapabilitiesFor(ticket.intakeFlow, toCurrency(ticket.currency))` gates
     `.attestation` (both attested pairs), `.printing` (the Photocopy pair), `.delivery`
     (Delivery Charges).
   - `formPayload.set_type` then narrows within an attestation-capable flow:
     `attested` → attested pair only · `non_attested` → non-attested pair only · `both` → both.
     Treat an ABSENT/unrecognised `set_type` as `both` (show everything) — never as "hide
     everything", which would strand a legacy ticket with no way to enter its charges.
   - Apply the same derivation to the admin **Review & Complete** dialog's phase-2 inputs, so
     admin and representative see the same rows for the same ticket.
   - "Additional Cost" is not capability-gated; it always shows.
3. Tests: a pure exported helper (e.g. `visibleChargeFields(flow, currency, setType)`) in
   `apps/web/lib/` with unit tests per flow × set-type, plus a source guard that
   `clerkCostFields` is no longer a flat unconditional array.

**Verify:** a USD ticket and a digital flow show no phase-2 rows; Case Files + `non_attested`
shows exactly the non-attested pair and no photocopy; `non_judicial_copy_of_fir` shows the
photocopy pair and neither attestation pair.

---

## Task 2 — §4 USD tickets pay representatives for charges never billed  🔴 money

**Root cause.** `finance.service.ts` `updateCharge` (~lines 305-328) writes `deliveryCharges`,
`printingCharges`, `attestedCharges`, `nonAttestedCharges` with **no `chargeCapabilitiesFor`
gate at all**. On a USD ticket those columns never reach the flat consumer total but DO feed
`computeClerkEarningsBreakdown` — the client's own USD ticket showed rep earnings
`900 + Non-attested 700 + Delivery 500 = PKR 2,100` against a consumer total that billed zero
phase-2 charges.

**Do:**
1. `updateCharge` — gate each of the four columns on
   `chargeCapabilitiesFor(ticket.intakeFlow, toCurrency(ticket.currency))`, forcing `0` when the
   capability is off (same rule `finalizeRemainderCore` already applies). The ticket load must
   select `intakeFlow` + `currency`.
2. `tickets.service.ts` `saveClerkCharges` (~3069-3076) — the four branches are inconsistent:
   `attestedCharges`/`nonAttestedCharges` force `0` when the capability is off, but
   `printingCharges`/`deliveryCharges` pass `undefined`, which in Prisma means *leave unchanged*,
   not *zero*. Make all four force `0`.
3. **`tickets.service.ts` `submitClerkCosts` (~2670) — SCOPE ADDED after the Task 1 review.**
   It has **no `chargeCapabilitiesFor` call anywhere in its body** (verified: the only call sites
   in that file are lines 1284, 1433, 2415, 2463, 2590, 3059, 3199 — none inside it). It writes
   the four flat charge columns AND the four `clerk*Charges` payout-snapshot columns.

   The concrete leak: each charge falls through
   `dto.<charge> ?? computePageCharges(...) ?? Number(ticket.<charge>)`, so a Case-Files ticket
   carrying a legacy nonzero `printingCharges` re-snapshots that leftover into
   `clerkPrintingCharges` even though Task 1 removed the input from the UI. Because
   `computeClerkEarningsBreakdown` caps at `min(clerkSubmitted, adminFinal)` and
   `finalizeRemainderCore` forces the final column to 0, it self-corrects AFTER finalize — but
   through the whole `WAITING_APPROVAL` window both columns hold the leftover, so the clerk
   dashboard's pending-earnings figure is inflated. Gate all four the same way, forcing `0`
   when the capability is off — for the snapshot columns too, not just the flat ones.

   This is the exact failure Global Constraint 3 names: Task 1 closed the UI, Task 2 as
   originally written closed two of three server paths, and this was the third.

4. Tests: a USD ticket through `updateCharge` keeps all four at 0 even when the dto supplies
   values; `saveClerkCharges` zeroes printing + delivery for a NO_CHARGES flow. Assert the
   resulting `computeClerkEarningsBreakdown` total too — the point is the payout, not the column.

**Note:** T1 flips `judicial_case_files.printing` to `false`, so after T1 a PKR Case-Files ticket
also zeroes `printingCharges` here. That is intended; make sure the tests encode it rather than
being written against the pre-T1 capability map.

---

## Task 3 — §1 + §2 Regenerate: wrong flow, stale set-type quantities  🔴

**§2 root cause — this is worse than the client reported.** `intake-wizard.tsx` line ~1085, in
the regenerate hydration effect:

```js
flow: (source.intakeFlow as typeof current.flow) ?? current.flow,
```

`regenerateHref` targets the **service picker**, which forwards `regenerateFromTicketId` to
whichever tile the consumer chooses — so the wizard mounts on the CHOSEN flow's route
(`draft.flow` is initialised from `flows[0].key`, line 239). This effect then **overwrites that
choice with the source ticket's flow**. The consumer picks Power of Attorney and gets Case
Files. So the price "doesn't change" because the SERVICE doesn't change: **batch-7 item 1.5
never worked at all** — the picker half shipped and the wizard silently undoes it.

**§1(a) root cause.** `buildRegeneratePayload` (`apps/web/lib/regenerate-ticket.ts`) is a full
copy of every payload key. The set-type quantity keys are `attested_qty` / `non_attested_qty` /
`both_attested_qty` / `both_non_attested_qty` (`intake-flows.ts:459-481`), each gated by
`showWhen: { field: 'set_type', … }`. Changing `set_type` hides the old input but does not clear
its value, so the stale quantity is submitted — the client's Non-Attested ticket showing
`Attested Copies: 1`.

**§1(b) root cause.** `case-view.ts:60` renders `{ keys: ['attested_qty'], label: 'Attested
Copies' }` unconditionally, and `non_attested_qty` / `both_attested_qty` /
`both_non_attested_qty` are **absent from `SUMMARY_FIELDS` entirely** — so a Non-Attested or
Both order's copy count is displayed nowhere, on any ticket.

**Do:**
1. Keep the route's flow: `flow: current.flow || source.intakeFlow` (source only as a fallback
   for a wizard mounted without a pinned flow). Add a comment naming batch-7 1.5 so it is not
   "simplified" back.
2. `buildRegeneratePayload` takes the TARGET flow and prunes: drop keys that the target flow
   does not declare, and drop quantity keys that do not match the payload's `set_type`. Both
   pruning rules are the same defect — a full copy across a changed choice.
3. `case-view.ts` — render the quantity that matches `set_type`. `both` shows both. Keep the
   allowlist discipline: no arbitrary payload iteration.
4. Tests: regenerating Case Files → Case Information keeps the chosen flow and drops
   Case-Files-only keys; switching set type drops the stale quantity; the case card shows
   "Non-Attested Copies" for a non-attested order and no "Attested Copies".

---

## Task 4 — §6.2 next hearing + §6.1 consumer phone  (ticket-board.tsx; after T1)

**§6.2 root cause, and the code already knows the rule.** `ticket-board.tsx:2315` carries the
comment *"Clerk: optional next-hearing capture (PENDING tickets only)"* — but the guard beneath
it is only `isClerk && costsTicket.status === 'IN_PROGRESS'`. The helper exists:
`isPendingCase(ticket)` (line 545) reads `formPayload.case_status` and excludes
COMPLETED/DELIVERED; it has exactly one call site today (line 1630).

**Owner decision (2026-09-21):** *"Next hearing will be only available for pending cases —
decided cases are already closed and don't need a new hearing."*

**Do:** add `isPendingCase(costsTicket)` to the guard. Source guard test, mutation-proven.

**§6.1.** The representative dispatching via TCS sees the delivery address but no phone number.
`deliveryAddressLine` (line ~571) already composes the address. Surface the consumer's phone
beside it in the costs dialog. **The representative's redaction must still hold** — check what
`redactTicketForRepresentative` strips before assuming the phone is present on the row; if it is
not, that is the finding to report rather than widening the redaction unilaterally.

---

## Task 5 — §6.3 representative cannot correct submitted costs  ⚠️ money, most complex

**Root cause.** `ticket-board.tsx:1748` renders the "Update Payments" button only when
`!hasSubmittedClerkCosts(ticket)`, and the row is additionally gated on
`status === 'IN_PROGRESS'` — but `submitClerkCosts` advances `IN_PROGRESS → WAITING_APPROVAL`.
So after submitting, the representative is double-gated out. Client: *"Once clerk update the
Pages and amount, it's no way back. So we need here an update button."*

**CONTROLLER CORRECTION (verified in code before dispatch): the backend ALREADY supports this.
This is a UI-gate fix only — do not re-architect `submitClerkCosts`.**

`submitClerkCosts` (`apps/api/src/tickets/tickets.service.ts` ~2683) already accepts
`WAITING_APPROVAL` as a valid source status:

```ts
if (ticket.status !== 'IN_PROGRESS' && ticket.status !== 'WAITING_APPROVAL') {
  throw new BadRequestException('Ticket must be in progress or waiting approval');
}
```

and its conditional `updateMany` transitions `WAITING_APPROVAL → WAITING_APPROVAL` idempotently,
writing the history row in the same transaction. `ensureClerkActionAllowed` already binds it to
the active assignee. Once the admin finalizes, the ticket leaves `WAITING_APPROVAL` for
`COMPLETED`, so the existing status check already blocks a post-finalize edit — no extra
`remainderFinalizedAt` guard is needed, and no schema change.

**So the entire fix is the two UI gates in `apps/web/components/ticket-board.tsx`:**
- the action row is wrapped in `status === 'IN_PROGRESS'` (~line 1746)
- the button itself is additionally gated on `!hasSubmittedClerkCosts(ticket)` (~line 1748)

**Do:** render "Update Payments" when `status === 'IN_PROGRESS' || status === 'WAITING_APPROVAL'`,
and drop the `!hasSubmittedClerkCosts` gate. Label it so a re-submission is obvious (e.g.
"Update Payments" → "Update submitted costs" once submitted). The dialog already prefills from
the persisted columns, so re-opening shows what was submitted.

**Re-submission re-writes the four `clerk*Charges` snapshot columns** — that is correct, because
they record the REPRESENTATIVE's own declared figure and this is the representative correcting
it. Do not route this through `saveClerkCharges`, which must never write them (Global
Constraint 4).

Add a source guard test for the loosened gate, mutation-proven, and an API test that a second
`submitClerkCosts` from `WAITING_APPROVAL` succeeds and updates the snapshot columns.

## Task 6 — §8 representative nav + §9 KPI deep link  (disjoint, low risk)

**§8 root cause.** `buildClerkItems` (`apps/web/components/nav.tsx:98-134`) has **no Delivered
entry at all** — not as a nav item, not as a count. "Ready to Dispatch" points at
`/tickets/completed` with the `COMPLETED` count, and a ticket that reaches `DELIVERED` leaves
`COMPLETED`, so it vanishes from the representative's navigation entirely. The client's rep
dashboard showed "Delivered 2" with nothing in the left nav.

**Do:** add a Delivered item with `counts['DELIVERED']`. `GET /tickets/counts` is already
role-scoped to the rep's own assignments — confirm `DELIVERED` is among the statuses it returns
and add it if not. The `/tickets/delivered` route already exists (the admin dashboard links it).

**§9 root cause.** `dashboard.service.ts:1129-1134` — the `clerk_submitted` action
("Representative submissions to verify") counts `clerkApprovalStatus: 'SUBMITTED'` but deep-links
to `/tickets/in-progress`. `submitClerkCosts` sets that status while advancing to
`WAITING_APPROVAL`, so **every ticket in the count is in WAITING_APPROVAL and the target list
structurally cannot contain any of them.** Its sibling `waiting_approval` links correctly.

**Do:** `deepLink: '/tickets/waiting-approval'`. Add a test asserting the link matches the
status the count queries — that pairing is the actual invariant.

---

## Task 7 — §7 mobile + cosmetics  (disjoint, low risk)

**§7.1 focus-zoom — closes batch-6 item E, which was deferred for want of a device repro.** Both
iPhone clips show the page magnifying and clipping on every input focus. `inputClass`
(`intake-wizard.tsx:2294`) and `BASE_CLASS` (`intake-wizard/field-renderer.tsx:231`) set
**`sm:text-sm` with no base size**, so below 640px the input inherits a sub-16px size; iOS Safari
zooms any focused input under 16px. There is **no `export const viewport`** in `apps/web/app`.

**Do:** base `text-base` (16px), `sm:text-sm` above 640px, on both classes.
**Do NOT add `maximum-scale=1` or `user-scalable=no`** — that fixes the symptom by disabling
pinch-zoom, an accessibility regression. Leave the viewport export absent (Next's default
`width=device-width, initial-scale=1` is correct).

**§7.2 empty date inputs are invisible on mobile.** `type="date"` inputs in
`intake-wizard/service-geo-blocks.tsx` (~669-728) carry `ring-1 ring-inset ring-border-soft`, but
iOS renders no placeholder when empty and `placeholder:text-slate-400` cannot apply to a date
input — so "Previous case date" / "Next hearing date" render as labelled blank space on a
REQUIRED field. Give empty date inputs a visible affordance (stronger ring/border plus a visible
hint) without breaking the desktop rendering.

**§7.3** Set-type chips render lowercase (`attested`, `non attested`) while the picker offers
"Attested" / "Non Attested". `case-view.ts` already has a value humanizer (see its line ~32
comment) — route the chip through it rather than adding a second one.

**§7.4** The checkout shows a red "No pricing rule matched for this combination" mid-wizard,
before Set Type / Required Documents have been chosen; it resolves correctly once complete.
Suppress it until the resolver has enough input to be meaningful — do not suppress a genuine
no-match on a COMPLETE form (audit 1.4: unpriced intake must still fail loudly).

---

## Order

T1 → T2 → T3 → T4 → T5 (T1/T4/T5 share `ticket-board.tsx`, so sequential).
T6 and T7 are disjoint from all of the above and from each other.

## Out of scope

- §5 ledger rows — owner closed it: no code change; the data wipe is an operational action.
- §10 GoDaddy — not code.
