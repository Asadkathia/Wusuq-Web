# In-App Notifications — Design Spec

**Date:** 2026-05-20
**Status:** Approved, awaiting implementation plan

## 1. Problem

The platform has the *plumbing* for in-app notifications (`Notification` model, `NotificationsService.create()`, SSE endpoint `/notifications/stream`, topbar bell UI) but only fires two events: ticket `COMPLETED` and clerk assignment rejection. Consumers, assigned staff, admins, and accountants are blind to every other state change in the system.

This spec extends event coverage to **every state transition worth knowing about**, with sane audience routing and an email policy that scales without spamming users.

## 2. Goals

- Cover ticket lifecycle, payment/wallet, case, and account-security events with in-app notifications.
- Route each event to the right audience(s): consumers, assignees, admins, accountants.
- Email only for **high-signal** events (✉ rows below) — not every notification.
- Real-time delivery via the existing (currently unused) SSE stream; drop topbar polling.
- Single source of truth for notification type codes, audience routing, and copy templates.

## 3. Non-Goals (deferred)

- User-controlled notification preferences (per-type mute / opt-out).
- Daily / weekly digest emails.
- Web push or mobile push.
- SMS (already deferred per `CLAUDE.md`).
- Notification archival / retention policy.

## 4. Event Catalog

✉ = also email. All rows imply in-app.

### Tickets
| Event | Consumer | Assignee | Admin | Accountant |
|---|---|---|---|---|
| Ticket created | ✉ | — | • | — |
| Status changed (any) | • | • | — | — |
| Status → COMPLETED | ✉ | — | — | — |
| Assigned to clerk/paralegal | — | ✉ | — | — |
| Assignment accepted | — | — | • | — |
| Assignment rejected | — | — | ✉ | — |
| Reassigned | — | ✉ new + • old | • | — |
| Clerk costs submitted | — | — | • | • |
| Clerk receipt submitted | — | — | • | • |
| Clerk receipt verified | — | • | — | — |
| Clerk receipt rejected | — | • | — | — |
| Document uploaded (visibleToConsumer) | • | — | — | — |
| Ticket regenerated | • | • | — | — |

### Payments / Wallet
| Event | Consumer | Admin | Accountant |
|---|---|---|---|
| Payment completed | ✉ | — | • |
| Wallet top-up created (awaiting verify) | • | — | • |
| Wallet top-up verified | ✉ | — | — |
| Wallet top-up rejected | ✉ | — | — |
| Wallet receipt uploaded | — | — | • |

### Cases
| Event | Consumer | Admin |
|---|---|---|
| Case auto-created from ticket | • | — |
| Case status changed | • | — |
| Context drift detected | — | • |

### Auth / Account (security, ✉ all)
- Password changed (notify the user whose password changed).
- Impersonation started (notify the impersonated user).
- *New-device login is deferred* — the platform does not currently fingerprint devices. Out of scope for this spec; revisit when device tracking is added.

## 5. Architecture

### 5.1 Type codes (shared)

Add to `packages/shared/src/index.ts`:

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

The DB column `Notification.type` stays `String` — no migration needed. Call sites must use the const.

### 5.2 Email-policy refactor (root-cause fix)

Today `NotificationsService.create()` unconditionally emails the recipient. That is the structural reason we cannot scale event coverage — every new event would email every user.

**Change:** `create()` no longer emails. Email becomes an explicit `notificationsService.sendEmail(...)` call made by the dispatcher only for ✉ rows.

This removes one source of truth (implicit per-call email) and replaces it with one explicit, auditable decision per dispatcher method.

### 5.3 Typed dispatcher

New file `apps/api/src/notifications/notification-dispatcher.service.ts`:

```ts
@Injectable()
export class NotificationDispatcher {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  async ticketCreated(ticket: TicketWithRelations): Promise<void> { … }
  async ticketStatusChanged(ticket, from, to, actor): Promise<void> { … }
  async ticketAssigned(ticket, assigneeId): Promise<void> { … }
  async ticketReassigned(ticket, prevAssigneeId, newAssigneeId): Promise<void> { … }
  async ticketAssignmentAccepted(ticket): Promise<void> { … }
  async ticketAssignmentRejected(ticket, reason): Promise<void> { … }
  async ticketClerkCostsSubmitted(ticket): Promise<void> { … }
  async ticketClerkReceiptSubmitted(ticket): Promise<void> { … }
  async ticketClerkReceiptDecided(ticket, decision: 'VERIFIED' | 'REJECTED'): Promise<void> { … }
  async ticketDocumentUploaded(ticket, doc): Promise<void> { … }
  async ticketRegenerated(ticket): Promise<void> { … }
  async paymentCompleted(payment): Promise<void> { … }
  async walletTopupCreated(tx): Promise<void> { … }
  async walletTopupDecided(tx, decision: 'VERIFIED' | 'REJECTED'): Promise<void> { … }
  async walletReceiptUploaded(tx): Promise<void> { … }
  async caseCreated(caseRecord, consumerId): Promise<void> { … }
  async caseStatusChanged(caseRecord, from, to): Promise<void> { … }
  async caseDriftDetected(caseId, eventId): Promise<void> { … }
  async authPasswordChanged(userId): Promise<void> { … }
  async authImpersonationStarted(targetUserId, adminEmail): Promise<void> { … }

  // ─── audience helpers ───
  private async admins(): Promise<string[]> { … }
  private async accountants(): Promise<string[]> { … }
}
```

Each method:
1. Resolves audience userIds.
2. Picks title + body from `notification-templates.ts`.
3. Calls `notifications.create({ userId, title, body, type, metadata })` per recipient.
4. For ✉ events, calls `notifications.sendEmail(...)` to the same recipients.

### 5.4 Copy templates

New file `apps/api/src/notifications/notification-templates.ts`:

```ts
export const templates = {
  ticketCreated: (t) => ({
    title: `Request submitted — ${t.batchNo}`,
    body: `Your ${t.service.name} request is in the queue. We'll update you as it progresses.`,
  }),
  ticketStatusChangedForAssignee: (t, from, to) => ({ … }),
  // …one entry per event × audience-variant
};
```

Keeping copy in a single file is the structural fix that lets product / legal update wording without spelunking through services.

### 5.5 Module + call-site rewiring

`NotificationsModule` exports `NotificationDispatcher` alongside `NotificationsService`. Consumers:

- `TicketsService` — replace existing `notifications.create()` calls with `dispatcher.ticket*()`; add new calls at every status / assignment / receipt / document mutation point. Existing audit-log lines stay; they are independent.
- `PaymentsService` — call `dispatcher.paymentCompleted()` from the existing `PAYMENT_COMPLETED` block.
- `WalletService` — add 4 dispatcher calls at the 4 wallet audit points.
- `CasesService` — add 3 dispatcher calls at the 3 case audit points.
- `AuthService` — add 3 dispatcher calls for new-device / password-change / impersonation.

### 5.6 SSE — frontend wiring

`apps/web/components/ui/shell-topbar.tsx`:

- On mount, open `new EventSource(`${API_BASE}/notifications/stream?token=${accessToken}`)` (EventSource can't set Authorization headers).
- On `onmessage`, prepend payload to local list, `setUnread(n => n + 1)`, optionally surface a toast.
- Keep the initial `GET /notifications?limit=15` for backfill.
- Drop polling timers (the existing `setInterval` for unread count).
- On unmount / token refresh, close and reopen the connection.

Backend tweak — `apps/api/src/notifications/notifications.controller.ts`:

- The `GET /notifications/stream` route currently relies on the global `JwtAuthGuard` (reads from `Authorization` header). Extend the JWT strategy or the controller to also accept `?token=` for this endpoint only. Mark the endpoint with a strategy variant or a per-route guard — do **not** weaken the global guard.

### 5.7 Notification list UX

The existing topbar dropdown and profile-board "notifications" tab gain:

- An icon per `type` (ticket / payment / case / system).
- Click → deep-link based on `metadata.ticketId` (or `caseId` / `transactionId`) and the viewer's role:
  - Consumer with `metadata.ticketId` → `/consumer/tickets/{id}`
  - Staff with `metadata.ticketId` → `/tickets/{id}`
- Unread badge styling stays as-is.

## 6. Testing

- **Unit:** one spec per dispatcher method, mocking `PrismaService`, `NotificationsService`, `SseService`. Assert correct recipients, type code, metadata shape, and whether `sendEmail` was called.
- **Integration:** extend `tickets.service.spec.ts` (which already mocks `notificationsService`) to assert dispatcher calls at every transition.
- **E2E:** add one Playwright pass that walks the golden path (consumer creates → admin assigns → clerk accepts → COMPLETED) and verifies the bell count for each role at each step.
- **Manual UAT:** confirm SSE delivers within ~1s on a laptop; confirm email volume per ticket lifecycle ≤ 3 (created, assigned, completed) for the consumer.

## 7. Migration / Rollout

- No DB migration needed (`Notification.type` is already `String`).
- Ship in one PR — the email-policy change is the only behaviorally observable bit, and it can't be safely split (mixing old "create() emails" with new "dispatcher emails" would double-send).
- Smoke after deploy: log in as consumer, create a ticket, confirm one in-app + one email; log in as admin, confirm one in-app, zero emails.

## 8. Open questions

None. Catalog, audiences, email policy, and dispatcher shape are approved.
