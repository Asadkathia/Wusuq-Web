# Workstream D1 — Clerk Charge-Entry (Pages × Rate, Editable, TCS Receipt) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let clerks enter attested & non-attested charges as pages × per-page rate (like printing), make the admin Review & Complete page counts editable, and capture the TCS receipt in the clerk cost dialog.

**Architecture:** One schema migration (4 nullable `Ticket` columns) + backend compute changes that mirror the existing `printingCharges` pattern (`explicit ?? pages×rate ?? persisted`), plus DTO fields and two dialog UIs in `ticket-board.tsx`. The money model (`computeTicketTotal`/`computeClerkEarnings`) is untouched — it keeps reading the flat charge columns; the page columns are inputs/provenance.

**Tech Stack:** NestJS/Prisma (`apps/api`), Next.js 16/React 19 (`apps/web`); Jest (API + web unit). Prisma migration applied to Neon via `db execute` + `migrate resolve` (deploy step), NOT `migrate dev`.

**Spec:** `DOcs/superpowers/specs/2026-07-07-workstream-d1-clerk-charge-entry-design.md`.

## Global Constraints

- **Charge compute precedence (all three categories):** `dto.<charge> ?? computePageCharges(pages, rate) ?? Number(ticket.<charge>)` — explicit lump wins (admin override), then pages×rate, then the persisted value (legacy tickets with a lump and no page data keep working).
- **Money model unchanged:** `computeTicketTotal`/`computeClerkEarnings` keep reading the flat `attestedCharges`/`nonAttestedCharges`/`printingCharges` columns. Do NOT add the page columns to those functions.
- **Redaction:** consumers must NEVER see the page breakdown — extend `redactTicketForConsumer` to strip `attestedPages`/`attestedCostPerPage`/`nonAttestedPages`/`nonAttestedCostPerPage` alongside the existing `noOfPages`/`costPerPage`/`dispatchProofUrl` strip.
- **C12 state machine unchanged:** capturing `dispatchProofUrl`/`trackingNo` in the cost dialog only persists them; it does NOT flip `deliveryStatus`. The DELIVERED gate (`deliveryStatus = DISPATCHED` AND fully paid for physical flows) is untouched.
- **Migration:** committed SQL file only; do NOT run `prisma migrate dev` (Neon incompatibility). Run `prisma generate` after editing `schema.prisma` so the client types compile.
- Run `pnpm --filter @wusuq/shared build` if shared changes; `pnpm typecheck` + `pnpm lint` (both apps) + relevant tests before each commit. Commit messages end with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

## File Structure

- **Modify** `apps/api/prisma/schema.prisma` + **create** `apps/api/prisma/migrations/20260707000000_add_ticket_attested_page_breakdown/migration.sql` — 4 columns.
- **Modify** `apps/api/src/tickets/dto/submit-clerk-costs.dto.ts` — +4 page fields + dispatchProofUrl + trackingNo.
- **Modify** `apps/api/src/tickets/dto/finalize-remainder.dto.ts` — +noOfPages/costPerPage + 4 page fields.
- **Modify** `apps/api/src/tickets/tickets.service.ts` — compute/persist in `submitClerkCosts` + `finalizeRemainderCore`; `redactTicketForConsumer` strip; reuse/rename `computePrintingCharges`.
- **Modify** `apps/web/components/ticket-board.tsx` — clerk cost dialog (page inputs + receipt upload) + Review & Complete editable page inputs.
- Tests below.

Task 1 (schema) is the foundation. Tasks 2 (submitClerkCosts + redaction) and 3 (finalizeRemainderCore) are backend, sequential-ish (both edit tickets.service.ts). Task 4 (clerk dialog UI) + Task 5 (Review & Complete UI) are frontend. Parallelization noted at the end (backend tasks share tickets.service.ts, so run as one agent; UI split by dialog but same file → one agent). Given the shared-file overlap, D1 runs best as **two sequential agents** (backend, then frontend) rather than wide fan-out.

---

### Task 1: Schema — 4 attested/non-attested page columns

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (`Ticket` model, near `noOfPages`/`costPerPage` ~227-228)
- Create: `apps/api/prisma/migrations/20260707000000_add_ticket_attested_page_breakdown/migration.sql`

- [ ] **Step 1: Add the columns to `schema.prisma`** right after `costPerPage`:

```prisma
  // Clerk-entered attested/non-attested page breakdown (charge = pages × rate),
  // mirroring noOfPages/costPerPage for printing. Internal — redacted for consumers.
  attestedPages          Int?
  attestedCostPerPage    Decimal? @db.Decimal(10, 2)
  nonAttestedPages       Int?
  nonAttestedCostPerPage Decimal? @db.Decimal(10, 2)
```

- [ ] **Step 2: Write the migration SQL** at the new path:

```sql
-- add_ticket_attested_page_breakdown
ALTER TABLE "Ticket" ADD COLUMN "attestedPages" INTEGER;
ALTER TABLE "Ticket" ADD COLUMN "attestedCostPerPage" DECIMAL(10,2);
ALTER TABLE "Ticket" ADD COLUMN "nonAttestedPages" INTEGER;
ALTER TABLE "Ticket" ADD COLUMN "nonAttestedCostPerPage" DECIMAL(10,2);
```

- [ ] **Step 3: Regenerate the client** — `cd apps/api && pnpm prisma:generate`. Expected: no error; the generated client now has the 4 fields.
- [ ] **Step 4: Typecheck** — `cd apps/api && pnpm typecheck`. Expected: clean (fields exist on the Prisma types now; no usage yet).
- [ ] **Step 5: Commit** — `feat(db): add attested/non-attested page-breakdown columns to Ticket (C11)`.

---

### Task 2: `submitClerkCosts` — pages×rate compute + persist + C12 proof + redaction

**Files:**
- Modify: `apps/api/src/tickets/dto/submit-clerk-costs.dto.ts`
- Modify: `apps/api/src/tickets/tickets.service.ts` (`submitClerkCosts` ~2346-2475; `redactTicketForConsumer` ~553-560; `computePrintingCharges` ~3126)
- Test: `apps/api/src/tickets/clerk-costs-pages.spec.ts` (new)

**Interfaces:**
- Produces: `SubmitClerkCostsDto` with `attestedPages?`, `attestedCostPerPage?`, `nonAttestedPages?`, `nonAttestedCostPerPage?`, `dispatchProofUrl?`, `trackingNo?`. `submitClerkCosts` computes attested/non-attested via `computePageCharges(pages, rate)`.

- [ ] **Step 1: Add DTO fields** to `SubmitClerkCostsDto` (mirror the existing `attestedCharges` number-field style):

```ts
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0)
  attestedPages?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0)
  attestedCostPerPage?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0)
  nonAttestedPages?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0)
  nonAttestedCostPerPage?: number;

  @IsOptional() @IsString()
  dispatchProofUrl?: string;

  @IsOptional() @IsString()
  trackingNo?: string;
```
(Match the exact decorators the file already uses for its numeric fields — read the top imports; add `IsString` to the `class-validator` import if absent.)

- [ ] **Step 2: Write the failing test** (`clerk-costs-pages.spec.ts`) using the inline prisma-mock harness from an existing clerk-costs/tickets spec (read one first):

```ts
it('computes attested/nonAttested charges from pages × rate', async () => {
  const { service, updateSpy } = makeTicketsService(clerkAssignedTicket());
  await service.submitClerkCosts('t1', {
    attestedPages: 10, attestedCostPerPage: 50,
    nonAttestedPages: 4, nonAttestedCostPerPage: 30,
  } as any, repActor());
  const data = updateSpy.mock.calls.at(-1)[0].data;
  expect(Number(data.attestedCharges)).toBe(500);
  expect(Number(data.nonAttestedCharges)).toBe(120);
  expect(data.attestedPages).toBe(10);
});

it('falls back to the persisted lump when page fields are absent', async () => {
  const { service, updateSpy } = makeTicketsService(clerkAssignedTicket({ attestedCharges: 700 }));
  await service.submitClerkCosts('t1', { deliveryCharges: 0 } as any, repActor());
  expect(Number(updateSpy.mock.calls.at(-1)[0].data.attestedCharges)).toBe(700);
});

it('persists dispatchProofUrl + trackingNo (C12)', async () => {
  const { service, updateSpy } = makeTicketsService(clerkAssignedTicket());
  await service.submitClerkCosts('t1', { dispatchProofUrl: '/wallet/receipt/x.pdf', trackingNo: 'TCS-1' } as any, repActor());
  const data = updateSpy.mock.calls.at(-1)[0].data;
  expect(data.dispatchProofUrl).toBe('/wallet/receipt/x.pdf');
  expect(data.trackingNo).toBe('TCS-1');
});
```
(Adapt `makeTicketsService`/`clerkAssignedTicket`/`repActor`/`updateSpy` to the real harness + the real persistence call in `submitClerkCosts` — read the method first.)

- [ ] **Step 3: Run → FAIL** (`cd apps/api && pnpm test -- --testPathPatterns=clerk-costs-pages`).
- [ ] **Step 4: Implement** — in `submitClerkCosts`, change the attested/non-attested compute to mirror printing:

```ts
const attestedCharges =
  dto.attestedCharges ??
  this.computePageCharges(dto.attestedPages, dto.attestedCostPerPage) ??
  Number(ticket.attestedCharges);
const nonAttestedCharges =
  dto.nonAttestedCharges ??
  this.computePageCharges(dto.nonAttestedPages, dto.nonAttestedCostPerPage) ??
  Number(ticket.nonAttestedCharges);
```
Rename `computePrintingCharges` → `computePageCharges` (generic pages×rate) and update its printing call site. In the persisted `data`, add the 4 page columns (`attestedPages: dto.attestedPages ?? ticket.attestedPages`, etc.) + `dispatchProofUrl: dto.dispatchProofUrl ?? ticket.dispatchProofUrl` + `trackingNo: dto.trackingNo ?? ticket.trackingNo` (mirror how `noOfPages`/`costPerPage` are persisted).

- [ ] **Step 5: Redaction** — extend `redactTicketForConsumer` to also delete/null `attestedPages`, `attestedCostPerPage`, `nonAttestedPages`, `nonAttestedCostPerPage` (find where `noOfPages`/`costPerPage` are stripped and add the 4). Add a test asserting a consumer-redacted ticket has none of the 4.
- [ ] **Step 6: Run → PASS**, full API suite, `pnpm typecheck`, `pnpm lint`.
- [ ] **Step 7: Commit** — `feat(tickets): clerk attested/non-attested charges = pages×rate + capture TCS receipt; redact page breakdown (C11/C12)`.

---

### Task 3: `finalizeRemainderCore` — editable page counts (B11)

**Files:**
- Modify: `apps/api/src/tickets/dto/finalize-remainder.dto.ts`
- Modify: `apps/api/src/tickets/tickets.service.ts` (`finalizeRemainderCore`)
- Test: `apps/api/src/tickets/finalize-pages.spec.ts` (new) — or extend an existing finalize spec

**Interfaces:**
- Consumes: `computePageCharges` (Task 2). Produces: `FinalizeRemainderDto` with `noOfPages?`, `costPerPage?`, `attestedPages?`, `attestedCostPerPage?`, `nonAttestedPages?`, `nonAttestedCostPerPage?`.

- [ ] **Step 1: Add DTO fields** to `FinalizeRemainderDto` (same optional-number decorator style as its existing charge fields): `noOfPages`, `costPerPage`, `attestedPages`, `attestedCostPerPage`, `nonAttestedPages`, `nonAttestedCostPerPage`.
- [ ] **Step 2: Write the failing test** — an admin finalize with `attestedPages: 8, attestedCostPerPage: 25` produces `attestedCharges = 200` and persists `attestedPages: 8`; with no page fields, the existing lump/persisted value is used. (Read `finalizeRemainderCore` + its existing spec harness first.)
- [ ] **Step 3: Run → FAIL**.
- [ ] **Step 4: Implement** — in `finalizeRemainderCore`, recompute `printingCharges`/`attestedCharges`/`nonAttestedCharges` with the `dto.<charge> ?? computePageCharges(pages,rate) ?? persisted` precedence, and persist the (possibly edited) 6 page columns. Do not change the finalize money math otherwise (it already calls `computeTicketTotal`).
- [ ] **Step 5: Run → PASS**, full API suite, `pnpm typecheck`, `pnpm lint`.
- [ ] **Step 6: Commit** — `feat(tickets): Review & Complete recomputes charges from editable page counts (B11)`.

---

### Task 4: Clerk cost dialog UI — page inputs + TCS receipt (C11/C12)

**Files:**
- Modify: `apps/web/components/ticket-board.tsx` (`costsTicket` dialog, ~1363-1421)

**Interfaces:**
- Consumes: the extended `submitClerkCosts` payload (Task 2) — sends `attestedPages`/`attestedCostPerPage`/`nonAttestedPages`/`nonAttestedCostPerPage` + `dispatchProofUrl`/`trackingNo`.

- [ ] **Step 1: Page inputs (C11)** — read the current cost dialog. Where `attestedCharges`/`nonAttestedCharges` are single number inputs, replace each with a **pages + cost-per-page** pair plus a "computed automatically" line (mirror the existing printing `noOfPages`/`costPerPage` UI at ~1409-1420). Wire them into the cost form state + the submit payload. Keep the delivery/additional fields as-is.
- [ ] **Step 2: TCS receipt (C12)** — for physical-delivery flows (`caps.delivery`), add a **receipt file upload** + **tracking#** input next to the delivery-charge field. Read how the existing Mark-Dispatched dialog uploads its proof file (the endpoint + the app-relative URL it stores) and reuse that upload path; on success include `dispatchProofUrl` + `trackingNo` in the `submitClerkCosts` POST. Guard against double-submit; 10 MB cap; accept `.jpg/.jpeg/.png/.pdf` (match the existing dispatch upload's accept list).
- [ ] **Step 3: Mark-Dispatched fallback** — in the existing dispatch dialog, make the file optional when `dispatchProofUrl` is already set (don't force a re-upload). Small change; verify it doesn't break the dispatch submit.
- [ ] **Step 4: Typecheck + lint** (`cd apps/web && pnpm typecheck && pnpm lint`).
- [ ] **Step 5: Commit** — `feat(web): clerk cost dialog — attested/non-attested pages×rate + TCS receipt/tracking (C11/C12)`.

---

### Task 5: Review & Complete editable page inputs (B11)

**Files:**
- Modify: `apps/web/components/ticket-board.tsx` (Review & Complete / finalize dialog, ~1770-1830)

**Interfaces:**
- Consumes: the extended `FinalizeRemainderDto` (Task 3) — sends the 6 page fields via `reviewAndComplete`.

- [ ] **Step 1: Implement** — convert the read-only page-breakdown div (~1773-1786) into editable `Input`s: printing (`noOfPages`/`costPerPage`), attested (`attestedPages`/`attestedCostPerPage`), non-attested (`nonAttestedPages`/`nonAttestedCostPerPage`), each with a computed line. Bind into `finalizeForm` (add the 6 keys to its state ~221-232) and include them in the `reviewAndComplete` payload (~316-322). The finalize-preview total already recomputes via `computeTicketTotal` (WS-D2), so it reflects the edits.
- [ ] **Step 2: Typecheck + lint** (`cd apps/web && pnpm typecheck && pnpm lint`).
- [ ] **Step 3: Commit** — `feat(web): editable printing/attested/non-attested page counts in Review & Complete (B11)`.

---

## Self-Review

**Spec coverage:** C11 → Tasks 1 (columns) + 2 (compute) + 4 (clerk UI). B11 → Tasks 1 + 3 (finalize) + 5 (admin UI). C12 → Tasks 2 (persist proof) + 4 (upload UI). Redaction → Task 2 Step 5. All mapped.

**Placeholder scan:** the "read the real harness / the existing dispatch upload endpoint first" notes are explicit verification steps against named code, not TODOs. Test sketches carry concrete assertions.

**Type consistency:** `computePageCharges(pages, rate)` (renamed from `computePrintingCharges` in Task 2) is consumed in Task 3. The 4 column names (`attestedPages`/`attestedCostPerPage`/`nonAttestedPages`/`nonAttestedCostPerPage`) are identical across schema (Task 1), DTOs (Tasks 2/3), compute (Tasks 2/3), and UI (Tasks 4/5). `dispatchProofUrl`/`trackingNo` reuse the existing `Ticket` columns.

## Parallelization (subagent-driven)
- **Wave 1:** Task 1 (schema) alone — it's the foundation the rest compiles against.
- **Wave 2 (after Task 1 merged):** **Agent A** = Tasks 2 + 3 (both edit `tickets.service.ts` + DTOs — one agent, sequential). **Agent B** is NOT independent (Tasks 4/5 need the DTO shapes from 2/3 and both edit `ticket-board.tsx`) → run **Tasks 4 + 5 as one agent AFTER Wave 2's backend merges**.
- Net: 3 sequential agent runs (schema → backend → frontend). Low fan-out is correct here because the two service methods and the two dialogs share files.

## Verification (end-to-end)
1. `cd apps/api && pnpm test && pnpm typecheck` + `cd apps/web && pnpm typecheck && pnpm lint` clean.
2. **DB (deploy step, note for the owner):** apply the migration to Neon via `prisma db execute --file .../migration.sql` then `prisma migrate resolve --applied 20260707000000_add_ticket_attested_page_breakdown` (per CLAUDE.md; NOT `migrate dev`).
3. Manual: clerk enters attested 10×50 + non-attested 4×30 → charges 500/120; uploads a TCS receipt + tracking# in the same dialog; admin edits page counts in Review & Complete → total updates via computeTicketTotal; consumer view shows no page breakdown / no dispatch proof.
