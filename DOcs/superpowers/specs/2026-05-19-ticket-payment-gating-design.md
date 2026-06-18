# Ticket Payment Gating (Mock Pakistani Gateway)

> **⚠️ PARTIALLY SUPERSEDED (2026-06-12).** The 2026-05-23 unified-ticket-status
> design replaced this spec's gating model: there is no `paymentStatus` column
> and no admin-origin exemption — payment state derives from amounts and the
> `UNPAID → PAID` transition IS the gate, for every ticket origin. The mock
> gateway/webhook sections remain the reference for the payments module
> (hardened 2026-06: remaining-due initiate, locked increment webhook,
> production guard on the mock provider).

**Status:** Draft (superseded in part — see banner)
**Date:** 2026-05-19
**Owner:** Consumer-experience track

## Problem

Today every ticket (consumer- or admin-created) lands at `status=PENDING` and immediately becomes eligible for clerk assignment and lifecycle progression. Payment is decoupled — it's tracked via `Ticket.paymentStatus` and the manual `WalletTransaction` flow, but never gates lifecycle. Consumers can submit work that ops fulfils before they've paid.

We need a payment gate that:

1. Prompts the consumer to pay (or defer) immediately after intake submission.
2. Blocks consumer-origin tickets from leaving `PENDING` until `paymentStatus=PAID`.
3. Leaves admin-origin tickets ungated — they stay `UNPAID` but can be assigned/progressed normally (cash collected out-of-band).
4. Talks to a payment provider through a swappable adapter. v1 ships with a **mock** provider; real Pakistani gateways (JazzCash PG, EasyPaisa Merchant API, HBL Pay, …) plug in later behind the same interface.

## Non-goals (v1)

- Partial gateway payments — gateway charges the full `totalAmount` only.
- Refunds via gateway — handled manually by admin.
- Auto-expiry of "Pay Later" tickets — they sit `UNPAID` indefinitely until the consumer returns or admin records a manual receipt.
- Replacing `WalletTransaction` — that remains the path for manual receipt verification (admin recording a JazzCash/EasyPaisa screenshot). The new `Payment` model is for gateway-initiated, auto-verified transactions only.

## Architecture

### Provider abstraction

```
apps/api/src/payments/
  payments.module.ts
  payments.controller.ts        # initiate / return / webhook
  payments.service.ts           # state transitions, idempotency
  providers/
    payment-provider.interface.ts
    mock-provider.ts            # v1
    # jazzcash-provider.ts      # v2 (not in this spec)
  dto/
    initiate-payment.dto.ts
```

`PaymentProvider` interface:

```ts
interface PaymentProvider {
  readonly name: string; // 'MOCK' | 'JAZZCASH' | ...
  initiate(input: {
    ticketId: string;
    amount: Decimal;
    currency: 'PKR';
    consumerId: string;
    returnUrl: string;
    notifyUrl: string;
  }): Promise<{
    providerTxnId: string;
    redirectUrl: string;   // browser-redirect URL (mock: an in-app page; real: gateway hosted checkout)
    rawRequest: unknown;   // logged on the Payment row
  }>;
  verifyCallback(rawBody: unknown, headers: Record<string, string>): {
    providerTxnId: string;
    status: 'SUCCESS' | 'FAILED' | 'CANCELLED';
    amount: number;        // verified amount in PKR
    signatureValid: boolean;
  };
}
```

The active provider is selected by env `PAYMENT_PROVIDER=mock` (default). `MockProvider` returns a deterministic `providerTxnId` and a `redirectUrl` pointing to a local mock checkout page (`/consumer/payments/mock/[paymentId]`) that lets the developer pick SUCCESS / FAILED / CANCELLED, then POSTs to the same webhook a real gateway would call. This keeps the end-to-end flow exercised in dev without external dependencies.

### Schema changes

```prisma
enum TicketOrigin {
  CONSUMER
  ADMIN_STAFF
}

enum PaymentProviderName {
  MOCK
  JAZZCASH
  EASYPAISA
  HBL_PAY
}

enum PaymentStatus {
  INITIATED
  SUCCESS
  FAILED
  CANCELLED
}

model Payment {
  id              String              @id @default(cuid())
  ticketId        String
  provider        PaymentProviderName
  providerTxnId   String              @unique
  status          PaymentStatus       @default(INITIATED)
  amount          Decimal
  currency        String              @default("PKR")
  rawRequest      Json?
  rawCallback     Json?
  failureReason   String?
  createdAt       DateTime            @default(now())
  completedAt     DateTime?
  ticket          Ticket              @relation(fields: [ticketId], references: [id])

  @@index([ticketId])
  @@index([status])
}

// Ticket gains:
//   createdBy        TicketOrigin   @default(ADMIN_STAFF)   // backfill-safe default
//   payments         Payment[]
```

**Backfill.** Migration sets `createdBy=CONSUMER` where `Ticket.consumerId` appears as the actor on the original `TICKET_CREATED` audit log; everything else stays `ADMIN_STAFF`. Safer than the inverse — we never retroactively gate an in-flight ticket.

### Ticket lifecycle gate

A new helper in `TicketsService`:

```ts
private assertPaymentSatisfied(ticket: Ticket, nextStatus: TicketStatus) {
  if (ticket.createdBy !== 'CONSUMER') return;
  if (nextStatus === 'PENDING') return;
  if (ticket.paymentStatus === 'PAID') return;
  throw new ForbiddenException(
    'Ticket cannot be progressed until consumer payment is completed.',
  );
}
```

Called from `updateStatus` and from `assignTicket` (which internally transitions `PENDING → ASSIGNED`). Admin tickets short-circuit; consumer tickets need `paymentStatus=PAID`.

### Endpoints

| Method | Path                                  | Purpose                                                                     | Auth          |
| ------ | ------------------------------------- | --------------------------------------------------------------------------- | ------------- |
| POST   | `/api/payments/initiate`              | Create a `Payment` row, call provider, return `{ paymentId, redirectUrl }`. | Consumer (JWT, owns ticket) |
| POST   | `/api/payments/webhook/:provider`     | Provider IPN/callback. Verifies signature, updates Payment + Ticket atomically. | Public (signature-verified) |
| GET    | `/api/payments/:paymentId`            | Polled by the return page to confirm final status.                          | Consumer (owns payment) |
| POST   | `/api/payments/mock/:paymentId/resolve` | Mock-only dev helper that the mock checkout page calls; rejected unless `PAYMENT_PROVIDER=mock`. | Public |

**Idempotency.** Webhook handler is keyed on `providerTxnId`. Re-deliveries no-op once `Payment.status` is terminal. Signature verification + amount match + ticket-id match are all required before any DB write.

**Transaction boundary.** On verified SUCCESS, a single `prisma.$transaction` updates:
- `Payment` → `status=SUCCESS, completedAt=now, rawCallback=…`
- `Ticket` → `paymentStatus=PAID, amountPaid=totalAmount`
- `Invoice` → upsert; `status=PAID, paidAt=now`
- `AuditLog` → `PAYMENT_COMPLETED`

### Frontend changes

**Intake submission.** `intake-wizard.tsx`'s `submitTicket` success handler changes its redirect target from the dashboard to `/consumer/tickets/{id}/pay`.

**New page** `apps/web/app/(consumer)/tickets/[id]/pay/page.tsx`:
- Pulls ticket summary (charges breakdown, total).
- Two CTAs: **Pay Now** (POST `/payments/initiate`, then `router.push(redirectUrl)`) and **Pay Later** (router push to `/consumer/dashboard?tab=unpaid`, toast confirms ticket is unpaid).
- Styled as a focused full-page step (not a literal modal) so it survives reloads and is shareable.

**Mock checkout page** `apps/web/app/(consumer)/payments/mock/[paymentId]/page.tsx`:
- Dev-only UI with three buttons (Success / Fail / Cancel) that POSTs to `/payments/mock/:id/resolve`, then redirects to the return URL.
- Hidden behind `NEXT_PUBLIC_PAYMENT_PROVIDER=mock`.

**Return page** `apps/web/app/(consumer)/payments/return/page.tsx`:
- Polls `GET /payments/:id` for up to 30 s.
- On terminal status: success → ticket page with confirmation; failed/cancelled → back to pay page with retry.

**Dashboard surfaces.**
- Consumer dashboard: new **Unpaid** tab/filter; each card shows a "Pay Now" CTA.
- Admin/staff ticket views: `paymentStatus` chip is visible, but no gating UI — they can assign freely.

### Environment variables

| Variable                           | Default       | Notes                                                  |
| ---------------------------------- | ------------- | ------------------------------------------------------ |
| `PAYMENT_PROVIDER`                 | `mock`        | `mock` in dev/staging until a real provider is wired   |
| `PAYMENT_RETURN_URL`               | `http://localhost:3000/consumer/payments/return` | Browser return after gateway |
| `PAYMENT_NOTIFY_URL`               | `http://localhost:4000/api/payments/webhook/mock` | Server-to-server webhook (set per provider) |
| `NEXT_PUBLIC_PAYMENT_PROVIDER`     | `mock`        | Frontend uses this only to know whether to show the mock-resolve UI |

## Testing

**Unit (Jest, API)**
- `mock-provider.spec.ts` — initiate returns expected shape; verifyCallback enforces signature/amount.
- `payments.service.spec.ts` — webhook idempotency; partial/wrong-amount callbacks are rejected; transaction rollback on Invoice failure.
- `tickets.service.spec.ts` — gate test matrix: `(origin × paymentStatus × nextStatus) → allow/deny`.

**E2E (Playwright)**
- Consumer flow: submit intake → land on pay page → Pay Later → ticket appears in Unpaid → admin assignment attempt fails with 403.
- Consumer flow: submit intake → Pay Now → mock checkout SUCCESS → ticket `paymentStatus=PAID` → admin can assign.
- Admin flow: admin creates ticket → no pay redirect → ticket assignable while still `UNPAID`.

**Smoke (UAT)** — add a `uat:payments` script that runs the gate matrix against a live API.

## Migration & rollout

1. Ship schema migration (Payment table, TicketOrigin enum, backfill).
2. Ship API module behind a feature flag `PAYMENT_GATE_ENABLED` (default off in prod, on in staging) — gate helper short-circuits when flag is off.
3. Ship frontend pay page.
4. Enable flag in staging, run E2E matrix.
5. Enable in prod; flip mock → real provider when the gateway integration ships (separate spec).

## Risks / open items

- **Real-provider signature schemes vary.** JazzCash uses HMAC-SHA256 over a sorted-param string; EasyPaisa uses a different scheme. The interface is provider-agnostic; the v2 spec will document the chosen provider's verification path.
- **Pricing changes between create and pay.** Out of scope — `Ticket.totalAmount` at create-time is the canonical charge. If pricing rules change after creation, the ticket still charges the original amount.
- **Consumer abandons mid-checkout.** `Payment.status=INITIATED` rows are left in place; a daily cron (future) can mark stale INITIATED rows as CANCELLED after 24 h. Not in v1.
- **Admin manually marking a consumer ticket PAID.** Out of scope here — existing `WalletTransaction` verify flow already does this and bumps `paymentStatus`; the gate naturally unblocks.
