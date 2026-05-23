# Clerk Workflow Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clerk-facing ticket workflow: role-gated detail view, intake-type display fix, ordered case details, document categories (work vs deliverable-PDF) with multi-file upload, multi-ticket assignment, and clerk next-hearing capture + admin follow-up generation.

**Architecture:** Mostly additive. One schema change (`DocumentCategory` + `TicketDocument.category`). Backend adds `assignBulk`, `recordNextHearing`, and `generateNextHearing` (reusing the per-ticket `assign` logic and the future-ticket prefill). Frontend role-gates the existing `ticket-detail-panel.tsx` and extends `ticket-board.tsx`. Config (case-details key order) lives in `@wusuq/shared`.

**Tech Stack:** NestJS 11 + Prisma/Postgres (api), Next.js 16 (web), `@wusuq/shared`, Jest (api tests).

**Spec:** `DOcs/superpowers/specs/2026-05-23-clerk-workflow-redesign-design.md`

**Execution order:** Phase 0 (schema + shared) first. Then Phase 1 (backend) and Phase 2 (frontend) — frontend calls Phase 1 endpoints, so do Phase 1 first. Phase 3 verifies. Migration (Phase 0) needs the Neon DB (owner/outside-sandbox).

**Existing references to mirror:**
- Upload: `tickets.service.ts` `uploadDocument` (~991) + `tickets.controller.ts` `@Post(':id/documents/upload')` (~418).
- Single assign: `tickets.service.ts` `assign` (~794), `AssignTicketDto`.
- Future-ticket prefill (copied keys): `apps/web/lib/future-tickets.ts`.
- Detail panel: `apps/web/components/ticket-detail-panel.tsx` (`renderPayload`, section headers, `currentUserId`).
- Ticket board: `apps/web/components/ticket-board.tsx` (assign dialog, clerk costs/finalize dialogs).

---

## PHASE 0 — Schema + shared (run first)

### Task 0.1: `DocumentCategory` enum + `TicketDocument.category`

**Files:** `apps/api/prisma/schema.prisma`

- [ ] **Step 1: Add the enum** near the other enums (after `WalletTransactionType`):

```prisma
enum DocumentCategory {
  WORK_DOCUMENT
  DELIVERABLE_PDF
}
```

- [ ] **Step 2: Add the column** to `model TicketDocument` (after `visibleToConsumer`):

```prisma
  category           DocumentCategory @default(WORK_DOCUMENT)
```

- [ ] **Step 3: Validate schema** — Run: `cd apps/api && npx prisma validate` → "schema is valid".

- [ ] **Step 4: Migrate** (needs DB; owner runs if sandbox blocks Neon) — Run: `cd apps/api && npx prisma migrate dev --name ticket_document_category`
Expected: migration created + applied + client regenerated.

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(db): TicketDocument.category (work vs deliverable PDF)"
```

---

### Task 0.2: Shared case-details key order + helper

**Files:** `packages/shared/src/index.ts`; Test: `apps/api/src/tickets/tickets.service.spec.ts`

- [ ] **Step 1: Add the order constant + ordering helper** to `packages/shared/src/index.ts`:

```ts
// Canonical render order for ticket case-details (Spec 3). Keys not listed are
// appended after, alphabetically. Resolved through PAYLOAD_FIELD_ALIASES so
// aliased keys land in the right slot.
export const CASE_DETAILS_ORDER: string[] = [
  'select_court_city', 'city', 'serviceCity',
  'select_court', 'select_court_type', 'bench',
  'select_service',
  'case_type', 'case_type_other',
  'case_petition_no',
  'case_year',
  'case_title',
  'judge_designation', 'judge_name',
  'case_date', 'future_date', 'scheduledDate',
];

export function orderCaseDetailKeys(keys: string[]): string[] {
  const rank = new Map(CASE_DETAILS_ORDER.map((k, i) => [k, i]));
  const known = keys.filter((k) => rank.has(k)).sort((a, b) => rank.get(a)! - rank.get(b)!);
  const unknown = keys.filter((k) => !rank.has(k)).sort((a, b) => a.localeCompare(b));
  return [...known, ...unknown];
}
```

- [ ] **Step 2: Write the failing test** in `apps/api/src/tickets/tickets.service.spec.ts`:

```ts
import { orderCaseDetailKeys } from '@wusuq/shared';

describe('orderCaseDetailKeys (Spec 3)', () => {
  it('orders known keys city→court→service→…, appends unknown alphabetically', () => {
    const out = orderCaseDetailKeys(['case_title', 'zzz_extra', 'select_court_city', 'select_service', 'aaa_extra']);
    expect(out).toEqual(['select_court_city', 'select_service', 'case_title', 'aaa_extra', 'zzz_extra']);
  });
});
```

- [ ] **Step 3: Build shared + run test** — Run: `pnpm --filter @wusuq/shared build && cd apps/api && pnpm test src/tickets/tickets.service.spec.ts` → PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/index.ts apps/api/src/tickets/tickets.service.spec.ts
git commit -m "feat(shared): canonical case-details key order + helper"
```

---

## PHASE 1 — Backend

### Task 1.1: Document category on upload

**Files:** `apps/api/src/tickets/tickets.service.ts` (`uploadDocument`), `tickets.controller.ts` (upload route)

- [ ] **Step 1: Extend `uploadDocument`** signature + create data in `tickets.service.ts` (~991). Add a `category` param defaulting to `'WORK_DOCUMENT'`; when `'DELIVERABLE_PDF'`, force `visibleToConsumer=true`:

```ts
  async uploadDocument(
    ticketId: string,
    file: { filename: string; mimetype: string; path: string },
    actor?: { actorUserId?: string; actorEmail?: string },
    caption?: string,
    visibleToConsumer: boolean = false,
    category: 'WORK_DOCUMENT' | 'DELIVERABLE_PDF' = 'WORK_DOCUMENT',
  ) {
    await this.ensureTicketExists(ticketId);
    const trimmedCaption = caption?.trim();
    const consumerVisible = category === 'DELIVERABLE_PDF' ? true : visibleToConsumer;
    const document = await this.prisma.ticketDocument.create({
      data: {
        ticketId,
        name: file.filename,
        type: file.mimetype,
        fileUrl: file.path,
        caption: trimmedCaption && trimmedCaption.length > 0 ? trimmedCaption : null,
        visibleToConsumer: consumerVisible,
        category,
        uploadedByUserId: actor?.actorUserId ?? null,
      },
    });
    // …keep the existing audit-log + visibleToConsumer notification block…
```

(Leave the rest of the method — audit log, `if (visibleToConsumer)` notification — intact, but reference `consumerVisible` in that condition.)

- [ ] **Step 2: Pass `category` from the controller** (`tickets.controller.ts` ~457). Add a body param and forward it:

```ts
    @Body('category') category: 'WORK_DOCUMENT' | 'DELIVERABLE_PDF' | undefined,
    @CurrentUser() actor: JwtUser | undefined,
  ) {
    if (!file) throw new BadRequestException('File is required');
    return this.ticketsService.uploadDocument(
      id, file,
      { actorUserId: actor?.sub, actorEmail: actor?.email },
      typeof caption === 'string' ? caption.slice(0, 200) : undefined,
      visibleToConsumer === 'true',
      category === 'DELIVERABLE_PDF' ? 'DELIVERABLE_PDF' : 'WORK_DOCUMENT',
    );
  }
```

- [ ] **Step 3: Surface `category` in document responses** — wherever documents are mapped for the detail/list (`findOne` documents include), ensure `category` is selected/returned (the `include` returns full rows, so it's present; if a `select` is used, add `category: true`).

- [ ] **Step 4: Typecheck** — Run: `cd apps/api && pnpm typecheck` → 0 new errors.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/tickets/tickets.service.ts apps/api/src/tickets/tickets.controller.ts
git commit -m "feat(tickets): document category on upload (deliverable PDF auto-visible)"
```

---

### Task 1.2: Bulk assignment

**Files:** `apps/api/src/tickets/tickets.service.ts` (new `assignBulk`), `tickets.controller.ts` (route), `dto/assign-bulk.dto.ts`; Test: spec

- [ ] **Step 1: DTO** `apps/api/src/tickets/dto/assign-bulk.dto.ts`:

```ts
import { ArrayNotEmpty, IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';

export class AssignBulkDto {
  @IsArray() @ArrayNotEmpty() @IsString({ each: true })
  ticketIds!: string[];

  @IsString()
  representativeId!: string;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  forceAssign?: boolean;
}
```

- [ ] **Step 2: Write the failing test** (spec) — `assignBulk` assigns each ticket with its own `defaultClerkCost` and reports gating-skipped ones:

```ts
describe('assignBulk (Spec 3)', () => {
  it('assigns each ticket using its own defaultClerkCost; collects skipped', async () => {
    // Build a service whose `assign` is spied: resolves for tkt-ok, throws ForbiddenException for tkt-bad.
    // Assert assign called with clerkCost = each ticket's defaultClerkCost, and result.skipped contains tkt-bad.
  });
});
```

(Implement the harness mirroring the existing assign tests; mock `prisma.ticket.findUnique` to return `{ id, defaultClerkCost }` per id.)

- [ ] **Step 3: Implement `assignBulk`** in `tickets.service.ts`:

```ts
  async assignBulk(
    dto: { ticketIds: string[]; representativeId: string; forceAssign?: boolean },
    actor?: { actorUserId?: string; actorEmail?: string },
  ) {
    const assigned: string[] = [];
    const skipped: { ticketId: string; reason: string }[] = [];
    for (const ticketId of dto.ticketIds) {
      const t = await this.prisma.ticket.findUnique({
        where: { id: ticketId },
        select: { id: true, defaultClerkCost: true },
      });
      if (!t) { skipped.push({ ticketId, reason: 'Not found' }); continue; }
      try {
        await this.assign(
          ticketId,
          {
            representativeId: dto.representativeId,
            clerkCost: t.defaultClerkCost != null ? Number(t.defaultClerkCost) : undefined,
            forceAssign: dto.forceAssign,
          },
          actor,
        );
        assigned.push(ticketId);
      } catch (e) {
        skipped.push({ ticketId, reason: e instanceof Error ? e.message : 'Failed' });
      }
    }
    return { assigned, skipped };
  }
```

(Match the real `assign` signature/param shape — check `assign` (~794) and pass the same DTO/actor arguments it expects.)

- [ ] **Step 4: Route** in `tickets.controller.ts` (mirror the single-assign route's guard):

```ts
  @RequirePermissions('tickets.write')
  @Post('assign-bulk')
  assignBulk(@Body() dto: AssignBulkDto, @CurrentUser() actor: JwtUser | undefined) {
    return this.ticketsService.assignBulk(dto, { actorUserId: actor?.sub, actorEmail: actor?.email });
  }
```

- [ ] **Step 5: Run test + typecheck** → PASS / 0 new errors.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/tickets/tickets.service.ts apps/api/src/tickets/tickets.controller.ts apps/api/src/tickets/dto/assign-bulk.dto.ts apps/api/src/tickets/tickets.service.spec.ts
git commit -m "feat(tickets): bulk assignment using each ticket's defaultClerkCost"
```

---

### Task 1.3: Clerk next-hearing capture + admin follow-up generation

**Files:** `apps/api/src/tickets/tickets.service.ts` (`recordNextHearing`, `generateNextHearing`), `tickets.controller.ts`, DTOs; Test: spec

- [ ] **Step 1: DTOs** — `dto/record-next-hearing.dto.ts`:

```ts
import { IsDateString, IsOptional, IsString } from 'class-validator';
export class RecordNextHearingDto {
  @IsDateString() scheduledDate!: string;
  @IsOptional() @IsString() hearingType?: string;
}
```

- [ ] **Step 2: Write failing tests** (spec):
  - `recordNextHearing` sets `scheduledDate` (+ `hearingType`) on the ticket.
  - `generateNextHearing` creates a new ticket with `consumerId` = parent's, `createdBy='CONSUMER'`, `status='PENDING'`, `paymentStatus='UNPAID'`, copies the case-identifier keys, seeds the parent's recorded `scheduledDate` into the new payload's hearing date, and stamps `parent_ticket_id`.

- [ ] **Step 3: Implement `recordNextHearing`**:

```ts
  async recordNextHearing(
    ticketId: string,
    dto: { scheduledDate: string; hearingType?: string },
  ) {
    await this.ensureTicketExists(ticketId);
    return this.prisma.ticket.update({
      where: { id: ticketId },
      data: {
        scheduledDate: new Date(dto.scheduledDate),
        ...(dto.hearingType ? { hearingType: dto.hearingType } : {}),
      },
    });
  }
```

- [ ] **Step 4: Implement `generateNextHearing`** (mirror `future-tickets.ts` COPIED_KEYS server-side). Copy case-identifier fields from the parent's `formPayload`, set `case_status='Pending Case'`, set the new `case_date` to the parent's recorded `scheduledDate` (ISO date), stamp `parent_ticket_id`:

```ts
  private static FUTURE_COPIED_KEYS = [
    'city','city_id','select_court','select_court_id','select_court_type',
    'select_court_city','case_type','case_no','case_title','case_year','bench',
    'judge_name','judge_designation',
  ];

  async generateNextHearing(
    parentId: string,
    actor?: { actorUserId?: string; actorEmail?: string },
  ) {
    const parent = await this.prisma.ticket.findUnique({ where: { id: parentId } });
    if (!parent) throw new NotFoundException('Ticket not found');
    if (!parent.scheduledDate)
      throw new BadRequestException('No next-hearing date recorded on this ticket');
    const srcPayload = (parent.formPayload ?? {}) as Record<string, unknown>;
    const payload: Record<string, unknown> = {};
    for (const k of TicketsService.FUTURE_COPIED_KEYS) {
      if (srcPayload[k] !== undefined) payload[k] = srcPayload[k];
    }
    payload.case_status = 'Pending Case';
    payload.case_date = parent.scheduledDate.toISOString().slice(0, 10);
    payload.parent_ticket_id = parent.id;

    return this.prisma.ticket.create({
      data: {
        batchNo: this.generateBatchNo(),
        consumerId: parent.consumerId,
        serviceId: parent.serviceId,
        status: 'PENDING',
        createdBy: 'CONSUMER', // consumer-owned → Spec 2 payment gating applies
        serviceCity: parent.serviceCity,
        caseType: parent.caseType,
        intakeFlow: parent.intakeFlow,
        formPayload: payload as Prisma.InputJsonValue,
        serviceCost: parent.serviceCost,
        defaultClerkCost: parent.defaultClerkCost,
        totalAmount: parent.serviceCost, // base only; SPLIT remainder later
        amountPaid: 0,
        paymentStatus: 'UNPAID',
      },
    });
  }
```

> Note: `serviceCost` is copied from the parent as a reasonable base; if you want a fresh resolve, call `pricingService.resolve` with the new payload instead. Copying is acceptable for a same-case follow-up. Add a `ticketStatusHistory` "Generated next-hearing from {parent.batchNo}" entry + audit log mirroring `regenerate`.

- [ ] **Step 5: Routes** in `tickets.controller.ts`:

```ts
  @RequirePermissions('tickets.write')
  @Post(':id/next-hearing')
  recordNextHearing(@Param('id') id: string, @Body() dto: RecordNextHearingDto) {
    return this.ticketsService.recordNextHearing(id, dto);
  }

  @RequirePermissions('tickets.write')
  @Post(':id/generate-next-hearing')
  generateNextHearing(@Param('id') id: string, @CurrentUser() actor: JwtUser | undefined) {
    return this.ticketsService.generateNextHearing(id, { actorUserId: actor?.sub, actorEmail: actor?.email });
  }
```

- [ ] **Step 6: Run tests + typecheck** → PASS / 0 new errors.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/tickets
git commit -m "feat(tickets): clerk next-hearing capture + admin follow-up generation"
```

---

## PHASE 2 — Frontend

### Task 2.1: Detail panel — role gate + intake type + ordered case details

**Files:** `apps/web/components/ticket-detail-panel.tsx`

- [ ] **Step 1: Intake type** — render `ticket.intakeFlow` (via `FLOW_LABELS` from `@wusuq/shared`, fallback raw) in the Service/Case header for all viewers.
- [ ] **Step 2: Ordered case details** — replace the `renderPayload` key iteration with `orderCaseDetailKeys(Object.keys(payload))` from `@wusuq/shared` to drive render order.
- [ ] **Step 3: Role gate** — accept a `viewerRole` (or `isClerkView`) prop derived from the logged-in user (representative/clerk). When clerk view: render only the Case Details section + a single "Clerk Cost" line (`ticket.clerkCost`); skip the consumer-info, full-charges, payment, and timeline sections. Admin/staff unchanged.
- [ ] **Step 4: Group documents by category** — show "Work documents" vs "Deliverable PDF(s)" using `doc.category`.
- [ ] **Step 5: Typecheck + eslint** — `cd apps/web && pnpm typecheck` (0) + `npx eslint components/ticket-detail-panel.tsx` (no new errors).
- [ ] **Step 6: Commit** — `feat(web): clerk-gated ticket detail, intake type, ordered case details`.

### Task 2.2: Two-zone document upload (clerk)

**Files:** `apps/web/components/ticket-board.tsx` (or the upload sub-component), the documents client/upload call.

- [ ] **Step 1:** Add two labelled drop zones — "Work documents" (`category=WORK_DOCUMENT`) and "Deliverable PDF(s)" (`category=DELIVERABLE_PDF`) — each accepting **multiple files** (loop the upload POST per file, sending the `category` field in the multipart body).
- [ ] **Step 2:** Typecheck + eslint → clean. Commit: `feat(web): clerk two-zone multi-file document upload`.

### Task 2.3: Multi-ticket assignment

**Files:** `apps/web/components/ticket-board.tsx`, `apps/web/lib/payments-client.ts` (or the tickets client).

- [ ] **Step 1:** Add row checkboxes + a "select all" to the pending list; track selected ticket ids.
- [ ] **Step 2:** "Assign selected to clerk" opens the representative picker → call `POST /tickets/assign-bulk` with `{ ticketIds, representativeId }`. Show a result toast (assigned N, skipped M with reasons).
- [ ] **Step 3:** Typecheck + eslint → clean. Commit: `feat(web): multi-ticket bulk assignment`.

### Task 2.4: Clerk next-hearing field + admin generate button

**Files:** `apps/web/components/ticket-board.tsx`.

- [ ] **Step 1:** In the clerk completion / clerk-charges flow for **pending** tickets, add an optional "Next hearing" toggle + date (and optional type) → `POST /tickets/:id/next-hearing`.
- [ ] **Step 2:** On a completed pending ticket with `scheduledDate` set, show an admin "Generate next-hearing ticket" button → `POST /tickets/:id/generate-next-hearing`; on success toast the new batchNo.
- [ ] **Step 3:** Typecheck + eslint → clean. Commit: `feat(web): clerk next-hearing capture + admin generate follow-up`.

---

## PHASE 3 — Verification

### Task 3.1: Full verification

- [ ] **Step 1:** `pnpm --filter @wusuq/shared build && pnpm lint && pnpm typecheck && pnpm test`
Expected: PASS (pre-existing `pakistan-seed.ts` prettier issue is unrelated; confirm no NEW failures).

- [ ] **Step 2: Manual smoke (api + web, DB migrated):**
  - Clerk login: detail shows only case info + clerk cost; intake type visible; case details ordered city→court→service→….
  - Two upload zones; multiple files upload; deliverable PDFs are consumer-visible, work docs are not.
  - Multi-select pending tickets → bulk-assign to a clerk; each gets its own clerk cost; gating-failing ones reported.
  - Clerk records next hearing at completion of a pending Case Info ticket; admin "Generate next-hearing ticket" creates a consumer-owned, unpaid follow-up prefilled with the recorded date; consumer can pay it.

- [ ] **Step 3:** Commit any fixups.

---

## Self-review notes (author)

- **Spec coverage:** §1 clerk view → 2.1; §2 intake bug → 2.1; §3 ordering → 0.2/2.1; §4–5 docs → 0.1/1.1/2.2; §6 bulk assign → 1.2/2.3; §7 next-hearing → 1.3/2.4. All covered.
- **Migration** (0.1) needs DB access — owner runs `prisma migrate dev` (or I run it outside the sandbox).
- **`assign` signature:** Task 1.2 must match the real `assign(ticketId, dto, actor)` shape — verify before wiring.
- **`generateNextHearing` consumer-owned:** `createdBy='CONSUMER'` is deliberate so Spec 2 gating bills the consumer (admin-created would be exempt).
