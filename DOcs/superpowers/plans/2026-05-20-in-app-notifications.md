# In-App Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing notification infrastructure to fire in-app (and selectively email) notifications for every meaningful ticket, payment/wallet, case, and account event, routed to the right audience, delivered in real time via SSE.

**Architecture:** A typed `NotificationDispatcher` (one method per event) becomes the single entry point business services call. It resolves audiences, renders copy from a templates module, and calls the low-level `NotificationsService.create()` (DB row + SSE push) plus `sendEmail()` for high-signal events. `create()` is refactored to stop emailing implicitly. The frontend topbar subscribes to the existing `/notifications/stream` SSE endpoint instead of polling.

**Tech Stack:** NestJS 11, Prisma 6, Jest 30 (ESM), Next.js 16, React 19, Server-Sent Events.

**Spec:** `DOcs/superpowers/specs/2026-05-20-in-app-notifications-design.md`

---

## File Structure

**Create:**
- `packages/shared/src/index.ts` — append `NOTIFICATION_TYPES` + `NotificationType` (modify existing file)
- `apps/api/src/notifications/notification-audiences.ts` — Prisma-role arrays for admin / finance audiences
- `apps/api/src/notifications/notification-templates.ts` — title/body copy, one entry per event×audience
- `apps/api/src/notifications/notification-dispatcher.service.ts` — the typed dispatcher
- `apps/api/src/notifications/notification-dispatcher.service.spec.ts` — dispatcher unit tests

**Modify:**
- `apps/api/src/notifications/notifications.service.ts` — drop implicit email from `create()`
- `apps/api/src/notifications/notifications.service.spec.ts` — new spec for the refactor
- `apps/api/src/notifications/notifications.module.ts` — provide + export `NotificationDispatcher`
- `apps/api/src/auth/jwt.strategy.ts` — accept token from `?token=` query (for SSE)
- `apps/api/src/tickets/tickets.service.ts` — swap `notificationsService` for `dispatcher`, add call sites
- `apps/api/src/tickets/tickets.service.spec.ts` — migrate mocks to dispatcher
- `apps/api/src/payments/payments.service.ts` + `payments.module.ts`
- `apps/api/src/wallet/wallet.service.ts` + `wallet.module.ts`
- `apps/api/src/cases/cases.service.ts`
- `apps/api/src/auth/auth.service.ts` + `auth.module.ts`
- `apps/api/src/users/users.service.ts` + `users.module.ts`
- `apps/web/components/ui/shell-topbar.tsx` — SSE subscription + deep-links

---

## Conventions for every task

- API tests run from `apps/api/`: `pnpm test -- --testPathPattern=<name>`
- Prisma `UserRole` enum values use **underscores** (`super_admin`), shared union uses **hyphens** (`super-admin`). Audience queries use the Prisma underscore form.
- Commit after each task's tests pass. Commit messages follow the repo's conventional style (`feat:`, `refactor:`, `test:`).
- Do **not** run `git push` or open a PR — the user commits/pushes manually.

---

## Task 1: Notification type codes in shared

**Files:**
- Modify: `packages/shared/src/index.ts` (append at end)

- [ ] **Step 1: Add the const + type**

Append to `packages/shared/src/index.ts`:

```ts
export const NOTIFICATION_TYPES = {
  TICKET_CREATED: 'ticket.created',
  TICKET_STATUS_CHANGED: 'ticket.status_changed',
  TICKET_COMPLETED: 'ticket.completed',
  TICKET_ASSIGNED: 'ticket.assigned',
  TICKET_REASSIGNED: 'ticket.reassigned',
  TICKET_ASSIGNMENT_ACCEPTED: 'ticket.assignment_accepted',
  TICKET_ASSIGNMENT_REJECTED: 'ticket.assignment_rejected',
  TICKET_CLERK_COSTS_SUBMITTED: 'ticket.clerk_costs_submitted',
  TICKET_CLERK_RECEIPT_SUBMITTED: 'ticket.clerk_receipt_submitted',
  TICKET_CLERK_RECEIPT_VERIFIED: 'ticket.clerk_receipt_verified',
  TICKET_CLERK_RECEIPT_REJECTED: 'ticket.clerk_receipt_rejected',
  TICKET_DOCUMENT_UPLOADED: 'ticket.document_uploaded',
  TICKET_REGENERATED: 'ticket.regenerated',
  PAYMENT_COMPLETED: 'payment.completed',
  WALLET_TOPUP_CREATED: 'wallet.topup_created',
  WALLET_TOPUP_VERIFIED: 'wallet.topup_verified',
  WALLET_TOPUP_REJECTED: 'wallet.topup_rejected',
  WALLET_RECEIPT_UPLOADED: 'wallet.receipt_uploaded',
  CASE_CREATED: 'case.created',
  CASE_STATUS_CHANGED: 'case.status_changed',
  CASE_DRIFT_DETECTED: 'case.drift_detected',
  AUTH_PASSWORD_CHANGED: 'auth.password_changed',
  AUTH_IMPERSONATION_STARTED: 'auth.impersonation_started',
} as const;

export type NotificationType =
  (typeof NOTIFICATION_TYPES)[keyof typeof NOTIFICATION_TYPES];
```

- [ ] **Step 2: Rebuild shared and typecheck**

Run: `pnpm --filter @wusuq/shared build && pnpm typecheck`
Expected: PASS (no type errors).

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/index.ts
git commit -m "feat(shared): add NOTIFICATION_TYPES constant and NotificationType union"
```

---

## Task 2: Refactor `NotificationsService.create()` to stop implicit email

The current `create()` always emails the recipient. That blocks scaling event coverage. Email becomes an explicit dispatcher decision.

**Files:**
- Modify: `apps/api/src/notifications/notifications.service.ts`
- Test: `apps/api/src/notifications/notifications.service.spec.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/notifications/notifications.service.spec.ts`:

```ts
import { jest } from '@jest/globals';
import { NotificationsService } from './notifications.service';

function build() {
  const prisma = {
    notification: {
      create: jest.fn().mockResolvedValue({
        id: 'n1',
        userId: 'u1',
        title: 'T',
        body: 'B',
        type: 'system',
        createdAt: new Date(),
      }),
    },
    user: { findUnique: jest.fn() },
  };
  const emailService = { send: jest.fn().mockResolvedValue(undefined) };
  const sseService = { push: jest.fn() };
  const service = new NotificationsService(
    prisma as never,
    emailService as never,
    sseService as never,
  );
  return { service, prisma, emailService, sseService };
}

describe('NotificationsService', () => {
  it('writes a DB row and pushes SSE but does NOT email on create()', async () => {
    const { service, prisma, emailService, sseService } = build();

    await service.create({ userId: 'u1', title: 'T', body: 'B' });

    expect(prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 'u1', title: 'T', type: 'system' }),
      }),
    );
    expect(sseService.push).toHaveBeenCalledWith('u1', expect.objectContaining({ id: 'n1' }));
    expect(emailService.send).not.toHaveBeenCalled();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('sendEmail() still delegates to EmailService', async () => {
    const { service, emailService } = build();
    await service.sendEmail('a@b.com', 'subj', '<p>x</p>');
    expect(emailService.send).toHaveBeenCalledWith('a@b.com', 'subj', '<p>x</p>');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && pnpm test -- --testPathPattern=notifications.service`
Expected: FAIL — `emailService.send` IS currently called by `create()`.

- [ ] **Step 3: Refactor `create()`**

In `apps/api/src/notifications/notifications.service.ts`, remove the email block. The method becomes:

```ts
async create(data: {
  userId: string;
  title: string;
  body?: string;
  type?: string;
  metadata?: Record<string, unknown>;
}) {
  const notification = await this.prisma.notification.create({
    data: {
      userId: data.userId,
      title: data.title,
      body: data.body,
      type: data.type ?? 'system',
      metadata: (data.metadata ?? {}) as Prisma.InputJsonValue,
    },
  });

  this.sseService.push(data.userId, {
    id: notification.id,
    title: notification.title,
    body: notification.body,
    type: notification.type,
    createdAt: notification.createdAt,
  });

  return notification;
}
```

Delete the now-unused `user.findUnique` + `emailService.send` lines from `create()`. Keep the `sendEmail()` method and the `EmailService` injection (the dispatcher uses `sendEmail`).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && pnpm test -- --testPathPattern=notifications.service`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/notifications/notifications.service.ts apps/api/src/notifications/notifications.service.spec.ts
git commit -m "refactor(notifications): make create() in-app+SSE only, email is explicit via sendEmail"
```

---

## Task 3: Audience resolution constants

**Files:**
- Create: `apps/api/src/notifications/notification-audiences.ts`

- [ ] **Step 1: Create the file**

```ts
import { UserRole as PrismaUserRole } from '@prisma/client';

// Back-office roles that triage tickets / assignments. Mirrors the admin
// surface implied by tickets.write on non-consumer roles. Prisma enum form.
export const ADMIN_NOTIFY_ROLES: PrismaUserRole[] = [
  PrismaUserRole.super_admin,
  PrismaUserRole.manager_admin,
  PrismaUserRole.staff_admin,
  PrismaUserRole.lead_admin,
];

// Roles that act on money (verify top-ups, review costs/receipts). Subset of
// admins holding finance.* / wallet.write per ROLE_PERMISSIONS in shared.
export const FINANCE_NOTIFY_ROLES: PrismaUserRole[] = [
  PrismaUserRole.super_admin,
  PrismaUserRole.manager_admin,
  PrismaUserRole.staff_admin,
];
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/api && pnpm exec tsc --noEmit -p tsconfig.json`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/notifications/notification-audiences.ts
git commit -m "feat(notifications): add admin/finance audience role constants"
```

---

## Task 4: Notification copy templates

**Files:**
- Create: `apps/api/src/notifications/notification-templates.ts`

- [ ] **Step 1: Create the file**

Each function returns `{ title, body }`. Inputs are primitives the dispatcher already has (no Prisma types leaked).

```ts
type Copy = { title: string; body: string };

export const notificationTemplates = {
  ticketCreatedForConsumer: (batchNo: string, serviceName: string): Copy => ({
    title: `Request submitted — ${batchNo}`,
    body: `Your ${serviceName} request is in the queue. We'll keep you posted as it progresses.`,
  }),
  ticketCreatedForAdmin: (batchNo: string, serviceName: string): Copy => ({
    title: `New ticket — ${batchNo}`,
    body: `A ${serviceName} request was submitted and is awaiting triage.`,
  }),
  ticketStatusForConsumer: (batchNo: string, to: string): Copy => ({
    title: `Update on ${batchNo}`,
    body: `Your request status is now ${to.replace(/_/g, ' ').toLowerCase()}.`,
  }),
  ticketStatusForAssignee: (batchNo: string, to: string): Copy => ({
    title: `Ticket ${batchNo} → ${to.replace(/_/g, ' ').toLowerCase()}`,
    body: `A ticket assigned to you changed status to ${to.replace(/_/g, ' ').toLowerCase()}.`,
  }),
  ticketCompletedForConsumer: (batchNo: string, serviceName: string): Copy => ({
    title: `Service completed — ${batchNo}`,
    body: `${serviceName} has been completed. Log in to download your documents.`,
  }),
  ticketAssignedForAssignee: (batchNo: string, serviceName: string): Copy => ({
    title: `New assignment — ${batchNo}`,
    body: `You've been assigned a ${serviceName} ticket. Review and accept it.`,
  }),
  ticketReassignedForOldAssignee: (batchNo: string): Copy => ({
    title: `Assignment removed — ${batchNo}`,
    body: `Ticket ${batchNo} has been reassigned to another representative.`,
  }),
  ticketAssignmentAcceptedForAdmin: (batchNo: string): Copy => ({
    title: `Assignment accepted — ${batchNo}`,
    body: `The representative accepted ticket ${batchNo}.`,
  }),
  ticketAssignmentRejectedForAdmin: (batchNo: string, reason: string): Copy => ({
    title: `Assignment rejected — ${batchNo}`,
    body: `Ticket ${batchNo} was rejected by the representative: ${reason}`,
  }),
  ticketClerkCostsForBackOffice: (batchNo: string): Copy => ({
    title: `Costs submitted — ${batchNo}`,
    body: `Clerk costs for ticket ${batchNo} are ready for review.`,
  }),
  ticketClerkReceiptSubmittedForBackOffice: (batchNo: string): Copy => ({
    title: `Receipt submitted — ${batchNo}`,
    body: `A clerk receipt for ticket ${batchNo} is awaiting verification.`,
  }),
  ticketClerkReceiptDecidedForAssignee: (
    batchNo: string,
    decision: 'VERIFIED' | 'REJECTED',
  ): Copy => ({
    title: `Receipt ${decision.toLowerCase()} — ${batchNo}`,
    body:
      decision === 'VERIFIED'
        ? `Your receipt for ticket ${batchNo} was verified.`
        : `Your receipt for ticket ${batchNo} was rejected. Please resubmit.`,
  }),
  ticketDocumentUploadedForConsumer: (batchNo: string): Copy => ({
    title: `New document — ${batchNo}`,
    body: `A document is now available on your request ${batchNo}.`,
  }),
  ticketRegeneratedForConsumer: (batchNo: string): Copy => ({
    title: `Request regenerated — ${batchNo}`,
    body: `A new request ${batchNo} has been created from a previous one.`,
  }),
  paymentCompletedForConsumer: (batchNo: string): Copy => ({
    title: `Payment received — ${batchNo}`,
    body: `We've received your payment for ticket ${batchNo}. Thank you.`,
  }),
  paymentCompletedForFinance: (batchNo: string): Copy => ({
    title: `Payment received — ${batchNo}`,
    body: `Payment for ticket ${batchNo} has been confirmed.`,
  }),
  walletTopupCreatedForConsumer: (amount: number): Copy => ({
    title: `Top-up submitted`,
    body: `Your wallet top-up of PKR ${amount} is awaiting verification.`,
  }),
  walletTopupCreatedForFinance: (amount: number): Copy => ({
    title: `Top-up awaiting verification`,
    body: `A wallet top-up of PKR ${amount} needs review.`,
  }),
  walletTopupDecidedForConsumer: (
    amount: number,
    decision: 'VERIFIED' | 'REJECTED',
  ): Copy => ({
    title: decision === 'VERIFIED' ? `Top-up approved` : `Top-up rejected`,
    body:
      decision === 'VERIFIED'
        ? `Your wallet top-up of PKR ${amount} has been credited.`
        : `Your wallet top-up of PKR ${amount} was rejected.`,
  }),
  walletReceiptUploadedForFinance: (): Copy => ({
    title: `Wallet receipt uploaded`,
    body: `A consumer uploaded a wallet payment receipt for review.`,
  }),
  caseCreatedForConsumer: (caseRef: string): Copy => ({
    title: `Case opened — ${caseRef}`,
    body: `A case file ${caseRef} has been opened for you.`,
  }),
  caseStatusForConsumer: (caseRef: string, to: string): Copy => ({
    title: `Case ${caseRef} updated`,
    body: `Your case ${caseRef} status is now ${to.toLowerCase()}.`,
  }),
  caseDriftForAdmin: (caseRef: string): Copy => ({
    title: `Context drift — ${caseRef}`,
    body: `A completed ticket reported values that differ from case ${caseRef}.`,
  }),
  authPasswordChanged: (): Copy => ({
    title: `Password changed`,
    body: `Your account password was changed. If this wasn't you, contact support.`,
  }),
  authImpersonationStarted: (adminEmail: string): Copy => ({
    title: `Admin access to your account`,
    body: `An administrator (${adminEmail}) started a support session on your account.`,
  }),
};
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/api && pnpm exec tsc --noEmit -p tsconfig.json`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/notifications/notification-templates.ts
git commit -m "feat(notifications): add notification copy templates module"
```

---

## Task 5: NotificationDispatcher — ticket events

Dispatcher methods take **IDs** and load relations internally (call sites stay one-liners; no caller pre-loads includes).

**Files:**
- Create: `apps/api/src/notifications/notification-dispatcher.service.ts`
- Test: `apps/api/src/notifications/notification-dispatcher.service.spec.ts`

- [ ] **Step 1: Write failing tests (ticket events)**

Create `apps/api/src/notifications/notification-dispatcher.service.spec.ts`:

```ts
import { jest } from '@jest/globals';
import { NOTIFICATION_TYPES } from '@wusuq/shared';
import { NotificationDispatcher } from './notification-dispatcher.service';

function build() {
  const prisma = {
    ticket: { findUnique: jest.fn() },
    user: { findMany: jest.fn().mockResolvedValue([]) },
    assignment: { findFirst: jest.fn() },
    auditLog: { findFirst: jest.fn() },
    case: { findUnique: jest.fn() },
    walletTransaction: { findUnique: jest.fn() },
  };
  const notifications = {
    create: jest.fn().mockResolvedValue({}),
    sendEmail: jest.fn().mockResolvedValue(undefined),
  };
  const dispatcher = new NotificationDispatcher(
    prisma as never,
    notifications as never,
  );
  return { dispatcher, prisma, notifications };
}

describe('NotificationDispatcher — tickets', () => {
  it('ticketCreated notifies consumer (in-app + email) and admins (in-app)', async () => {
    const { dispatcher, prisma, notifications } = build();
    prisma.ticket.findUnique.mockResolvedValue({
      id: 't1',
      batchNo: 'TKT-1',
      consumerId: 'c1',
      consumer: { id: 'c1', email: 'c@x.com' },
      service: { name: 'Case Files' },
    });
    prisma.user.findMany.mockResolvedValue([{ id: 'a1' }, { id: 'a2' }]);

    await dispatcher.ticketCreated('t1');

    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'c1',
        type: NOTIFICATION_TYPES.TICKET_CREATED,
      }),
    );
    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'a1' }),
    );
    expect(notifications.sendEmail).toHaveBeenCalledWith(
      'c@x.com',
      expect.any(String),
      expect.any(String),
    );
  });

  it('ticketStatusChanged notifies consumer + active assignee; emails consumer only on COMPLETED', async () => {
    const { dispatcher, prisma, notifications } = build();
    prisma.ticket.findUnique.mockResolvedValue({
      id: 't1',
      batchNo: 'TKT-1',
      consumerId: 'c1',
      consumer: { id: 'c1', email: 'c@x.com' },
      service: { name: 'Case Files' },
    });
    prisma.assignment.findFirst.mockResolvedValue({ representativeId: 'r1' });

    await dispatcher.ticketStatusChanged('t1', 'PENDING', 'IN_PROGRESS');
    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'c1', type: NOTIFICATION_TYPES.TICKET_STATUS_CHANGED }),
    );
    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'r1' }),
    );
    expect(notifications.sendEmail).not.toHaveBeenCalled();

    notifications.create.mockClear();
    await dispatcher.ticketStatusChanged('t1', 'WAITING_APPROVAL', 'COMPLETED');
    expect(notifications.sendEmail).toHaveBeenCalledWith('c@x.com', expect.any(String), expect.any(String));
  });

  it('ticketAssignmentRejected notifies the assigning admin from the audit trail', async () => {
    const { dispatcher, prisma, notifications } = build();
    prisma.ticket.findUnique.mockResolvedValue({ id: 't1', batchNo: 'TKT-1' });
    prisma.auditLog.findFirst.mockResolvedValue({ actorUserId: 'admin-1' });

    await dispatcher.ticketAssignmentRejected('t1', 'cannot reach court');

    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'admin-1',
        type: NOTIFICATION_TYPES.TICKET_ASSIGNMENT_REJECTED,
      }),
    );
    expect(notifications.sendEmail).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/api && pnpm test -- --testPathPattern=notification-dispatcher`
Expected: FAIL — module not found / methods undefined.

- [ ] **Step 3: Implement the dispatcher (ticket events + helpers)**

Create `apps/api/src/notifications/notification-dispatcher.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { NOTIFICATION_TYPES } from '@wusuq/shared';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from './notifications.service';
import { notificationTemplates as T } from './notification-templates';
import {
  ADMIN_NOTIFY_ROLES,
  FINANCE_NOTIFY_ROLES,
} from './notification-audiences';

@Injectable()
export class NotificationDispatcher {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  // ─── audience helpers ───
  private async adminIds(): Promise<string[]> {
    const rows = await this.prisma.user.findMany({
      where: { role: { in: ADMIN_NOTIFY_ROLES }, isActive: true },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  private async financeIds(): Promise<string[]> {
    const rows = await this.prisma.user.findMany({
      where: { role: { in: FINANCE_NOTIFY_ROLES }, isActive: true },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  private async activeAssigneeId(ticketId: string): Promise<string | null> {
    const a = await this.prisma.assignment.findFirst({
      where: { ticketId, status: { in: ['ACTIVE', 'ACCEPTED'] } },
      orderBy: { createdAt: 'desc' },
      select: { representativeId: true },
    });
    return a?.representativeId ?? null;
  }

  private async assigningAdminId(ticketId: string): Promise<string | null> {
    const log = await this.prisma.auditLog.findFirst({
      where: { entity: 'TICKET', entityId: ticketId, action: 'TICKET_ASSIGNED' },
      orderBy: { createdAt: 'desc' },
      select: { actorUserId: true },
    });
    return log?.actorUserId ?? null;
  }

  private async loadTicket(ticketId: string) {
    return this.prisma.ticket.findUnique({
      where: { id: ticketId },
      include: {
        consumer: { select: { id: true, email: true } },
        service: { select: { name: true } },
      },
    });
  }

  // ─── ticket events ───
  async ticketCreated(ticketId: string): Promise<void> {
    const t = await this.loadTicket(ticketId);
    if (!t) return;
    const consumerCopy = T.ticketCreatedForConsumer(t.batchNo, t.service.name);
    await this.notifications.create({
      userId: t.consumerId,
      ...consumerCopy,
      type: NOTIFICATION_TYPES.TICKET_CREATED,
      metadata: { ticketId: t.id, batchNo: t.batchNo },
    });
    if (t.consumer.email) {
      await this.notifications.sendEmail(
        t.consumer.email,
        consumerCopy.title,
        `<p>${consumerCopy.body}</p>`,
      );
    }
    const adminCopy = T.ticketCreatedForAdmin(t.batchNo, t.service.name);
    for (const id of await this.adminIds()) {
      await this.notifications.create({
        userId: id,
        ...adminCopy,
        type: NOTIFICATION_TYPES.TICKET_CREATED,
        metadata: { ticketId: t.id, batchNo: t.batchNo },
      });
    }
  }

  async ticketStatusChanged(
    ticketId: string,
    from: string,
    to: string,
  ): Promise<void> {
    const t = await this.loadTicket(ticketId);
    if (!t) return;
    const isCompleted = to === 'COMPLETED';
    const consumerCopy = isCompleted
      ? T.ticketCompletedForConsumer(t.batchNo, t.service.name)
      : T.ticketStatusForConsumer(t.batchNo, to);
    await this.notifications.create({
      userId: t.consumerId,
      ...consumerCopy,
      type: isCompleted
        ? NOTIFICATION_TYPES.TICKET_COMPLETED
        : NOTIFICATION_TYPES.TICKET_STATUS_CHANGED,
      metadata: { ticketId: t.id, batchNo: t.batchNo, from, to },
    });
    if (isCompleted && t.consumer.email) {
      await this.notifications.sendEmail(
        t.consumer.email,
        consumerCopy.title,
        `<p>${consumerCopy.body}</p>`,
      );
    }
    const assigneeId = await this.activeAssigneeId(ticketId);
    if (assigneeId && assigneeId !== t.consumerId) {
      const assigneeCopy = T.ticketStatusForAssignee(t.batchNo, to);
      await this.notifications.create({
        userId: assigneeId,
        ...assigneeCopy,
        type: NOTIFICATION_TYPES.TICKET_STATUS_CHANGED,
        metadata: { ticketId: t.id, batchNo: t.batchNo, from, to },
      });
    }
  }

  async ticketAssigned(ticketId: string, assigneeId: string): Promise<void> {
    const t = await this.loadTicket(ticketId);
    if (!t) return;
    const copy = T.ticketAssignedForAssignee(t.batchNo, t.service.name);
    await this.notifications.create({
      userId: assigneeId,
      ...copy,
      type: NOTIFICATION_TYPES.TICKET_ASSIGNED,
      metadata: { ticketId: t.id, batchNo: t.batchNo },
    });
    const assigneeUser = await this.prisma.user.findUnique({
      where: { id: assigneeId },
      select: { email: true },
    });
    if (assigneeUser?.email) {
      await this.notifications.sendEmail(
        assigneeUser.email,
        copy.title,
        `<p>${copy.body}</p>`,
      );
    }
  }

  async ticketReassigned(
    ticketId: string,
    prevAssigneeId: string,
    newAssigneeId: string,
  ): Promise<void> {
    const t = await this.loadTicket(ticketId);
    if (!t) return;
    await this.ticketAssigned(ticketId, newAssigneeId);
    if (prevAssigneeId && prevAssigneeId !== newAssigneeId) {
      const copy = T.ticketReassignedForOldAssignee(t.batchNo);
      await this.notifications.create({
        userId: prevAssigneeId,
        ...copy,
        type: NOTIFICATION_TYPES.TICKET_REASSIGNED,
        metadata: { ticketId: t.id, batchNo: t.batchNo },
      });
    }
  }

  async ticketAssignmentAccepted(ticketId: string): Promise<void> {
    const t = await this.loadTicket(ticketId);
    if (!t) return;
    const copy = T.ticketAssignmentAcceptedForAdmin(t.batchNo);
    const adminId = await this.assigningAdminId(ticketId);
    const targets = adminId ? [adminId] : await this.adminIds();
    for (const id of targets) {
      await this.notifications.create({
        userId: id,
        ...copy,
        type: NOTIFICATION_TYPES.TICKET_ASSIGNMENT_ACCEPTED,
        metadata: { ticketId: t.id, batchNo: t.batchNo },
      });
    }
  }

  async ticketAssignmentRejected(
    ticketId: string,
    reason: string,
  ): Promise<void> {
    const t = await this.loadTicket(ticketId);
    if (!t) return;
    const adminId = await this.assigningAdminId(ticketId);
    if (!adminId) return;
    const copy = T.ticketAssignmentRejectedForAdmin(t.batchNo, reason);
    await this.notifications.create({
      userId: adminId,
      ...copy,
      type: NOTIFICATION_TYPES.TICKET_ASSIGNMENT_REJECTED,
      metadata: { ticketId: t.id, batchNo: t.batchNo, reason },
    });
    const adminUser = await this.prisma.user.findUnique({
      where: { id: adminId },
      select: { email: true },
    });
    if (adminUser?.email) {
      await this.notifications.sendEmail(
        adminUser.email,
        copy.title,
        `<p>${copy.body}</p>`,
      );
    }
  }

  async ticketClerkCostsSubmitted(ticketId: string): Promise<void> {
    const t = await this.loadTicket(ticketId);
    if (!t) return;
    const copy = T.ticketClerkCostsForBackOffice(t.batchNo);
    const ids = new Set([...(await this.adminIds()), ...(await this.financeIds())]);
    for (const id of ids) {
      await this.notifications.create({
        userId: id,
        ...copy,
        type: NOTIFICATION_TYPES.TICKET_CLERK_COSTS_SUBMITTED,
        metadata: { ticketId: t.id, batchNo: t.batchNo },
      });
    }
  }

  async ticketClerkReceiptSubmitted(ticketId: string): Promise<void> {
    const t = await this.loadTicket(ticketId);
    if (!t) return;
    const copy = T.ticketClerkReceiptSubmittedForBackOffice(t.batchNo);
    const ids = new Set([...(await this.adminIds()), ...(await this.financeIds())]);
    for (const id of ids) {
      await this.notifications.create({
        userId: id,
        ...copy,
        type: NOTIFICATION_TYPES.TICKET_CLERK_RECEIPT_SUBMITTED,
        metadata: { ticketId: t.id, batchNo: t.batchNo },
      });
    }
  }

  async ticketClerkReceiptDecided(
    ticketId: string,
    decision: 'VERIFIED' | 'REJECTED',
  ): Promise<void> {
    const t = await this.loadTicket(ticketId);
    if (!t) return;
    const assigneeId = await this.activeAssigneeId(ticketId);
    if (!assigneeId) return;
    const copy = T.ticketClerkReceiptDecidedForAssignee(t.batchNo, decision);
    await this.notifications.create({
      userId: assigneeId,
      ...copy,
      type:
        decision === 'VERIFIED'
          ? NOTIFICATION_TYPES.TICKET_CLERK_RECEIPT_VERIFIED
          : NOTIFICATION_TYPES.TICKET_CLERK_RECEIPT_REJECTED,
      metadata: { ticketId: t.id, batchNo: t.batchNo },
    });
  }

  async ticketDocumentUploaded(ticketId: string): Promise<void> {
    const t = await this.loadTicket(ticketId);
    if (!t) return;
    const copy = T.ticketDocumentUploadedForConsumer(t.batchNo);
    await this.notifications.create({
      userId: t.consumerId,
      ...copy,
      type: NOTIFICATION_TYPES.TICKET_DOCUMENT_UPLOADED,
      metadata: { ticketId: t.id, batchNo: t.batchNo },
    });
  }

  async ticketRegenerated(ticketId: string): Promise<void> {
    const t = await this.loadTicket(ticketId);
    if (!t) return;
    const copy = T.ticketRegeneratedForConsumer(t.batchNo);
    await this.notifications.create({
      userId: t.consumerId,
      ...copy,
      type: NOTIFICATION_TYPES.TICKET_REGENERATED,
      metadata: { ticketId: t.id, batchNo: t.batchNo },
    });
  }
}
```

- [ ] **Step 4: Run ticket tests**

Run: `cd apps/api && pnpm test -- --testPathPattern=notification-dispatcher`
Expected: PASS (3 ticket tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/notifications/notification-dispatcher.service.ts apps/api/src/notifications/notification-dispatcher.service.spec.ts
git commit -m "feat(notifications): add NotificationDispatcher with ticket-event methods"
```

---

## Task 6: NotificationDispatcher — payment, wallet, case, auth events

**Files:**
- Modify: `apps/api/src/notifications/notification-dispatcher.service.ts`
- Modify: `apps/api/src/notifications/notification-dispatcher.service.spec.ts`

- [ ] **Step 1: Add failing tests**

Append inside `notification-dispatcher.service.spec.ts`:

```ts
describe('NotificationDispatcher — payments/wallet/case/auth', () => {
  it('paymentCompleted notifies consumer (email) + finance', async () => {
    const { dispatcher, prisma, notifications } = build();
    prisma.ticket.findUnique.mockResolvedValue({
      id: 't1',
      batchNo: 'TKT-1',
      consumerId: 'c1',
      consumer: { id: 'c1', email: 'c@x.com' },
      service: { name: 'Case Files' },
    });
    prisma.user.findMany.mockResolvedValue([{ id: 'f1' }]);

    await dispatcher.paymentCompleted('t1');

    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'c1', type: NOTIFICATION_TYPES.PAYMENT_COMPLETED }),
    );
    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'f1' }),
    );
    expect(notifications.sendEmail).toHaveBeenCalledWith('c@x.com', expect.any(String), expect.any(String));
  });

  it('walletTopupDecided VERIFIED notifies owner with email', async () => {
    const { dispatcher, prisma, notifications } = build();
    prisma.walletTransaction.findUnique.mockResolvedValue({
      id: 'w1', userId: 'c1', amount: 5000,
      user: { id: 'c1', email: 'c@x.com' },
    });

    await dispatcher.walletTopupDecided('w1', 'VERIFIED');

    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'c1', type: NOTIFICATION_TYPES.WALLET_TOPUP_VERIFIED }),
    );
    expect(notifications.sendEmail).toHaveBeenCalled();
  });

  it('caseDriftDetected notifies admins', async () => {
    const { dispatcher, prisma, notifications } = build();
    prisma.case.findUnique.mockResolvedValue({ id: 'k1', caseRef: 'CASE-1', consumerId: 'c1' });
    prisma.user.findMany.mockResolvedValue([{ id: 'a1' }]);

    await dispatcher.caseDriftDetected('k1');

    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'a1', type: NOTIFICATION_TYPES.CASE_DRIFT_DETECTED }),
    );
  });

  it('authPasswordChanged notifies the user', async () => {
    const { dispatcher, notifications } = build();
    await dispatcher.authPasswordChanged('u1');
    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', type: NOTIFICATION_TYPES.AUTH_PASSWORD_CHANGED }),
    );
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/api && pnpm test -- --testPathPattern=notification-dispatcher`
Expected: FAIL — new methods undefined.

- [ ] **Step 3: Implement the remaining methods**

Append these methods inside the `NotificationDispatcher` class:

```ts
  // ─── payment / wallet ───
  async paymentCompleted(ticketId: string): Promise<void> {
    const t = await this.loadTicket(ticketId);
    if (!t) return;
    const consumerCopy = T.paymentCompletedForConsumer(t.batchNo);
    await this.notifications.create({
      userId: t.consumerId,
      ...consumerCopy,
      type: NOTIFICATION_TYPES.PAYMENT_COMPLETED,
      metadata: { ticketId: t.id, batchNo: t.batchNo },
    });
    if (t.consumer.email) {
      await this.notifications.sendEmail(
        t.consumer.email,
        consumerCopy.title,
        `<p>${consumerCopy.body}</p>`,
      );
    }
    const financeCopy = T.paymentCompletedForFinance(t.batchNo);
    for (const id of await this.financeIds()) {
      await this.notifications.create({
        userId: id,
        ...financeCopy,
        type: NOTIFICATION_TYPES.PAYMENT_COMPLETED,
        metadata: { ticketId: t.id, batchNo: t.batchNo },
      });
    }
  }

  private async loadTxn(transactionId: string) {
    return this.prisma.walletTransaction.findUnique({
      where: { id: transactionId },
      include: { user: { select: { id: true, email: true } } },
    });
  }

  async walletTopupCreated(transactionId: string): Promise<void> {
    const tx = await this.loadTxn(transactionId);
    if (!tx) return;
    const amount = Number(tx.amount);
    await this.notifications.create({
      userId: tx.userId,
      ...T.walletTopupCreatedForConsumer(amount),
      type: NOTIFICATION_TYPES.WALLET_TOPUP_CREATED,
      metadata: { transactionId: tx.id },
    });
    const financeCopy = T.walletTopupCreatedForFinance(amount);
    for (const id of await this.financeIds()) {
      if (id === tx.userId) continue;
      await this.notifications.create({
        userId: id,
        ...financeCopy,
        type: NOTIFICATION_TYPES.WALLET_TOPUP_CREATED,
        metadata: { transactionId: tx.id },
      });
    }
  }

  async walletTopupDecided(
    transactionId: string,
    decision: 'VERIFIED' | 'REJECTED',
  ): Promise<void> {
    const tx = await this.loadTxn(transactionId);
    if (!tx) return;
    const copy = T.walletTopupDecidedForConsumer(Number(tx.amount), decision);
    await this.notifications.create({
      userId: tx.userId,
      ...copy,
      type:
        decision === 'VERIFIED'
          ? NOTIFICATION_TYPES.WALLET_TOPUP_VERIFIED
          : NOTIFICATION_TYPES.WALLET_TOPUP_REJECTED,
      metadata: { transactionId: tx.id },
    });
    if (tx.user.email) {
      await this.notifications.sendEmail(
        tx.user.email,
        copy.title,
        `<p>${copy.body}</p>`,
      );
    }
  }

  async walletReceiptUploaded(): Promise<void> {
    const copy = T.walletReceiptUploadedForFinance();
    for (const id of await this.financeIds()) {
      await this.notifications.create({
        userId: id,
        ...copy,
        type: NOTIFICATION_TYPES.WALLET_RECEIPT_UPLOADED,
      });
    }
  }

  // ─── case ───
  private async loadCase(caseId: string) {
    return this.prisma.case.findUnique({
      where: { id: caseId },
      select: { id: true, caseRef: true, consumerId: true },
    });
  }

  async caseCreated(caseId: string): Promise<void> {
    const k = await this.loadCase(caseId);
    if (!k) return;
    await this.notifications.create({
      userId: k.consumerId,
      ...T.caseCreatedForConsumer(k.caseRef),
      type: NOTIFICATION_TYPES.CASE_CREATED,
      metadata: { caseId: k.id, caseRef: k.caseRef },
    });
  }

  async caseStatusChanged(caseId: string, from: string, to: string): Promise<void> {
    const k = await this.loadCase(caseId);
    if (!k) return;
    await this.notifications.create({
      userId: k.consumerId,
      ...T.caseStatusForConsumer(k.caseRef, to),
      type: NOTIFICATION_TYPES.CASE_STATUS_CHANGED,
      metadata: { caseId: k.id, caseRef: k.caseRef, from, to },
    });
  }

  async caseDriftDetected(caseId: string): Promise<void> {
    const k = await this.loadCase(caseId);
    if (!k) return;
    const copy = T.caseDriftForAdmin(k.caseRef);
    for (const id of await this.adminIds()) {
      await this.notifications.create({
        userId: id,
        ...copy,
        type: NOTIFICATION_TYPES.CASE_DRIFT_DETECTED,
        metadata: { caseId: k.id, caseRef: k.caseRef },
      });
    }
  }

  // ─── auth ───
  async authPasswordChanged(userId: string): Promise<void> {
    await this.notifications.create({
      userId,
      ...T.authPasswordChanged(),
      type: NOTIFICATION_TYPES.AUTH_PASSWORD_CHANGED,
    });
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    if (u?.email) {
      const copy = T.authPasswordChanged();
      await this.notifications.sendEmail(u.email, copy.title, `<p>${copy.body}</p>`);
    }
  }

  async authImpersonationStarted(
    targetUserId: string,
    adminEmail: string,
  ): Promise<void> {
    const copy = T.authImpersonationStarted(adminEmail);
    await this.notifications.create({
      userId: targetUserId,
      ...copy,
      type: NOTIFICATION_TYPES.AUTH_IMPERSONATION_STARTED,
    });
    const u = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { email: true },
    });
    if (u?.email) {
      await this.notifications.sendEmail(u.email, copy.title, `<p>${copy.body}</p>`);
    }
  }
```

Note: the spec's `build()` mock adds `walletTransaction.findUnique`, `case.findUnique`, and `user.findUnique` — confirm those exist on the mock object. Add `user: { findMany: ..., findUnique: jest.fn() }` to the mock if a method is missing.

- [ ] **Step 4: Run all dispatcher tests**

Run: `cd apps/api && pnpm test -- --testPathPattern=notification-dispatcher`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/notifications/notification-dispatcher.service.ts apps/api/src/notifications/notification-dispatcher.service.spec.ts
git commit -m "feat(notifications): add payment/wallet/case/auth dispatcher methods"
```

---

## Task 7: Wire dispatcher into NotificationsModule

**Files:**
- Modify: `apps/api/src/notifications/notifications.module.ts`

- [ ] **Step 1: Update the module**

```ts
import { Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationDispatcher } from './notification-dispatcher.service';
import { SseService } from './sse.service';

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, EmailService, SseService, NotificationDispatcher],
  exports: [NotificationsService, NotificationDispatcher],
})
export class NotificationsModule {}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/api && pnpm exec tsc --noEmit -p tsconfig.json`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/notifications/notifications.module.ts
git commit -m "feat(notifications): export NotificationDispatcher from module"
```

---

## Task 8: Migrate TicketsService to the dispatcher

TicketsService currently injects `NotificationsService` (5th constructor arg) and makes two direct `create()`/`sendEmail()` calls. Replace that dependency with `NotificationDispatcher` and add call sites.

**Files:**
- Modify: `apps/api/src/tickets/tickets.service.ts`
- Modify: `apps/api/src/tickets/tickets.service.spec.ts`

- [ ] **Step 1: Update the spec mocks first (red)**

In `apps/api/src/tickets/tickets.service.spec.ts`, every `new TicketsService(...)` currently passes `notificationsService as never` as the 5th arg. Replace each `notificationsService` mock object with a dispatcher mock:

```ts
const dispatcher = {
  ticketCreated: jest.fn().mockResolvedValue(undefined),
  ticketStatusChanged: jest.fn().mockResolvedValue(undefined),
  ticketAssigned: jest.fn().mockResolvedValue(undefined),
  ticketReassigned: jest.fn().mockResolvedValue(undefined),
  ticketAssignmentAccepted: jest.fn().mockResolvedValue(undefined),
  ticketAssignmentRejected: jest.fn().mockResolvedValue(undefined),
  ticketClerkCostsSubmitted: jest.fn().mockResolvedValue(undefined),
  ticketClerkReceiptSubmitted: jest.fn().mockResolvedValue(undefined),
  ticketClerkReceiptDecided: jest.fn().mockResolvedValue(undefined),
  ticketDocumentUploaded: jest.fn().mockResolvedValue(undefined),
  ticketRegenerated: jest.fn().mockResolvedValue(undefined),
  caseDriftDetected: jest.fn().mockResolvedValue(undefined),
};
```

Pass `dispatcher as never` as the 5th constructor arg everywhere (replacing `notificationsService as never`). Update the `rejectAssignment` test (currently asserts `notificationsService.create` at line ~248) to assert:

```ts
expect(dispatcher.ticketAssignmentRejected).toHaveBeenCalledWith(
  'ticket-1',
  'Cannot reach court this week',
);
```

Remove the now-obsolete `findAssigningAdminId`-related prisma mocks for `auditLog.findFirst` in that test if present (the dispatcher owns that lookup now — the service no longer calls it). Update the `buildService` return to expose `dispatcher` instead of `notificationsService`.

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/api && pnpm test -- --testPathPattern=tickets.service`
Expected: FAIL — TicketsService still references `notificationsService`.

- [ ] **Step 3: Update TicketsService constructor + imports**

In `apps/api/src/tickets/tickets.service.ts`:
- Replace the import of `NotificationsService` with `NotificationDispatcher` from `../notifications/notification-dispatcher.service`.
- Change the constructor param (currently `private readonly notificationsService: NotificationsService`) to `private readonly dispatcher: NotificationDispatcher`.
- Delete the private `findAssigningAdminId` method (lines ~1510-1520) — the dispatcher owns this lookup now.

- [ ] **Step 4: Add/replace call sites**

Place each call **after** the corresponding `auditLogsService.create(...)` in the same method, wrapped so a notification failure never breaks the business operation:

`createIntakeTicket` (after the `TICKET_CREATED` audit, before `return ticket`):
```ts
await this.dispatcher.ticketCreated(ticket.id).catch(() => undefined);
```

`updateStatus` — **remove** the existing `if (status === 'COMPLETED') { notificationsService.create + sendEmail }` block (lines ~728-741). After the `TICKET_STATUS_UPDATED` audit, add:
```ts
await this.dispatcher
  .ticketStatusChanged(id, ticket.status, status)
  .catch(() => undefined);
```

`assign` — capture the prior assignee before the `$transaction`, then notify after the audit:
```ts
// before the $transaction:
const priorAssignment = await this.prisma.assignment.findFirst({
  where: { ticketId: id, status: 'ACTIVE' },
  orderBy: { createdAt: 'desc' },
  select: { representativeId: true },
});
// after the TICKET_ASSIGNED audit:
if (priorAssignment && priorAssignment.representativeId !== dto.representativeId) {
  await this.dispatcher
    .ticketReassigned(id, priorAssignment.representativeId, dto.representativeId)
    .catch(() => undefined);
} else {
  await this.dispatcher.ticketAssigned(id, dto.representativeId).catch(() => undefined);
}
```

`uploadDocument` (after `TICKET_DOCUMENT_UPLOADED` audit):
```ts
if (visibleToConsumer) {
  await this.dispatcher.ticketDocumentUploaded(ticketId).catch(() => undefined);
}
```

`regenerate` (after the regenerate audit, before `return cloned`):
```ts
await this.dispatcher.ticketRegenerated(cloned.id).catch(() => undefined);
```

`submitClerkReceipt` (after audit):
```ts
await this.dispatcher.ticketClerkReceiptSubmitted(ticketId).catch(() => undefined);
```

`verifyClerkReceipt` (after audit):
```ts
await this.dispatcher.ticketClerkReceiptDecided(ticketId, decision).catch(() => undefined);
```

`submitClerkCosts` (after audit):
```ts
await this.dispatcher.ticketClerkCostsSubmitted(ticketId).catch(() => undefined);
```

`acceptAssignment` (after audit):
```ts
await this.dispatcher.ticketAssignmentAccepted(ticketId).catch(() => undefined);
```

`rejectAssignment` — **remove** the existing `if (activeAssignment) { findAssigningAdminId + notificationsService.create }` block (lines ~1486-1496). After the `TICKET_ASSIGNMENT_REJECTED` audit:
```ts
await this.dispatcher.ticketAssignmentRejected(ticketId, trimmedReason).catch(() => undefined);
```

Drift in `applyTicketCompletionToCase` (after the `for (const d of drifts)` loop, line ~1798):
```ts
if (drifts.length > 0) {
  await this.dispatcher.caseDriftDetected(caseId).catch(() => undefined);
}
```

- [ ] **Step 5: Run tickets tests**

Run: `cd apps/api && pnpm test -- --testPathPattern=tickets.service`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/tickets/tickets.service.ts apps/api/src/tickets/tickets.service.spec.ts
git commit -m "feat(tickets): route all notifications through NotificationDispatcher"
```

---

## Task 9: Wire PaymentsService

**Files:**
- Modify: `apps/api/src/payments/payments.service.ts`
- Modify: `apps/api/src/payments/payments.module.ts`

- [ ] **Step 1: Add NotificationsModule to payments.module.ts**

```ts
import { NotificationsModule } from '../notifications/notifications.module';
// ...
imports: [ConfigModule, PrismaModule, AuditLogsModule, NotificationsModule],
```

- [ ] **Step 2: Inject + call the dispatcher**

In `payments.service.ts`, add the constructor injection `private readonly dispatcher: NotificationDispatcher` (import from `../notifications/notification-dispatcher.service`). After the `PAYMENT_COMPLETED` audit (line ~176, inside the `verified.status === 'SUCCESS'` branch, before `return { ok: true }`):

```ts
await this.dispatcher.paymentCompleted(payment.ticket.id).catch(() => undefined);
```

- [ ] **Step 3: Typecheck + run any payments tests**

Run: `cd apps/api && pnpm exec tsc --noEmit -p tsconfig.json && pnpm test -- --testPathPattern=payments`
Expected: PASS (or "no tests found" for payments — typecheck must pass).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/payments/payments.service.ts apps/api/src/payments/payments.module.ts
git commit -m "feat(payments): notify consumer + finance on payment completion"
```

---

## Task 10: Wire WalletService

**Files:**
- Modify: `apps/api/src/wallet/wallet.service.ts`
- Modify: `apps/api/src/wallet/wallet.module.ts`

- [ ] **Step 1: Add NotificationsModule to wallet.module.ts**

```ts
import { NotificationsModule } from '../notifications/notifications.module';
// ...
imports: [PrismaModule, AuditLogsModule, NotificationsModule],
```

- [ ] **Step 2: Inject + call the dispatcher**

In `wallet.service.ts` add `private readonly dispatcher: NotificationDispatcher` to the constructor. Add calls after each audit:

`topup` (after `WALLET_TOPUP_CREATED` audit):
```ts
await this.dispatcher.walletTopupCreated(transaction.id).catch(() => undefined);
```

`verifyTopup` (inside `if (!result.alreadyProcessed)`, after the audit):
```ts
await this.dispatcher.walletTopupDecided(result.transaction.id, 'VERIFIED').catch(() => undefined);
```

`rejectTopup` (after `WALLET_TOPUP_REJECTED` audit):
```ts
await this.dispatcher.walletTopupDecided(rejected.id, 'REJECTED').catch(() => undefined);
```

`recordReceiptUpload` (after `WALLET_RECEIPT_UPLOADED` audit):
```ts
await this.dispatcher.walletReceiptUploaded().catch(() => undefined);
```

- [ ] **Step 3: Typecheck + tests**

Run: `cd apps/api && pnpm exec tsc --noEmit -p tsconfig.json && pnpm test -- --testPathPattern=wallet`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/wallet/wallet.service.ts apps/api/src/wallet/wallet.module.ts
git commit -m "feat(wallet): notify owner + finance on top-up lifecycle and receipt upload"
```

---

## Task 11: Wire CasesService

CasesModule already imports NotificationsModule.

**Files:**
- Modify: `apps/api/src/cases/cases.service.ts`

- [ ] **Step 1: Inject + call the dispatcher**

Add `private readonly dispatcher: NotificationDispatcher` to the constructor (import from `../notifications/notification-dispatcher.service`).

`createCase` (after `CASE_CREATED` audit):
```ts
await this.dispatcher.caseCreated(newCase.id).catch(() => undefined);
```

`updateStatus` (after `CASE_STATUS_UPDATED` audit):
```ts
await this.dispatcher.caseStatusChanged(id, caseRec.status, dto.status).catch(() => undefined);
```

(Case drift is already wired from TicketsService in Task 8.)

- [ ] **Step 2: Typecheck + tests**

Run: `cd apps/api && pnpm exec tsc --noEmit -p tsconfig.json && pnpm test -- --testPathPattern=cases`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/cases/cases.service.ts
git commit -m "feat(cases): notify consumer on case creation and status change"
```

---

## Task 12: Wire AuthService (impersonation) + UsersService (password change)

**Files:**
- Modify: `apps/api/src/auth/auth.service.ts`, `apps/api/src/auth/auth.module.ts`
- Modify: `apps/api/src/users/users.service.ts`, `apps/api/src/users/users.module.ts`

- [ ] **Step 1: Add NotificationsModule to both modules**

`auth.module.ts` imports: add `NotificationsModule`.
`users.module.ts` imports: add `NotificationsModule` (currently only `AuditLogsModule`).

- [ ] **Step 2: AuthService impersonation**

Inject `private readonly dispatcher: NotificationDispatcher`. In `impersonate`, after the `AUTH_IMPERSONATE` audit (line ~200):
```ts
await this.dispatcher
  .authImpersonationStarted(targetUserId, actor.email)
  .catch(() => undefined);
```

- [ ] **Step 3: UsersService password change**

Inject `private readonly dispatcher: NotificationDispatcher`. In `update`, after the `USER_UPDATED` audit, fire only when a password was set:
```ts
if (dto.password) {
  await this.dispatcher.authPasswordChanged(id).catch(() => undefined);
}
```

- [ ] **Step 4: Typecheck + tests**

Run: `cd apps/api && pnpm exec tsc --noEmit -p tsconfig.json && pnpm test -- --testPathPattern="auth|users"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/auth/auth.service.ts apps/api/src/auth/auth.module.ts apps/api/src/users/users.service.ts apps/api/src/users/users.module.ts
git commit -m "feat(auth,users): notify on impersonation start and password change"
```

---

## Task 13: SSE auth — accept JWT from `?token=` query

`EventSource` cannot set an Authorization header, so the stream endpoint must accept the access token as a query param. Add a query extractor to the JWT strategy (the token is still fully signature-verified).

**Files:**
- Modify: `apps/api/src/auth/jwt.strategy.ts`

- [ ] **Step 1: Update the extractor**

```ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy, type JwtFromRequestFunction } from 'passport-jwt';
import type { Request } from 'express';
import type { JwtUser } from './types/jwt-user.type';

const fromQueryToken: JwtFromRequestFunction = (req: Request) => {
  const token = (req?.query?.token ?? null) as string | null;
  return typeof token === 'string' && token.length > 0 ? token : null;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        fromQueryToken,
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  validate(payload: JwtUser): JwtUser {
    return payload;
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/api && pnpm exec tsc --noEmit -p tsconfig.json`
Expected: PASS.

- [ ] **Step 3: Manual sanity check**

Run: `pnpm dev:api` in one terminal. With a valid access token, run:
`curl -N "http://localhost:4000/api/notifications/stream?token=<ACCESS_TOKEN>"`
Expected: connection stays open (SSE), HTTP 200, no 401. Header-based auth on other routes still works.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/auth/jwt.strategy.ts
git commit -m "feat(auth): allow JWT via ?token= query for SSE stream endpoint"
```

---

## Task 14: Frontend — subscribe topbar to SSE, drop polling

**Files:**
- Modify: `apps/web/components/ui/shell-topbar.tsx`

- [ ] **Step 1: Add the SSE effect**

Add `API_BASE_URL` near the top of the file (mirror api-client):
```ts
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000/api';
```

Add an effect after the existing mount effect. It does the initial unread/backfill fetch (kept) and opens an `EventSource`:

```ts
useEffect(() => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('wusuq_access_token') : null;
  if (!token) return;

  const es = new EventSource(`${API_BASE_URL}/notifications/stream?token=${encodeURIComponent(token)}`);

  es.onmessage = (evt) => {
    try {
      const n = JSON.parse(evt.data) as Notification;
      setNotifications((prev) => [{ ...n, isRead: false }, ...prev].slice(0, 15));
      setUnread((c) => c + 1);
    } catch {}
  };

  es.onerror = () => {
    // Browser auto-reconnects EventSource; nothing to do.
  };

  return () => es.close();
}, []);
```

- [ ] **Step 2: Confirm no polling timers remain**

There is currently no `setInterval` in this file (initial fetch is one-shot in the mount effect). Leave the one-shot `unread-count` fetch as backfill. Do not add any interval.

- [ ] **Step 3: Lint + typecheck**

Run: `pnpm lint && pnpm typecheck`
Expected: PASS. (Note React 19 `set-state-in-effect` rule: the `setNotifications`/`setUnread` calls here run inside the `onmessage` callback, not synchronously in the effect body, so they are allowed — see CLAUDE.md.)

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/ui/shell-topbar.tsx
git commit -m "feat(web): subscribe topbar to notifications SSE stream"
```

---

## Task 15: Frontend — deep-link notifications by type + role

**Files:**
- Modify: `apps/web/components/ui/shell-topbar.tsx`

- [ ] **Step 1: Add metadata to the Notification type**

```ts
type Notification = {
  id: string;
  title: string;
  body: string | null;
  type: string;
  isRead: boolean;
  createdAt: string;
  metadata?: { ticketId?: string; caseId?: string; transactionId?: string } | null;
};
```

(The API already returns `metadata`; the backfill `GET /notifications` includes it. The SSE push payload does not currently include metadata — that's fine; deep-linking degrades gracefully to no-link for SSE-delivered rows until refetch.)

- [ ] **Step 2: Compute the href**

Add a helper inside the component:
```ts
const hrefFor = (n: Notification): string | null => {
  const ticketId = n.metadata?.ticketId;
  if (ticketId) return variant === 'consumer' ? `/consumer/tickets/${ticketId}` : `/tickets/${ticketId}`;
  return null;
};
```

- [ ] **Step 3: Make rows navigate**

In the notifications list `<li>`, when `hrefFor(n)` is non-null, wrap the content in a `next/link` `Link` to that href, and still call `markOne(n.id)` on click. When null, keep the current plain `<li>` behavior. Keep the existing styling classes.

- [ ] **Step 4: Lint + typecheck**

Run: `pnpm lint && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/ui/shell-topbar.tsx
git commit -m "feat(web): deep-link ticket notifications by role"
```

---

## Task 16: Full verification

- [ ] **Step 1: Build shared, then full typecheck + lint + tests + build**

Run from repo root:
```bash
pnpm --filter @wusuq/shared build
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```
Expected: all PASS.

- [ ] **Step 2: Manual golden-path UAT**

Start `pnpm dev`. In the browser:
1. Log in as consumer (`testconsumer@wusuq.com` / `password123`), create a ticket. Confirm: consumer bell shows "Request submitted" instantly (SSE), one email logged in API console.
2. Log in as `superadmin@wusuq.com` / `password` (separate browser/profile). Confirm admin bell shows "New ticket". Assign the ticket to a representative.
3. As the representative, confirm "New assignment" bell + email. Accept it.
4. Back as admin, confirm "Assignment accepted".
5. Advance status to COMPLETED. Confirm consumer bell "Service completed" + email; verify total consumer emails for the lifecycle ≤ 3 (created, assigned-not-to-consumer, completed → so 2 for consumer).
6. Click a ticket notification in the consumer bell → lands on `/consumer/tickets/{id}`.

- [ ] **Step 3: Confirm email restraint**

Grep the API console output: status hops to ASSIGNED / IN_PROGRESS / WAITING_APPROVAL must NOT email the consumer (in-app only). Only created / completed / payment / wallet-decision / assignment events email.

- [ ] **Step 4: Final commit (if any manual fixes were needed)**

```bash
git add -A
git commit -m "test: verify in-app notification flows end-to-end"
```

---

## Self-Review Notes

- **Spec coverage:** Every catalog row maps to a dispatcher method + a wired call site (Tasks 5/6 define methods; Tasks 8–12 wire them). New-device login was dropped in the spec (no device fingerprinting) — correctly absent here.
- **Email policy:** `create()` no longer emails (Task 2); only ✉ rows call `sendEmail` in the dispatcher — matches the spec's high-signal list.
- **SSE:** Task 13 (backend query token) + Task 14 (frontend subscribe) replace polling.
- **Type consistency:** dispatcher method names are identical across the spec mocks (Task 8 Step 1), the implementation (Tasks 5/6), and the call sites (Tasks 8–12). Audience role arrays use Prisma underscore enum values throughout.
- **Known limitation (documented):** SSE-pushed payloads omit `metadata`, so deep-linking only applies to backfilled/refetched rows until the next fetch. Acceptable for v1; widening the SSE payload is a trivial follow-up if needed.
