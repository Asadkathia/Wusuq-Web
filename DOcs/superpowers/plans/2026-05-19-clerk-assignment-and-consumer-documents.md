# Clerk Accept/Reject + Consumer Document Visibility — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give clerks symmetric Accept/Reject controls on assigned tickets (with full audit symmetry and assignment-state cleanup) and gate clerk-uploaded documents behind a per-file `visibleToConsumer` flag served through an authenticated download endpoint.

**Architecture:**
- **Backend (NestJS / Prisma):** add `Assignment.status` enum + `acceptedAt`/`rejectedAt` timestamps; add `acceptAssignment` endpoint and harden `rejectAssignment` (require reason, mark active Assignment REJECTED, notify assigning admin). Add `TicketDocument.visibleToConsumer` boolean; add upload-time + patch endpoints for the toggle; add authenticated streaming download endpoint. Filter `documents` in the consumer ticket-view response by visibility + ticket status.
- **Frontend (Next.js):** ticket detail panel shows Accept/Reject for the assigned clerk; clerk upload UI gets a "Visible to consumer" checkbox + per-row visibility toggle; consumer ticket board switches its download links from raw `fileUrl` to the authed `/download` route.

**Tech Stack:** NestJS 11, Prisma, PostgreSQL, Next.js 16, React 19, Jest, Playwright.

---

## File Structure

**Backend:**
- Modify `apps/api/prisma/schema.prisma` — add `AssignmentStatus` enum, augment `Assignment`, add `visibleToConsumer` to `TicketDocument`.
- Create migration `apps/api/prisma/migrations/<ts>_clerk_assignment_status_and_doc_visibility/migration.sql`.
- Modify `apps/api/src/tickets/tickets.controller.ts` — new routes: `POST :id/accept-assignment`, `PATCH :id/documents/:docId`, `GET :id/documents/:docId/download`. Make `reason` required on existing reject route.
- Modify `apps/api/src/tickets/tickets.service.ts` — new methods `acceptAssignment`, `patchDocument`, `streamDocument`; harden `rejectAssignment`; teach `findOne`/consumer-view path to filter docs by `visibleToConsumer && COMPLETED`; teach `uploadDocument` to accept `visibleToConsumer`; teach completion mirror to skip invisible docs.
- Create `apps/api/src/tickets/dto/reject-assignment.dto.ts` — promotes `reason` to required.
- Create `apps/api/src/tickets/dto/patch-document.dto.ts` — `visibleToConsumer: boolean`.
- Modify `apps/api/src/tickets/tickets.service.spec.ts` — add coverage for accept/reject lifecycle + visibility filter + auth on download.

**Frontend:**
- Modify `apps/web/components/ticket-detail-panel.tsx` — Accept/Reject buttons for the assigned clerk; per-document visibility toggle for staff.
- Modify `apps/web/components/ticket-board.tsx` — replace raw `doc.fileUrl` anchors with `apiClient.getBlob('/tickets/:id/documents/:docId/download')`.
- Modify `apps/web/components/consumer-ticket-board.tsx` — same blob-download swap.
- Modify `apps/web/components/intake-wizard/file-upload.tsx` (or wherever clerk uploads happen on the portal — verify in Task 8) — add "Visible to consumer" checkbox sent with the upload.
- Modify `apps/web/lib/api-client.ts` — add `getBlob(path)` helper that fetches with auth headers and returns a `Blob` + filename.

---

## Task 1: Schema — Assignment status + document visibility

**Files:**
- Modify: `apps/api/prisma/schema.prisma`

- [ ] **Step 1: Add `AssignmentStatus` enum and augment `Assignment` + `TicketDocument`**

Edit `apps/api/prisma/schema.prisma`. After the existing enums block, add:

```prisma
enum AssignmentStatus {
  ACTIVE
  ACCEPTED
  REJECTED
  SUPERSEDED
}
```

Replace the `Assignment` model with:

```prisma
model Assignment {
  id               String           @id @default(cuid())
  ticketId         String
  representativeId String
  status           AssignmentStatus @default(ACTIVE)
  acceptedAt       DateTime?
  rejectedAt       DateTime?
  rejectionReason  String?
  createdAt        DateTime         @default(now())
  ticket           Ticket           @relation(fields: [ticketId], references: [id])
  representative   User             @relation(fields: [representativeId], references: [id])

  @@index([ticketId, status])
}
```

Replace the `TicketDocument` model with:

```prisma
model TicketDocument {
  id                 String   @id @default(cuid())
  ticketId           String
  name               String
  type               String
  fileUrl            String
  caption            String?
  visibleToConsumer  Boolean  @default(false)
  uploadedByUserId   String?
  createdAt          DateTime @default(now())
  ticket             Ticket   @relation(fields: [ticketId], references: [id])
}
```

- [ ] **Step 2: Generate migration**

Run:
```bash
cd apps/api && pnpm prisma migrate dev --name clerk_assignment_status_and_doc_visibility
```
Expected: migration files created, client regenerated, no errors.

- [ ] **Step 3: Verify existing rows backfilled**

Run:
```bash
cd apps/api && pnpm prisma studio
```
Expected (or via psql): all existing `Assignment` rows have `status=ACTIVE`; all existing `TicketDocument` rows have `visibleToConsumer=false`.

- [ ] **Step 4: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(db): assignment status enum + ticket document visibility flag"
```

---

## Task 2: Reject-assignment hardening (BE)

**Files:**
- Create: `apps/api/src/tickets/dto/reject-assignment.dto.ts`
- Modify: `apps/api/src/tickets/tickets.service.ts` (`rejectAssignment` method, ~line 1281)
- Modify: `apps/api/src/tickets/tickets.controller.ts` (~line 345)
- Test: `apps/api/src/tickets/tickets.service.spec.ts`

- [ ] **Step 1: Write the failing test**

Append to `tickets.service.spec.ts` inside the existing `describe('TicketsService')` block:

```ts
describe('rejectAssignment', () => {
  it('marks active Assignment REJECTED, reverts ticket to PENDING, requires reason, notifies admin', async () => {
    const ticketId = await seedAssignedTicket(); // existing helper, adapt if needed
    await service.rejectAssignment(ticketId, 'Cannot reach court this week', {
      actorUserId: 'clerk-1',
      actorEmail: 'clerk-1@example.com',
    });

    const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
    expect(ticket?.status).toBe('PENDING');

    const assignment = await prisma.assignment.findFirst({
      where: { ticketId },
      orderBy: { createdAt: 'desc' },
    });
    expect(assignment?.status).toBe('REJECTED');
    expect(assignment?.rejectionReason).toBe('Cannot reach court this week');
    expect(assignment?.rejectedAt).toBeInstanceOf(Date);
  });

  it('throws when reason is empty', async () => {
    const ticketId = await seedAssignedTicket();
    await expect(
      service.rejectAssignment(ticketId, '', { actorUserId: 'clerk-1' }),
    ).rejects.toThrow(/reason/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && pnpm test -- --testPathPattern=tickets.service`
Expected: FAIL — `rejectAssignment` does not set `status=REJECTED` / does not require reason.

- [ ] **Step 3: Create DTO**

Create `apps/api/src/tickets/dto/reject-assignment.dto.ts`:

```ts
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class RejectAssignmentDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  reason!: string;
}
```

- [ ] **Step 4: Update `rejectAssignment` to use Assignment status + notify**

In `apps/api/src/tickets/tickets.service.ts`, replace the `rejectAssignment` method body with:

```ts
async rejectAssignment(
  ticketId: string,
  reason: string,
  actor?: { actorUserId?: string; actorEmail?: string },
) {
  if (!reason || reason.trim().length < 3) {
    throw new BadRequestException('A reason is required to reject an assignment');
  }
  const ticket = await this.prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw new NotFoundException('Ticket not found');
  if (ticket.status !== 'ASSIGNED') {
    throw new BadRequestException('Only assigned tickets can be rejected');
  }

  const activeAssignment = await this.prisma.assignment.findFirst({
    where: { ticketId, status: 'ACTIVE' },
    orderBy: { createdAt: 'desc' },
  });

  const [updated] = await this.prisma.$transaction([
    this.prisma.ticket.update({
      where: { id: ticketId },
      data: { status: 'PENDING' },
    }),
    ...(activeAssignment
      ? [
          this.prisma.assignment.update({
            where: { id: activeAssignment.id },
            data: {
              status: 'REJECTED',
              rejectedAt: new Date(),
              rejectionReason: reason.trim(),
            },
          }),
        ]
      : []),
    this.prisma.ticketStatusHistory.create({
      data: { ticketId, from: 'ASSIGNED', to: 'PENDING', note: reason.trim() },
    }),
  ]);

  if (activeAssignment) {
    const assigningAdminId = await this.findAssigningAdminId(ticketId);
    if (assigningAdminId) {
      await this.notificationsService.create({
        userId: assigningAdminId,
        title: 'Assignment rejected',
        body: `Ticket ${ticket.batchNo} rejected by clerk: ${reason.trim()}`,
        ticketId,
      });
    }
  }

  await this.auditLogsService.create({
    action: 'TICKET_ASSIGNMENT_REJECTED',
    entity: 'TICKET',
    entityId: ticketId,
    actorUserId: actor?.actorUserId,
    actorEmail: actor?.actorEmail,
    metadata: { reason: reason.trim(), from: 'ASSIGNED', to: 'PENDING' },
  });

  return updated;
}

private async findAssigningAdminId(ticketId: string): Promise<string | null> {
  const log = await this.prisma.auditLog.findFirst({
    where: { entity: 'TICKET', entityId: ticketId, action: 'TICKET_ASSIGNED' },
    orderBy: { createdAt: 'desc' },
  });
  return log?.actorUserId ?? null;
}
```

- [ ] **Step 5: Update controller signature**

In `apps/api/src/tickets/tickets.controller.ts`, replace the `rejectAssignment` handler:

```ts
@Post(':id/reject-assignment')
rejectAssignment(
  @Param('id') id: string,
  @Body() dto: RejectAssignmentDto,
  @CurrentUser() user: AuthUser,
) {
  return this.ticketsService.rejectAssignment(id, dto.reason, {
    actorUserId: user.id,
    actorEmail: user.email,
  });
}
```

Add the import at the top: `import { RejectAssignmentDto } from './dto/reject-assignment.dto';`

- [ ] **Step 6: Update `assign` to mark prior active rows SUPERSEDED**

In the `assign` method's `$transaction` (around line 822), add this update **before** the `assignment.create`:

```ts
this.prisma.assignment.updateMany({
  where: { ticketId: id, status: 'ACTIVE' },
  data: { status: 'SUPERSEDED' },
}),
```

- [ ] **Step 7: Run test to verify it passes**

Run: `cd apps/api && pnpm test -- --testPathPattern=tickets.service`
Expected: PASS for both new test cases.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/tickets apps/api/src/tickets/dto
git commit -m "feat(tickets): require reason on reject, mark Assignment REJECTED, notify assigning admin"
```

---

## Task 3: Accept-assignment endpoint (BE)

**Files:**
- Modify: `apps/api/src/tickets/tickets.service.ts`
- Modify: `apps/api/src/tickets/tickets.controller.ts`
- Test: `apps/api/src/tickets/tickets.service.spec.ts`

- [ ] **Step 1: Write the failing test**

Append in `tickets.service.spec.ts`:

```ts
describe('acceptAssignment', () => {
  it('marks active Assignment ACCEPTED, moves ticket to IN_PROGRESS, audits', async () => {
    const ticketId = await seedAssignedTicket();
    await service.acceptAssignment(ticketId, {
      actorUserId: 'clerk-1',
      actorEmail: 'clerk-1@example.com',
    });

    const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
    expect(ticket?.status).toBe('IN_PROGRESS');

    const assignment = await prisma.assignment.findFirst({
      where: { ticketId, status: 'ACCEPTED' },
    });
    expect(assignment?.acceptedAt).toBeInstanceOf(Date);

    const log = await prisma.auditLog.findFirst({
      where: { entityId: ticketId, action: 'TICKET_ASSIGNMENT_ACCEPTED' },
    });
    expect(log).not.toBeNull();
  });

  it('rejects when ticket is not in ASSIGNED', async () => {
    const ticketId = await seedPendingTicket();
    await expect(service.acceptAssignment(ticketId, {})).rejects.toThrow(
      /ASSIGNED/,
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && pnpm test -- --testPathPattern=tickets.service`
Expected: FAIL — `service.acceptAssignment is not a function`.

- [ ] **Step 3: Implement `acceptAssignment`**

In `apps/api/src/tickets/tickets.service.ts`, add this method next to `rejectAssignment`:

```ts
async acceptAssignment(
  ticketId: string,
  actor?: { actorUserId?: string; actorEmail?: string },
) {
  const ticket = await this.prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw new NotFoundException('Ticket not found');
  if (ticket.status !== 'ASSIGNED') {
    throw new BadRequestException('Only ASSIGNED tickets can be accepted');
  }

  const activeAssignment = await this.prisma.assignment.findFirst({
    where: { ticketId, status: 'ACTIVE' },
    orderBy: { createdAt: 'desc' },
  });
  if (!activeAssignment) {
    throw new BadRequestException('No active assignment to accept');
  }
  if (actor?.actorUserId && activeAssignment.representativeId !== actor.actorUserId) {
    throw new ForbiddenException('Only the assigned representative can accept');
  }

  const [updated] = await this.prisma.$transaction([
    this.prisma.ticket.update({
      where: { id: ticketId },
      data: { status: 'IN_PROGRESS' },
    }),
    this.prisma.assignment.update({
      where: { id: activeAssignment.id },
      data: { status: 'ACCEPTED', acceptedAt: new Date() },
    }),
    this.prisma.ticketStatusHistory.create({
      data: { ticketId, from: 'ASSIGNED', to: 'IN_PROGRESS', note: 'Assignment accepted' },
    }),
  ]);

  await this.auditLogsService.create({
    action: 'TICKET_ASSIGNMENT_ACCEPTED',
    entity: 'TICKET',
    entityId: ticketId,
    actorUserId: actor?.actorUserId,
    actorEmail: actor?.actorEmail,
    metadata: { from: 'ASSIGNED', to: 'IN_PROGRESS' },
  });

  return updated;
}
```

Add `ForbiddenException` to the `@nestjs/common` import if missing.

- [ ] **Step 4: Add controller route**

In `apps/api/src/tickets/tickets.controller.ts`, next to the reject route:

```ts
@Post(':id/accept-assignment')
acceptAssignment(@Param('id') id: string, @CurrentUser() user: AuthUser) {
  return this.ticketsService.acceptAssignment(id, {
    actorUserId: user.id,
    actorEmail: user.email,
  });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/api && pnpm test -- --testPathPattern=tickets.service`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/tickets
git commit -m "feat(tickets): add explicit accept-assignment endpoint with audit symmetry"
```

---

## Task 4: Document visibility — upload + patch (BE)

**Files:**
- Create: `apps/api/src/tickets/dto/patch-document.dto.ts`
- Modify: `apps/api/src/tickets/tickets.service.ts` (`uploadDocument` method ~line 941, add new `patchDocument`)
- Modify: `apps/api/src/tickets/tickets.controller.ts`
- Test: `apps/api/src/tickets/tickets.service.spec.ts`

- [ ] **Step 1: Write the failing test**

Append in `tickets.service.spec.ts`:

```ts
describe('TicketDocument visibility', () => {
  it('uploadDocument defaults visibleToConsumer=false and accepts override', async () => {
    const ticketId = await seedTicket();
    const doc = await service.uploadDocument(
      ticketId,
      { filename: 'a.pdf', mimetype: 'application/pdf', path: '/uploads/a.pdf' },
      { actorUserId: 'clerk-1' },
      undefined,
      true,
    );
    expect(doc.visibleToConsumer).toBe(true);

    const doc2 = await service.uploadDocument(
      ticketId,
      { filename: 'b.pdf', mimetype: 'application/pdf', path: '/uploads/b.pdf' },
      { actorUserId: 'clerk-1' },
    );
    expect(doc2.visibleToConsumer).toBe(false);
  });

  it('patchDocument toggles visibility and audits', async () => {
    const ticketId = await seedTicket();
    const doc = await service.uploadDocument(
      ticketId,
      { filename: 'a.pdf', mimetype: 'application/pdf', path: '/uploads/a.pdf' },
      { actorUserId: 'clerk-1' },
    );
    const updated = await service.patchDocument(
      ticketId,
      doc.id,
      { visibleToConsumer: true },
      { actorUserId: 'clerk-1' },
    );
    expect(updated.visibleToConsumer).toBe(true);
    const log = await prisma.auditLog.findFirst({
      where: { entityId: doc.id, action: 'TICKET_DOCUMENT_VISIBILITY_CHANGED' },
    });
    expect(log).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && pnpm test -- --testPathPattern=tickets.service`
Expected: FAIL — `service.patchDocument is not a function` and `uploadDocument` ignores the visibility arg.

- [ ] **Step 3: Create DTO**

Create `apps/api/src/tickets/dto/patch-document.dto.ts`:

```ts
import { IsBoolean } from 'class-validator';

export class PatchDocumentDto {
  @IsBoolean()
  visibleToConsumer!: boolean;
}
```

- [ ] **Step 4: Extend `uploadDocument` signature**

In `apps/api/src/tickets/tickets.service.ts`, change the `uploadDocument` signature and body to:

```ts
async uploadDocument(
  ticketId: string,
  file: { filename: string; mimetype: string; path: string },
  actor?: { actorUserId?: string; actorEmail?: string },
  caption?: string,
  visibleToConsumer: boolean = false,
) {
  await this.ensureTicketExists(ticketId);
  const trimmedCaption = caption?.trim();
  const document = await this.prisma.ticketDocument.create({
    data: {
      ticketId,
      name: file.filename,
      type: file.mimetype,
      fileUrl: file.path,
      caption: trimmedCaption || null,
      visibleToConsumer,
      uploadedByUserId: actor?.actorUserId ?? null,
    },
  });
  await this.auditLogsService.create({
    action: 'TICKET_DOCUMENT_UPLOADED',
    entity: 'TICKET_DOCUMENT',
    entityId: document.id,
    actorUserId: actor?.actorUserId,
    actorEmail: actor?.actorEmail,
    metadata: { ticketId, visibleToConsumer },
  });
  return document;
}
```

- [ ] **Step 5: Add `patchDocument`**

Below `uploadDocument`, add:

```ts
async patchDocument(
  ticketId: string,
  documentId: string,
  dto: { visibleToConsumer: boolean },
  actor?: { actorUserId?: string; actorEmail?: string },
) {
  const doc = await this.prisma.ticketDocument.findFirst({
    where: { id: documentId, ticketId },
  });
  if (!doc) throw new NotFoundException('Document not found');
  const updated = await this.prisma.ticketDocument.update({
    where: { id: documentId },
    data: { visibleToConsumer: dto.visibleToConsumer },
  });
  await this.auditLogsService.create({
    action: 'TICKET_DOCUMENT_VISIBILITY_CHANGED',
    entity: 'TICKET_DOCUMENT',
    entityId: documentId,
    actorUserId: actor?.actorUserId,
    actorEmail: actor?.actorEmail,
    metadata: {
      ticketId,
      from: doc.visibleToConsumer,
      to: dto.visibleToConsumer,
    },
  });
  return updated;
}
```

- [ ] **Step 6: Update controller — accept `visibleToConsumer` on upload + add patch route**

In `apps/api/src/tickets/tickets.controller.ts`, in the upload handler body (search for the existing `/documents` POST), add to the `@Body()` destructure a `visibleToConsumer?: string` and pass `visibleToConsumer === 'true'` to the service call. Then add:

```ts
@Patch(':id/documents/:docId')
patchDocument(
  @Param('id') id: string,
  @Param('docId') docId: string,
  @Body() dto: PatchDocumentDto,
  @CurrentUser() user: AuthUser,
) {
  return this.ticketsService.patchDocument(id, docId, dto, {
    actorUserId: user.id,
    actorEmail: user.email,
  });
}
```

Add imports for `Patch` from `@nestjs/common` and `PatchDocumentDto`.

- [ ] **Step 7: Run test to verify it passes**

Run: `cd apps/api && pnpm test -- --testPathPattern=tickets.service`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/tickets
git commit -m "feat(tickets): per-document visibleToConsumer flag with upload + patch endpoints"
```

---

## Task 5: Authenticated document download (BE)

**Files:**
- Modify: `apps/api/src/tickets/tickets.service.ts`
- Modify: `apps/api/src/tickets/tickets.controller.ts`
- Test: `apps/api/src/tickets/tickets.service.spec.ts`

- [ ] **Step 1: Write the failing test**

Append in `tickets.service.spec.ts`:

```ts
describe('streamDocument', () => {
  it('returns file metadata for staff regardless of visibility', async () => {
    const { ticketId, docId } = await seedTicketWithDoc({ visibleToConsumer: false });
    const result = await service.resolveDocumentDownload(ticketId, docId, {
      userId: 'staff-1',
      role: 'CLERK',
      consumerId: null,
    });
    expect(result.filePath).toMatch(/uploads/);
  });

  it('returns file for consumer only when visible and ticket COMPLETED', async () => {
    const { ticketId, docId, consumerId } = await seedTicketWithDoc({
      visibleToConsumer: true,
      status: 'COMPLETED',
    });
    const result = await service.resolveDocumentDownload(ticketId, docId, {
      userId: consumerId,
      role: 'CONSUMER',
      consumerId,
    });
    expect(result.filePath).toBeDefined();
  });

  it('forbids consumer when doc is invisible', async () => {
    const { ticketId, docId, consumerId } = await seedTicketWithDoc({
      visibleToConsumer: false,
      status: 'COMPLETED',
    });
    await expect(
      service.resolveDocumentDownload(ticketId, docId, {
        userId: consumerId,
        role: 'CONSUMER',
        consumerId,
      }),
    ).rejects.toThrow(/forbidden|not visible/i);
  });

  it('forbids consumer when ticket is not COMPLETED', async () => {
    const { ticketId, docId, consumerId } = await seedTicketWithDoc({
      visibleToConsumer: true,
      status: 'IN_PROGRESS',
    });
    await expect(
      service.resolveDocumentDownload(ticketId, docId, {
        userId: consumerId,
        role: 'CONSUMER',
        consumerId,
      }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && pnpm test -- --testPathPattern=tickets.service`
Expected: FAIL — method missing.

- [ ] **Step 3: Implement `resolveDocumentDownload`**

In `apps/api/src/tickets/tickets.service.ts`:

```ts
async resolveDocumentDownload(
  ticketId: string,
  documentId: string,
  caller: { userId: string; role: string; consumerId: string | null },
): Promise<{ filePath: string; name: string; type: string }> {
  const doc = await this.prisma.ticketDocument.findFirst({
    where: { id: documentId, ticketId },
    include: { ticket: { select: { consumerId: true, status: true } } },
  });
  if (!doc) throw new NotFoundException('Document not found');

  const isConsumer = caller.role === 'CONSUMER';
  if (isConsumer) {
    if (doc.ticket.consumerId !== caller.consumerId) {
      throw new ForbiddenException('Not your ticket');
    }
    if (!doc.visibleToConsumer) {
      throw new ForbiddenException('Document not visible to consumer');
    }
    if (doc.ticket.status !== 'COMPLETED') {
      throw new ForbiddenException('Document available after completion');
    }
  }
  return { filePath: doc.fileUrl, name: doc.name, type: doc.type };
}
```

- [ ] **Step 4: Add controller streaming route**

In `apps/api/src/tickets/tickets.controller.ts`:

```ts
@Get(':id/documents/:docId/download')
async downloadDocument(
  @Param('id') id: string,
  @Param('docId') docId: string,
  @CurrentUser() user: AuthUser,
  @Res() res: Response,
) {
  const { filePath, name, type } = await this.ticketsService.resolveDocumentDownload(
    id,
    docId,
    { userId: user.id, role: user.role, consumerId: user.consumerId ?? user.id },
  );
  res.setHeader('Content-Type', type);
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(name)}"`);
  return createReadStream(filePath).pipe(res);
}
```

Add imports: `import { Res, Get } from '@nestjs/common'; import type { Response } from 'express'; import { createReadStream } from 'fs';`

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/api && pnpm test -- --testPathPattern=tickets.service`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/tickets
git commit -m "feat(tickets): authenticated document download with role + visibility checks"
```

---

## Task 6: Consumer ticket-view filters invisible docs (BE)

**Files:**
- Modify: `apps/api/src/tickets/tickets.service.ts` (the `findOne` / consumer-facing serializer + completion mirror around line 689)
- Test: `apps/api/src/tickets/tickets.service.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
describe('findOne visibility filter', () => {
  it('hides invisible docs from consumers, shows them to staff', async () => {
    const { ticketId, consumerId } = await seedTicketWithDocs([
      { visibleToConsumer: true },
      { visibleToConsumer: false },
    ], 'COMPLETED');

    const asConsumer = await service.findOne(ticketId, { role: 'CONSUMER', userId: consumerId });
    expect(asConsumer.documents).toHaveLength(1);
    expect(asConsumer.documents[0].visibleToConsumer).toBe(true);

    const asStaff = await service.findOne(ticketId, { role: 'CLERK', userId: 'staff-1' });
    expect(asStaff.documents).toHaveLength(2);
  });

  it('hides all docs from consumer when ticket not COMPLETED even if marked visible', async () => {
    const { ticketId, consumerId } = await seedTicketWithDocs(
      [{ visibleToConsumer: true }],
      'IN_PROGRESS',
    );
    const asConsumer = await service.findOne(ticketId, { role: 'CONSUMER', userId: consumerId });
    expect(asConsumer.documents).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && pnpm test -- --testPathPattern=tickets.service`
Expected: FAIL.

- [ ] **Step 3: Add caller context to `findOne`**

In `apps/api/src/tickets/tickets.service.ts`, change `findOne(id: string)` to `findOne(id: string, caller?: { role: string; userId: string })`. After the existing `prisma.ticket.findUnique({ include: { ..., documents: true, ... } })`, post-filter:

```ts
if (caller?.role === 'CONSUMER') {
  const completed = ticket.status === 'COMPLETED';
  ticket.documents = completed
    ? ticket.documents.filter((d) => d.visibleToConsumer)
    : [];
}
```

In `tickets.controller.ts`, find the `GET :id` handler and pass `{ role: user.role, userId: user.id }` to `findOne`.

- [ ] **Step 4: Update completion mirror to only mirror visible docs**

In `tickets.service.ts` around line 689 (the `caseDocument.create` loop), change to:

```ts
for (const doc of docs) {
  if (!doc.visibleToConsumer) continue;
  await this.prisma.caseDocument.create({
    data: {
      caseId: updated.caseId,
      ticketId: id,
      name: doc.name,
      type: doc.type,
      fileUrl: doc.fileUrl,
    },
  });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/api && pnpm test -- --testPathPattern=tickets.service`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/tickets
git commit -m "feat(tickets): filter consumer ticket documents by visibility + completion"
```

---

## Task 7: Frontend — Accept/Reject UI on ticket detail

**Files:**
- Modify: `apps/web/components/ticket-detail-panel.tsx`

- [ ] **Step 1: Locate the action bar in the component**

Read `ticket-detail-panel.tsx`. Find the JSX block where existing action buttons (e.g. "Mark complete", "Upload receipt") render, gated on status/role. Add a new block above them.

- [ ] **Step 2: Add Accept/Reject buttons + reject-reason modal**

Inside the component, add state:

```tsx
const [rejectOpen, setRejectOpen] = useState(false);
const [rejectReason, setRejectReason] = useState('');
const [busy, setBusy] = useState(false);
```

Above the existing action buttons, add (assuming `ticket`, `currentUser`, and `onRefresh` are in scope — adapt names to actual props):

```tsx
{ticket.status === 'ASSIGNED' &&
 ticket.assignments?.[0]?.representative?.id === currentUser.id && (
  <div className="flex gap-2">
    <button
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await apiClient.post(`/tickets/${ticket.id}/accept-assignment`, {});
          onRefresh();
        } finally { setBusy(false); }
      }}
      className="rounded-md bg-emerald-600 px-3 py-1.5 text-white hover:bg-emerald-700"
    >
      Accept assignment
    </button>
    <button
      disabled={busy}
      onClick={() => setRejectOpen(true)}
      className="rounded-md border border-red-300 px-3 py-1.5 text-red-700 hover:bg-red-50"
    >
      Reject
    </button>
  </div>
)}

{rejectOpen && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
    <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
      <h3 className="text-base font-semibold">Reject assignment</h3>
      <p className="mt-1 text-sm text-slate-600">
        This returns the ticket to PENDING so admins can reassign. Reason required.
      </p>
      <textarea
        value={rejectReason}
        onChange={(e) => setRejectReason(e.target.value)}
        rows={3}
        className="mt-3 w-full rounded-md border border-slate-300 p-2 text-sm"
        placeholder="Why are you rejecting this assignment?"
      />
      <div className="mt-4 flex justify-end gap-2">
        <button onClick={() => setRejectOpen(false)} className="px-3 py-1.5 text-sm">Cancel</button>
        <button
          disabled={busy || rejectReason.trim().length < 3}
          onClick={async () => {
            setBusy(true);
            try {
              await apiClient.post(`/tickets/${ticket.id}/reject-assignment`, {
                reason: rejectReason.trim(),
              });
              setRejectOpen(false);
              setRejectReason('');
              onRefresh();
            } finally { setBusy(false); }
          }}
          className="rounded-md bg-red-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          Confirm reject
        </button>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 3: Manual verification**

Run `pnpm dev`. Log in as a clerk who has an `ASSIGNED` ticket. Open the ticket detail panel. Confirm: Accept moves to IN_PROGRESS; Reject (with reason) returns to PENDING and the ticket disappears from the clerk's view; rejecting without a reason is disabled.

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/ticket-detail-panel.tsx
git commit -m "feat(web): clerk accept/reject assignment UI on ticket detail"
```

---

## Task 8: Frontend — Per-document visibility toggle (staff)

**Files:**
- Modify: `apps/web/components/ticket-detail-panel.tsx` (or wherever the document list is rendered in the staff portal — confirm via grep on `documents.map`)

- [ ] **Step 1: Identify the staff documents list**

Run from repo root:
```bash
grep -rn "ticket.documents" apps/web/components --include="*.tsx"
```

Edit each portal-facing document list (not `consumer-ticket-board.tsx`) to render a visibility toggle next to each doc.

- [ ] **Step 2: Add visibility checkbox + upload toggle**

For each `documents.map((doc) => …)` in portal components, replace the row with:

```tsx
<li className="flex items-center justify-between gap-3 rounded-md border border-slate-200 p-2 text-sm">
  <span className="truncate">{doc.name}</span>
  <label className="flex items-center gap-1 text-xs text-slate-600">
    <input
      type="checkbox"
      checked={!!doc.visibleToConsumer}
      onChange={async (e) => {
        await apiClient.patch(`/tickets/${ticket.id}/documents/${doc.id}`, {
          visibleToConsumer: e.target.checked,
        });
        onRefresh();
      }}
    />
    Visible to consumer
  </label>
</li>
```

For the file upload form on the staff side, add a checkbox bound to a `visibleToConsumer` state and include it in the `FormData` (`fd.append('visibleToConsumer', String(visibleToConsumer))`).

- [ ] **Step 3: Add `apiClient.patch` if missing**

In `apps/web/lib/api-client.ts`, confirm `patch` exists. If not, mirror `post`:

```ts
patch: async <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
```

- [ ] **Step 4: Manual verification**

Upload a doc with the toggle off → consumer doesn't see it. Toggle on after the ticket is COMPLETED → consumer sees it.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web): per-document visibleToConsumer toggle on staff portal"
```

---

## Task 9: Frontend — Authenticated download

**Files:**
- Modify: `apps/web/lib/api-client.ts`
- Modify: `apps/web/components/consumer-ticket-board.tsx`
- Modify: `apps/web/components/ticket-board.tsx` (and any other portal component linking to `doc.fileUrl`)

- [ ] **Step 1: Add `getBlob` to api-client**

In `apps/web/lib/api-client.ts`, add:

```ts
async getBlob(path: string): Promise<{ blob: Blob; filename: string }> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${getAccessToken()}` },
  });
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  const cd = res.headers.get('Content-Disposition') ?? '';
  const match = /filename="?([^"]+)"?/.exec(cd);
  const filename = match ? decodeURIComponent(match[1]) : 'download';
  return { blob: await res.blob(), filename };
},
```

- [ ] **Step 2: Replace raw fileUrl anchors with a download handler**

In `consumer-ticket-board.tsx` around line 446, replace the anchor with:

```tsx
<button
  onClick={async () => {
    const { blob, filename } = await apiClient.getBlob(
      `/tickets/${ticket.id}/documents/${doc.id}/download`,
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }}
  className="…existing classes…"
>
  {doc.name ?? 'Document'}
</button>
```

Apply the same change in any staff-portal documents list.

- [ ] **Step 3: Manual verification**

Sign in as the consumer, open a COMPLETED ticket, click a document — file downloads with the right name. Try to fetch a non-visible doc's download URL directly (paste into another tab logged out) — gets 401/403.

- [ ] **Step 4: Commit**

```bash
git add apps/web
git commit -m "feat(web): route document downloads through authed endpoint"
```

---

## Task 10: E2E smoke

**Files:**
- Create: `apps/web/e2e/clerk-assignment-and-docs.spec.ts`

- [ ] **Step 1: Add Playwright spec**

```ts
import { test, expect } from '@playwright/test';

test('clerk rejects then admin reassigns', async ({ page, browser }) => {
  // Sign in as clerk-A; reject assigned ticket with reason.
  // Switch to admin context; reassign to clerk-B; verify ticket appears for B.
});

test('consumer only sees visible documents on completed tickets', async ({ page }) => {
  // Sign in as clerk; upload one visible + one hidden doc; mark COMPLETED.
  // Sign in as consumer; assert only the visible doc renders, and download works.
});
```

Flesh out steps using existing E2E helpers in `apps/web/e2e/`.

- [ ] **Step 2: Run**

```bash
pnpm e2e -- clerk-assignment-and-docs
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/e2e
git commit -m "test(e2e): clerk reject + document visibility flows"
```

---

## Self-Review

**Spec coverage:**
- Clerk explicit reject → Task 2 (BE) + Task 7 (FE). ✓
- Clerk explicit accept → Task 3 (BE) + Task 7 (FE). ✓
- Admin reassignment after reject → Task 2 (Assignment marked REJECTED, prior ACTIVE marked SUPERSEDED on next assign) + Task 10 (E2E). ✓
- Consumer can view/download case_information & case_search PDFs after completion → Task 4 (visibility flag), Task 5 (authed download), Task 6 (filter), Task 9 (FE). ✓ (Flow-agnostic — works for every flow; gating is by `visibleToConsumer && status==='COMPLETED'`.)

**Placeholder scan:** Task 8 references "any portal component linking to `doc.fileUrl`" — that's a deliberate grep step (Step 1) with the discovery command included, not a placeholder.

**Type consistency:** `Assignment.status`, `acceptedAt`, `rejectedAt`, `rejectionReason`, `TicketDocument.visibleToConsumer`, `uploadedByUserId`, `resolveDocumentDownload`, `patchDocument`, `acceptAssignment`, `rejectAssignment` used consistently across BE tasks. Frontend uses matching field names from the JSON response.
