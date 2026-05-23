# Payment & Wallet Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace gateway-only payments with a wallet-centric manual flow (bank details → screenshot → admin approval → wallet credit → auto-deduction), add per-flow one-time vs two-phase (split) billing, phase-aware gating, and an admin-edited clerk phase-2 charge step.

**Architecture:** Reuse the existing wallet as the single balance ledger. `WalletTransaction` already does screenshot + approve/reject + ticket-tagging; `WalletService.clearPendingTickets` already auto-deducts toward `totalAmount`. We make billing **staged** by controlling `Ticket.totalAmount` (base at creation; base+remainder after an admin finalizes clerk-entered phase-2 charges). Config lives in `@wusuq/shared`.

**Tech Stack:** NestJS 11 + Prisma/Postgres (api), Next.js 16 (web), `@wusuq/shared`, Jest (api tests).

**Spec:** `DOcs/superpowers/specs/2026-05-23-payment-wallet-redesign-design.md`

**Execution order & parallelism:**
- **Phase 0 (schema + shared) must land first** — everything depends on it.
- **Phase 1 (backend)** and **Phase 2 (frontend)** can then run as two tracks, but Phase 2 UI calls Phase 1 endpoints, so do Phase 1 first (or stub). Within a phase, tasks are sequential where they share files.
- **Phase 3** verification runs last.

**Key existing references (mirror these patterns):**
- Wallet top-up + approve/reject: `apps/api/src/wallet/wallet.service.ts` (`topup`, `verifyTopup`, `rejectTopup`, `clearPendingTickets`, `applyPaymentToTicket`) and `wallet.controller.ts`.
- Consumer wallet UI: `apps/web/components/consumer-wallet-board.tsx`; admin finance/wallet review UI: `apps/web/components/finance-board.tsx`.
- Clerk-receipt approve/reject (admin queue pattern): `tickets.service.ts` `submitClerkReceipt`/`verifyClerkReceipt`.
- Notifications: `apps/api/src/notifications/notification-dispatcher.service.ts`, `notification-templates.ts`, `NOTIFICATION_TYPES` in `packages/shared/src/index.ts`.

---

## PHASE 0 — Schema + shared config (must run first)

### Task 0.1: Shared payment config (`PAYMENT_MODEL_BY_FLOW`, `SERVICE_CHARGE_CAPABILITIES`)

**Files:**
- Modify: `packages/shared/src/index.ts`
- Test: `apps/api/src/tickets/tickets.service.spec.ts` (shared has no test runner; assert via api jest)

- [ ] **Step 1: Add the config + helpers to shared**

Append to `packages/shared/src/index.ts`:

```ts
// ── Payment model per intake flow (Spec 2, 2026-05-23) ──────────────
export type PaymentModel = 'SPLIT' | 'ONE_TIME';

export const PAYMENT_MODEL_BY_FLOW: Record<string, PaymentModel> = {
  judicial_case_files: 'SPLIT',
  non_judicial_copy_of_fir: 'SPLIT',
  non_judicial_criminal_record_search: 'SPLIT',
  non_judicial_registry_deed: 'SPLIT',
  judicial_case_information: 'ONE_TIME',
  judicial_case_search: 'ONE_TIME',
  judicial_case_filing: 'ONE_TIME',
  judicial_power_of_attorney: 'ONE_TIME',
};

export function paymentModelFor(flow?: string | null): PaymentModel {
  if (!flow) return 'ONE_TIME';
  return PAYMENT_MODEL_BY_FLOW[flow] ?? 'ONE_TIME';
}

// Which phase-2 charges each flow exposes in the clerk charge window (§4a).
export interface ServiceChargeCapabilities {
  attestation: boolean; // attested / non-attested
  printing: boolean;    // printing / copying
  delivery: boolean;
  pdf: boolean;
}

export const SERVICE_CHARGE_CAPABILITIES: Record<string, ServiceChargeCapabilities> = {
  judicial_case_files: { attestation: true, printing: true, delivery: true, pdf: true },
  non_judicial_copy_of_fir: { attestation: false, printing: true, delivery: true, pdf: true },
  non_judicial_registry_deed: { attestation: false, printing: true, delivery: true, pdf: true },
  non_judicial_criminal_record_search: { attestation: false, printing: true, delivery: true, pdf: true },
};

const NO_CHARGES: ServiceChargeCapabilities = { attestation: false, printing: false, delivery: false, pdf: false };

export function chargeCapabilitiesFor(flow?: string | null): ServiceChargeCapabilities {
  if (!flow) return NO_CHARGES;
  return SERVICE_CHARGE_CAPABILITIES[flow] ?? NO_CHARGES;
}
```

- [ ] **Step 2: Write the failing test**

Add to `apps/api/src/tickets/tickets.service.spec.ts`:

```ts
import { paymentModelFor, chargeCapabilitiesFor } from '@wusuq/shared';

describe('payment model + charge capabilities (Spec 2)', () => {
  it('classifies SPLIT vs ONE_TIME flows', () => {
    expect(paymentModelFor('judicial_case_files')).toBe('SPLIT');
    expect(paymentModelFor('non_judicial_registry_deed')).toBe('SPLIT');
    expect(paymentModelFor('judicial_case_information')).toBe('ONE_TIME');
    expect(paymentModelFor(undefined)).toBe('ONE_TIME');
  });
  it('exposes attestation only for case files', () => {
    expect(chargeCapabilitiesFor('judicial_case_files').attestation).toBe(true);
    expect(chargeCapabilitiesFor('non_judicial_copy_of_fir').attestation).toBe(false);
    expect(chargeCapabilitiesFor('judicial_case_information')).toEqual({
      attestation: false, printing: false, delivery: false, pdf: false,
    });
  });
});
```

- [ ] **Step 3: Build shared, run tests**

Run: `pnpm --filter @wusuq/shared build && cd apps/api && pnpm test src/tickets/tickets.service.spec.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/index.ts apps/api/src/tickets/tickets.service.spec.ts
git commit -m "feat(shared): per-flow payment model + service charge capabilities"
```

---

### Task 0.2: Prisma schema — PaymentSettings, WalletTransactionType, ticket finalization fields

**Files:**
- Modify: `apps/api/prisma/schema.prisma`

- [ ] **Step 1: Add the `WalletTransactionType` enum** after the existing `WalletTransactionStatus` enum (schema.prisma ~line 66-78):

```prisma
enum WalletTransactionType {
  TOPUP
  TICKET_PAYMENT
  TICKET_DEBIT
  ADMIN_ADJUSTMENT
}
```

- [ ] **Step 2: Add `type` to `WalletTransaction`** (model at schema.prisma:367). Add after the `status` line:

```prisma
  type        WalletTransactionType @default(TOPUP)
```

- [ ] **Step 3: Add finalization fields to `Ticket`** (model at schema.prisma:182). Add after `clerkReceiptUrl` (line 201):

```prisma
  remainderFinalizedAt       DateTime?
  remainderFinalizedByUserId String?
```

- [ ] **Step 4: Add the `PaymentSettings` singleton model** at the end of the schema:

```prisma
model PaymentSettings {
  id              String   @id @default("singleton")
  bankName        String
  accountTitle    String
  accountNumber   String
  iban            String?
  instructions    String?
  updatedAt       DateTime @updatedAt
  updatedByUserId String?
}
```

- [ ] **Step 5: Create the migration**

Run: `cd apps/api && pnpm prisma:migrate:dev --name payment_wallet_redesign`
Expected: migration created + applied; `pnpm prisma:generate` runs. (Requires DB access — if the sandbox blocks the Neon host, the human runs this step.)

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(db): PaymentSettings, WalletTransactionType, ticket remainder finalization fields"
```

---

## PHASE 1 — Backend

### Task 1.1: `payment-settings` module (bank details)

**Files:**
- Create: `apps/api/src/payment-settings/payment-settings.module.ts`, `.service.ts`, `.controller.ts`, `dto/update-payment-settings.dto.ts`
- Modify: `apps/api/src/app.module.ts` (register module)
- Test: `apps/api/src/payment-settings/payment-settings.service.spec.ts`

- [ ] **Step 1: Write the failing service test**

```ts
import { PaymentSettingsService } from './payment-settings.service';

describe('PaymentSettingsService', () => {
  it('upserts the singleton row and returns it', async () => {
    const prisma = {
      paymentSettings: {
        upsert: jest.fn().mockResolvedValue({ id: 'singleton', bankName: 'HBL' }),
        findUnique: jest.fn().mockResolvedValue({ id: 'singleton', bankName: 'HBL' }),
      },
    };
    const svc = new PaymentSettingsService(prisma as never);
    const saved = await svc.update({ bankName: 'HBL', accountTitle: 'Wusuq', accountNumber: '123' }, 'admin-1');
    expect(saved.bankName).toBe('HBL');
    expect(prisma.paymentSettings.upsert).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it (fails — module missing)**

Run: `cd apps/api && pnpm test src/payment-settings/payment-settings.service.spec.ts`
Expected: FAIL (cannot find module).

- [ ] **Step 3: Implement the DTO**

`dto/update-payment-settings.dto.ts`:

```ts
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdatePaymentSettingsDto {
  @IsString() @MaxLength(120) bankName!: string;
  @IsString() @MaxLength(120) accountTitle!: string;
  @IsString() @MaxLength(60) accountNumber!: string;
  @IsOptional() @IsString() @MaxLength(60) iban?: string;
  @IsOptional() @IsString() @MaxLength(2000) instructions?: string;
}
```

- [ ] **Step 4: Implement the service**

`payment-settings.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdatePaymentSettingsDto } from './dto/update-payment-settings.dto';

@Injectable()
export class PaymentSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get() {
    return this.prisma.paymentSettings.findUnique({ where: { id: 'singleton' } });
  }

  async update(dto: UpdatePaymentSettingsDto, actorUserId?: string) {
    return this.prisma.paymentSettings.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton', ...dto, updatedByUserId: actorUserId },
      update: { ...dto, updatedByUserId: actorUserId },
    });
  }
}
```

- [ ] **Step 5: Implement the controller** (consumer can GET; only admin/finance can PUT). Mirror permission usage from an existing controller (e.g. `wallet.controller.ts`) for the `@Permissions(...)` guard:

`payment-settings.controller.ts`:

```ts
import { Body, Controller, Get, Put, Req } from '@nestjs/common';
import { PaymentSettingsService } from './payment-settings.service';
import { UpdatePaymentSettingsDto } from './dto/update-payment-settings.dto';

@Controller('payment-settings')
export class PaymentSettingsController {
  constructor(private readonly service: PaymentSettingsService) {}

  @Get()
  get() {
    return this.service.get();
  }

  @Put()
  update(@Body() dto: UpdatePaymentSettingsDto, @Req() req: { user?: { userId?: string } }) {
    return this.service.update(dto, req.user?.userId);
  }
}
```

> Add the same `@Permissions(...)`/role guard the codebase uses for finance-admin write routes (copy the decorator import + usage from `finance.controller.ts`). The GET stays readable by authenticated consumers.

- [ ] **Step 6: Module + register**

`payment-settings.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { PaymentSettingsService } from './payment-settings.service';
import { PaymentSettingsController } from './payment-settings.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [PaymentSettingsController],
  providers: [PaymentSettingsService],
  exports: [PaymentSettingsService],
})
export class PaymentSettingsModule {}
```

Add `PaymentSettingsModule` to `imports` in `apps/api/src/app.module.ts`.

- [ ] **Step 7: Run tests + typecheck**

Run: `cd apps/api && pnpm test src/payment-settings/payment-settings.service.spec.ts && pnpm typecheck`
Expected: PASS (ignore pre-existing wallet.service.spec.ts mock-typing errors).

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/payment-settings apps/api/src/app.module.ts
git commit -m "feat(api): payment-settings module (admin-editable bank details)"
```

---

### Task 1.2: Ticket creation bills base only for SPLIT flows

**Files:**
- Modify: `apps/api/src/tickets/tickets.service.ts` (`createIntakeTicket`, ~line 451 where `totalAmount` is set)
- Test: `apps/api/src/tickets/tickets.service.spec.ts`

- [ ] **Step 1: Write the failing test** — a SPLIT consumer ticket starts with `totalAmount === serviceCost` (base), even if pricing.total includes surcharges. Mirror the existing `createIntakeTicket` test harness in the spec; assert the `prisma.ticket.create` `data.totalAmount` equals `data.serviceCost` for `judicial_case_files`.

```ts
// In the existing createIntakeTicket describe: build a pricing mock with
// serviceCost=5000, total=8000, flow=judicial_case_files, then assert:
expect(created.data.totalAmount).toBe(created.data.serviceCost); // base only for SPLIT
```

- [ ] **Step 2: Run it (fails — currently totalAmount = pricing.total)**

Run: `cd apps/api && pnpm test src/tickets/tickets.service.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implement** — in `createIntakeTicket`, compute the billed total by payment model. Add near the pricing resolution, then use it in `data.totalAmount`:

```ts
import { paymentModelFor } from '@wusuq/shared';
// ...
const billedTotal = pricing.matched
  ? (paymentModelFor(dto.flow) === 'SPLIT' ? pricing.serviceCost : pricing.total)
  : 0;
```

Replace `totalAmount: pricing.matched ? pricing.total : 0,` with `totalAmount: billedTotal,`.

> Rationale: SPLIT flows bill base now; phase-2 surcharges are added at finalize (Task 1.4). ONE_TIME keeps the full computed total.

- [ ] **Step 4: Run tests** — Run: `cd apps/api && pnpm test src/tickets/tickets.service.spec.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/tickets/tickets.service.ts apps/api/src/tickets/tickets.service.spec.ts
git commit -m "feat(tickets): SPLIT flows bill base at creation, remainder later"
```

---

### Task 1.3: Phase-aware gating (rewrite `assertPaymentSatisfied`)

**Files:**
- Modify: `apps/api/src/tickets/tickets.service.ts` (`assertPaymentSatisfied`, the dev-bypass version added earlier)
- Test: `apps/api/src/tickets/tickets.service.spec.ts` (extend the existing "Payment gate" describe)

- [ ] **Step 1: Write failing tests** in the "Payment gate" describe (it already builds a gate harness — extend its ticket shape with `intakeFlow`, `serviceCost`, `amountPaid`, `totalAmount`):
  - SPLIT, base covered (`amountPaid >= serviceCost`) but remainder unpaid → `ASSIGNED` allowed.
  - SPLIT, base covered, finalized total unpaid → `COMPLETED` blocked (remainder due).
  - SPLIT, full paid (`amountPaid >= totalAmount`) → `COMPLETED` allowed.
  - ONE_TIME, `amountPaid < serviceCost` → `ASSIGNED` blocked.

```ts
// Example assertions (adapt to the harness):
it('SPLIT: base covered allows ASSIGNED even with remainder pending', async () => {
  const { service, prisma } = buildGateHarness({
    createdBy: 'CONSUMER', intakeFlow: 'judicial_case_files',
    serviceCost: 5000, amountPaid: 5000, totalAmount: 5000, paymentStatus: 'PAID',
  });
  await service.updateStatus('tkt-1', 'ASSIGNED', undefined, { actorUserId: 'a' });
  expect(prisma.ticket.update).toHaveBeenCalled();
});
it('SPLIT: COMPLETED blocked until remainder covered', async () => {
  const { service } = buildGateHarness({
    createdBy: 'CONSUMER', intakeFlow: 'judicial_case_files',
    serviceCost: 5000, amountPaid: 5000, totalAmount: 8000, paymentStatus: 'PARTIALLY_PAID', status: 'WAITING_APPROVAL',
  });
  await expect(service.updateStatus('tkt-1', 'COMPLETED', undefined, { actorUserId: 'a' }))
    .rejects.toBeInstanceOf(ForbiddenException);
});
```

- [ ] **Step 2: Run (fails)** — Run: `cd apps/api && pnpm test src/tickets/tickets.service.spec.ts` → FAIL.

- [ ] **Step 3: Implement** — replace `assertPaymentSatisfied` body:

```ts
private assertPaymentSatisfied(
  ticket: {
    createdBy: 'CONSUMER' | 'ADMIN_STAFF';
    intakeFlow?: string | null;
    paymentStatus: 'UNPAID' | 'PARTIALLY_PAID' | 'PAID';
    serviceCost?: unknown;
    amountPaid?: unknown;
    totalAmount?: unknown;
  },
  nextStatus: TicketStatus,
) {
  if (process.env.DISABLE_PAYMENT_GATING === 'true') return;
  if (ticket.createdBy !== 'CONSUMER') return;
  if (nextStatus === 'PENDING') return;

  const base = Number(ticket.serviceCost ?? 0);
  const paid = Number(ticket.amountPaid ?? 0);
  const total = Number(ticket.totalAmount ?? 0);
  const model = paymentModelFor(ticket.intakeFlow);

  // Dispatch/completion needs the full (finalized) amount for SPLIT flows.
  if (nextStatus === 'COMPLETED') {
    if (paid >= total) return;
    throw new ForbiddenException('Final payment must be completed before dispatch.');
  }

  // All other forward transitions (e.g. ASSIGNED) need the base covered.
  const dueNow = model === 'SPLIT' ? base : total;
  if (paid >= dueNow) return;
  throw new ForbiddenException('Ticket cannot be progressed until payment is completed.');
}
```

> Ensure both call sites (`updateStatus` ~line 681, `assignClerk` ~line 803) pass a ticket object that now includes `intakeFlow`, `serviceCost`, `amountPaid`, `totalAmount` in their `select`/object. Update those selects.

- [ ] **Step 4: Run tests** → PASS (existing gate tests still green; new ones green).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/tickets/tickets.service.ts apps/api/src/tickets/tickets.service.spec.ts
git commit -m "feat(tickets): phase-aware payment gating (base to assign, full to dispatch)"
```

---

### Task 1.4: Clerk phase-2 charge entry + admin edit + finalize

**Files:**
- Modify: `apps/api/src/tickets/tickets.service.ts` (new methods), `tickets.controller.ts` (routes), DTOs
- Modify: `apps/api/src/wallet/wallet.service.ts` (expose a reusable `settleTicketsForUser(userId)` wrapper around `clearPendingTickets`, or call it from tickets after finalize)
- Test: `apps/api/src/tickets/tickets.service.spec.ts`

- [ ] **Step 1: Write failing test** — `finalizeRemainder` sets `totalAmount = serviceCost + attested + nonAttested + printing + delivery + pdf` from the **admin-edited** values, sets `remainderFinalizedAt`, flips `paymentStatus` to `PARTIALLY_PAID` (if `amountPaid < total`) or `PAID`, and triggers wallet settlement.

```ts
it('finalizeRemainder bumps totalAmount from edited charges and re-settles', async () => {
  // serviceCost 5000, edited charges sum 3000 -> totalAmount 8000
  // amountPaid 5000 -> PARTIALLY_PAID; wallet settle invoked
});
```

- [ ] **Step 2: Run (fails)** → FAIL.

- [ ] **Step 3: Implement the charge-entry DTO** `dto/finalize-remainder.dto.ts`:

```ts
import { IsNumber, IsOptional, Min } from 'class-validator';
export class FinalizeRemainderDto {
  @IsOptional() @IsNumber() @Min(0) attestedCharges?: number;
  @IsOptional() @IsNumber() @Min(0) nonAttestedCharges?: number;
  @IsOptional() @IsNumber() @Min(0) printingCharges?: number;
  @IsOptional() @IsNumber() @Min(0) deliveryCharges?: number;
  @IsOptional() @IsNumber() @Min(0) pdfCharges?: number;
}
```

- [ ] **Step 4: Implement `saveClerkCharges` (clerk draft) and `finalizeRemainder` (admin)** in `tickets.service.ts`. `saveClerkCharges` writes the charge fields (draft, not finalized). `finalizeRemainder` recomputes and settles:

```ts
async finalizeRemainder(ticketId: string, dto: FinalizeRemainderDto, actor: { actorUserId?: string }) {
  const ticket = await this.prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { id: true, consumerId: true, serviceCost: true, amountPaid: true, intakeFlow: true },
  });
  if (!ticket) throw new NotFoundException('Ticket not found');
  const caps = chargeCapabilitiesFor(ticket.intakeFlow);
  const attested = caps.attestation ? Number(dto.attestedCharges ?? 0) : 0;
  const nonAttested = caps.attestation ? Number(dto.nonAttestedCharges ?? 0) : 0;
  const printing = caps.printing ? Number(dto.printingCharges ?? 0) : 0;
  const delivery = caps.delivery ? Number(dto.deliveryCharges ?? 0) : 0;
  const pdf = caps.pdf ? Number(dto.pdfCharges ?? 0) : 0;
  const total = Number(ticket.serviceCost) + attested + nonAttested + printing + delivery + pdf;
  const paid = Number(ticket.amountPaid);

  await this.prisma.ticket.update({
    where: { id: ticketId },
    data: {
      attestedCharges: attested, nonAttestedCharges: nonAttested,
      printingCharges: printing, deliveryCharges: delivery,
      totalAmount: total,
      paymentStatus: paid >= total ? 'PAID' : 'PARTIALLY_PAID',
      remainderFinalizedAt: new Date(),
      remainderFinalizedByUserId: actor.actorUserId ?? null,
    },
  });
  // Auto-cover from any wallet excess, then notify if a balance remains.
  await this.wallet.settleTicketsForUser(ticket.consumerId);
  await this.dispatcher.paymentRemainderDue(ticketId); // no-op if now PAID (Task 1.6)
  return this.findOne(ticketId);
}
```

> Inject `WalletService` and `NotificationDispatcher` into `TicketsService` if not already. Add `settleTicketsForUser(userId)` to `WalletService` as a public method that opens a `$transaction`, reads the user's `walletBalance`, and calls the existing private `clearPendingTickets(userId, balance, 'BANK_TRANSFER', tx)`.
>
> **Ordering / dependency notes:**
> - `dispatcher.paymentRemainderDue(...)` is **defined in Task 1.6**. If implementing 1.4 first, omit that one line and wire it in 1.6 (Task 1.6 step 4 covers it). Everything else in 1.4 stands alone.
> - `TicketsModule` must `imports: [WalletModule]` and `WalletModule` must `exports: [WalletService]`. If this creates a circular module graph (Wallet already importing Tickets), use `forwardRef(() => WalletModule)` / `@Inject(forwardRef(() => WalletService))` — check the existing module graph before wiring.

- [ ] **Step 5: Add controller routes** in `tickets.controller.ts` (mirror existing `@Post(':id/...')` patterns + guards):
  - `POST /tickets/:id/clerk-charges` → `saveClerkCharges` (clerk role).
  - `POST /tickets/:id/finalize-remainder` → `finalizeRemainder` (admin/finance role).

- [ ] **Step 6: Run tests + typecheck** → PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/tickets apps/api/src/wallet/wallet.service.ts
git commit -m "feat(tickets): clerk phase-2 charges + admin finalize remainder (capability-gated)"
```

---

### Task 1.5: Ticket-tagged payment submission, admin approve/reject, admin wallet adjustment

**Files:**
- Modify: `apps/api/src/wallet/wallet.service.ts`, `wallet.controller.ts`, DTOs
- Test: `apps/api/src/wallet/wallet.service.spec.ts`

- [ ] **Step 1: Write failing tests**
  - `adjustWallet(userId, amount, note, adminId)` increments/decrements `walletBalance`, writes an `ADMIN_ADJUSTMENT` `WalletTransaction` (`VERIFIED`), and re-settles tickets on a positive adjustment.
  - Submitting a ticket payment creates a `TICKET_PAYMENT` `WalletTransaction` (`PENDING_VERIFICATION`, `ticketId` set).

- [ ] **Step 2: Run (fails)** → FAIL.

- [ ] **Step 3: Implement**
  - Extend `topup` (or add `submitTicketPayment`) to accept an optional `ticketId` and set `type: 'TICKET_PAYMENT'` when present, else `'TOPUP'`.
  - In `verifyTopup`, after crediting, the existing `clearPendingTickets` already settles — keep. Tag the credit `type` appropriately.
  - Add `adjustWallet`:

```ts
async adjustWallet(userId: string, amount: number, note: string, adminId?: string) {
  return this.prisma.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id: userId },
      data: { walletBalance: { increment: amount } },
      select: { walletBalance: true },
    });
    await tx.walletTransaction.create({
      data: {
        userId, amount, paymentMode: 'BANK_TRANSFER', currency: 'PKR',
        status: 'VERIFIED', type: 'ADMIN_ADJUSTMENT', verifiedAt: new Date(),
        reviewedByUserId: adminId, note,
      },
    });
    if (amount > 0) {
      await this.clearPendingTickets(userId, Number(user.walletBalance), 'BANK_TRANSFER', tx);
    }
    return user;
  });
}
```

  - Tag existing auto-deduction debit entries (`applyPaymentToTicket`) with `type: 'TICKET_DEBIT'`.

- [ ] **Step 4: Add routes** in `wallet.controller.ts` (admin-guarded): `POST /wallet/:userId/adjust`. Consumer ticket-payment submission rides the existing `POST /wallet/topup` + `POST /wallet/receipt` with an optional `ticketId`.

- [ ] **Step 5: Run tests + typecheck** → PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/wallet
git commit -m "feat(wallet): ticket-tagged payments, admin wallet adjustment, typed ledger"
```

---

### Task 1.6: Notifications (payment submitted / approved / rejected / remainder due)

**Files:**
- Modify: `packages/shared/src/index.ts` (`NOTIFICATION_TYPES`), `apps/api/src/notifications/notification-templates.ts`, `notification-dispatcher.service.ts`

- [ ] **Step 1: Add notification types** to `NOTIFICATION_TYPES` (after `WALLET_RECEIPT_UPLOADED`, line 402):

```ts
  PAYMENT_SUBMITTED: 'payment.submitted',
  PAYMENT_APPROVED: 'payment.approved',
  PAYMENT_REJECTED: 'payment.rejected',
  PAYMENT_REMAINDER_DUE: 'payment.remainder_due',
```

- [ ] **Step 2: Add templates** in `notification-templates.ts` mirroring existing wallet template functions (title + body), e.g. `paymentRemainderDueForConsumer(batchNo, amount)`.

- [ ] **Step 3: Add dispatcher methods** in `notification-dispatcher.service.ts` mirroring `walletTopupCreated`/`walletTopupDecided`: `paymentSubmitted(transactionId)` → admins/finance; `paymentDecided(transactionId, approved)` → consumer; `paymentRemainderDue(ticketId)` → consumer (skip if ticket already `PAID`).

- [ ] **Step 4: Wire calls** — call `paymentSubmitted` from the ticket-payment submission path; `paymentDecided` from `verifyTopup`/`rejectTopup` when the txn is `TICKET_PAYMENT`; `paymentRemainderDue` from `finalizeRemainder` (Task 1.4).

- [ ] **Step 5: Build shared + typecheck + test**

Run: `pnpm --filter @wusuq/shared build && cd apps/api && pnpm typecheck && pnpm test`
Expected: PASS (pre-existing wallet.service.spec mock-typing errors aside).

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/index.ts apps/api/src/notifications
git commit -m "feat(notifications): payment submitted/approved/rejected/remainder-due events"
```

---

## PHASE 2 — Frontend

> Mirror existing components. Consumer wallet UI: `consumer-wallet-board.tsx`. Admin review UI: `finance-board.tsx`. Charges display: `ticket-charges-board.tsx`, `ticket-detail-panel.tsx`. API client: `apps/web/lib/payments-client.ts` / a new `lib/payment-settings-client.ts`.

### Task 2.1: Consumer payment screen (bank details + screenshot + pay now/later)

**Files:**
- Modify: `apps/web/app/(consumer)/consumer/tickets/[id]/pay/page.tsx`
- Create: `apps/web/lib/payment-settings-client.ts`

- [ ] **Step 1:** Add `payment-settings-client.ts` with `getBankDetails()` → `GET /payment-settings`.
- [ ] **Step 2:** On the pay page, fetch + render the bank block (bank name, account title, number, IBAN, instructions). Add an amount field defaulting to the ticket's current due (`serviceCost` for SPLIT pre-finalize; remainder if finalized) with an option to pay the full SPLIT amount upfront.
- [ ] **Step 3:** Add screenshot upload + submit (reuse the wallet receipt upload endpoint with `ticketId`), and a "Pay later" button that returns to the dashboard without submitting.
- [ ] **Step 4:** Typecheck web (`cd apps/web && pnpm typecheck`) → PASS.
- [ ] **Step 5:** Commit: `feat(web): consumer ticket payment screen with bank details + screenshot`.

### Task 2.2: Consumer remainder prompt + payment-window visibility

**Files:** `apps/web/components/consumer-ticket-board.tsx`, ticket detail consumer view.

- [ ] **Step 1:** Show a "Pay now" CTA only when payment is due (consumer-created, current phase not covered) — hide for admin-created / covered tickets (use `paymentStatus`, `amountPaid`, `serviceCost`, `remainderFinalizedAt`).
- [ ] **Step 2:** When `remainderFinalizedAt` is set and not `PAID`, show a "Final payment due" prompt linking to the pay screen with the remainder amount.
- [ ] **Step 3:** Typecheck → PASS. Commit: `feat(web): consumer remainder prompt + conditional pay window`.

### Task 2.3: Admin payment-approval queue + wallet adjustment + bank-details editor

**Files:** `apps/web/components/finance-board.tsx` (or a new admin payments view), `apps/web/lib/payments-client.ts`.

- [ ] **Step 1:** Add a queue of `PENDING_VERIFICATION` `WalletTransaction`s (filter `type IN (TOPUP, TICKET_PAYMENT)`) with screenshot preview + Approve/Reject (existing verify/reject endpoints).
- [ ] **Step 2:** Add a wallet-adjustment form (amount + note) → `POST /wallet/:userId/adjust`.
- [ ] **Step 3:** Add a bank-details editor (`PUT /payment-settings`).
- [ ] **Step 4:** Typecheck → PASS. Commit: `feat(web): admin payment approvals, wallet adjustment, bank-details editor`.

### Task 2.4: Phase-2 charge review/edit/finalize (admin) + capability-gated clerk fields

**Files:** `apps/web/components/ticket-board.tsx` (assignment per-page rate inputs), `ticket-detail-panel.tsx` / clerk charge entry, a new admin "finalize" action.

- [ ] **Step 1:** Gate the attested/non-attested + printing charge inputs by `chargeCapabilitiesFor(ticket.intakeFlow)` from `@wusuq/shared` — render attestation inputs only when `caps.attestation`, printing when `caps.printing`, etc. Hide the whole charge window for flows with no capabilities. (This fixes "don't show the window for all tickets" — currently `ticket-board.tsx` renders rate inputs for all.)
- [ ] **Step 2:** Add the admin "review & edit phase-2 charges, then Finalize" UI calling `POST /tickets/:id/finalize-remainder` with the edited amounts.
- [ ] **Step 3:** Typecheck → PASS. Commit: `feat(web): capability-gated clerk charges + admin remainder finalize`.

### Task 2.5: Checkout base-only + remove TCS-Lahore

**Files:** `apps/web/components/intake-wizard.tsx` (`checkoutSummary` useMemo ~lines 1327-1391), `apps/web/components/intake-wizard/checkout-panel.tsx`, `apps/web/lib/intake-flows.ts` (delivery options).

- [ ] **Step 1:** In `checkoutSummary`, for SPLIT flows show base only — drop the attested/non-attested, delivery, and PDF line items (they move to phase-2). For ONE_TIME flows keep the existing breakdown.
- [ ] **Step 2:** Remove the "Lahore" destination from the TCS delivery option. First locate it: `grep -rni "lahore" apps/web/lib/intake-flows.ts apps/web/components | grep -i tcs` and inspect the `delivery_mode`/`delivery_address` TCS config; remove the Lahore entry from whatever list backs it. If no explicit Lahore option exists, document that in the commit and skip.
- [ ] **Step 3:** Typecheck → PASS. Commit: `feat(web): base-only checkout for split flows; remove TCS Lahore`.

---

## PHASE 3 — Verification

### Task 3.1: Full verification

- [ ] **Step 1:** `pnpm --filter @wusuq/shared build && pnpm lint && pnpm typecheck && pnpm test`
Expected: all PASS (pre-existing `wallet.service.spec.ts` mock-typing + `pakistan-seed.ts` prettier issues are unrelated — confirm no NEW failures).

- [ ] **Step 2: Manual smoke (api + web running, DB migrated):**
  - Admin sets bank details; consumer sees them on the pay screen.
  - SPLIT (Case Files): consumer pays base → screenshot → admin approves → wallet credited → base covered → ticket assignable. Consumer paying full upfront leaves excess in wallet.
  - Clerk enters attested/printing (only the capable fields show); admin edits + finalizes → remainder due → auto-covered from excess OR consumer pays → dispatch unlocks.
  - ONE_TIME (Case Info): single base payment; no phase-2 prompt; no clerk charge window.
  - Admin wallet adjustment reflects in balance and auto-settles open tickets.
  - Payment prompt hidden for admin-created/covered tickets.

- [ ] **Step 3:** Commit any fixups: `test(payments): verification fixups`.

---

## Self-review notes (author)

- **Spec coverage:** §1 PAYMENT_MODEL_BY_FLOW → 0.1; §2 wallet/bank/admin-adjust → 1.1/1.5/2.1/2.3; §3 two-phase amounts → 1.2/1.4; §4 phase-2 finalize + admin edit → 1.4/2.4; §4a capabilities → 0.1/2.4; §5 gating → 1.3; §6 checkout + TCS → 2.5; §7 consumer prompt visibility → 2.2; §8 notifications → 1.6. All covered.
- **Migrations / DB-access steps** (0.2 step 5, 3.x manual) need the Neon DB; if the sandbox blocks the host, the human runs them.
- **Open item carried:** clerkCost handling vs the phase model — currently `assignClerk` adds clerkCost to `totalAmount`. Confirm during 1.3/1.4 whether clerkCost stays internal or is consumer-billed; keep current behaviour unless it conflicts with the base/remainder split (flag if it does).
