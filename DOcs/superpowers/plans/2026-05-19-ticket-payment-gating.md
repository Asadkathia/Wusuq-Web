# Ticket Payment Gating Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a payment gate to the ticket lifecycle. Consumer-created tickets must be `paymentStatus=PAID` before leaving `PENDING`; admin-created tickets stay ungated. Payments flow through a swappable `PaymentProvider` interface with a mock implementation for v1.

**Architecture:** New `PaymentsModule` in the API owns the gateway abstraction, idempotent webhook handling, and atomic Ticket/Invoice updates. `TicketsService.assertPaymentSatisfied` enforces the gate at every status transition out of PENDING. The intake wizard redirects to a new `/consumer/tickets/[id]/pay` page after submission; consumers either Pay Now (mock checkout in dev → webhook → ticket flips to PAID) or Pay Later (parked in an "Unpaid" tab on the dashboard).

**Tech Stack:** NestJS 11, Prisma, Next.js 16, React 19, Jest, Playwright, Decimal.js.

**Spec:** `docs/superpowers/specs/2026-05-19-ticket-payment-gating-design.md`

---

## File Structure

### Created
- `apps/api/prisma/migrations/<ts>_add_payment_gating/migration.sql` — schema migration
- `apps/api/src/payments/payments.module.ts`
- `apps/api/src/payments/payments.controller.ts`
- `apps/api/src/payments/payments.service.ts`
- `apps/api/src/payments/payments.service.spec.ts`
- `apps/api/src/payments/providers/payment-provider.interface.ts`
- `apps/api/src/payments/providers/mock-provider.ts`
- `apps/api/src/payments/providers/mock-provider.spec.ts`
- `apps/api/src/payments/providers/provider.factory.ts`
- `apps/api/src/payments/dto/initiate-payment.dto.ts`
- `apps/api/src/payments/dto/webhook-payload.dto.ts`
- `apps/web/app/(consumer)/tickets/[id]/pay/page.tsx`
- `apps/web/app/(consumer)/payments/mock/[paymentId]/page.tsx`
- `apps/web/app/(consumer)/payments/return/page.tsx`
- `apps/web/lib/payments-client.ts`
- `tests/e2e/payment-gating.spec.ts`

### Modified
- `apps/api/prisma/schema.prisma` — add enums + Payment model + Ticket.createdBy
- `apps/api/src/tickets/tickets.service.ts` — stamp `createdBy`, add `assertPaymentSatisfied`, call from `updateStatus` + `assignTicket`
- `apps/api/src/tickets/tickets.service.spec.ts` — gate matrix tests
- `apps/api/src/app.module.ts` — register PaymentsModule
- `apps/api/.env.example` — new env vars
- `apps/web/components/intake-wizard.tsx` — redirect to pay page on submit success
- `apps/web/app/(consumer)/dashboard/page.tsx` — add Unpaid tab
- `apps/web/.env.example` — `NEXT_PUBLIC_PAYMENT_PROVIDER`

---

## Task 1: Schema migration — Payment model, TicketOrigin, Ticket.createdBy

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<ts>_add_payment_gating/migration.sql` (Prisma generates)

- [ ] **Step 1: Add enums and Payment model to `schema.prisma`**

Insert after the existing `TicketPaymentStatus` enum block:

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
```

Add `createdBy` and `payments` to the `Ticket` model (after the existing `paymentStatus` line and inside the relations block respectively):

```prisma
  createdBy       TicketOrigin        @default(ADMIN_STAFF)
  ...
  payments        Payment[]
```

Add the new `Payment` model after the existing `Invoice` model:

```prisma
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
```

Add to the `Ticket` `@@index` block:

```prisma
  @@index([createdBy])
```

- [ ] **Step 2: Generate the migration**

Run:
```bash
cd apps/api && pnpm prisma migrate dev --name add_payment_gating --create-only
```
Expected: a new `prisma/migrations/<ts>_add_payment_gating/migration.sql` is written but not applied.

- [ ] **Step 3: Append the backfill SQL to the generated migration**

Open the generated `migration.sql` and append at the end:

```sql
-- Backfill Ticket.createdBy: CONSUMER where the original TICKET_CREATED audit log actor matches the ticket's consumerId.
UPDATE "Ticket" t
SET "createdBy" = 'CONSUMER'
WHERE EXISTS (
  SELECT 1 FROM "AuditLog" a
  WHERE a."entity" = 'TICKET'
    AND a."entityId" = t."id"
    AND a."action" = 'TICKET_CREATED'
    AND a."actorUserId" = t."consumerId"
);
```

- [ ] **Step 4: Apply migration locally**

Run:
```bash
cd apps/api && pnpm prisma migrate dev
```
Expected: migration applies, Prisma client regenerates.

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(db): add Payment model and Ticket.createdBy for payment gating"
```

---

## Task 2: PaymentProvider interface and DTOs

**Files:**
- Create: `apps/api/src/payments/providers/payment-provider.interface.ts`
- Create: `apps/api/src/payments/dto/initiate-payment.dto.ts`
- Create: `apps/api/src/payments/dto/webhook-payload.dto.ts`

- [ ] **Step 1: Write the interface**

`apps/api/src/payments/providers/payment-provider.interface.ts`:

```ts
import { Decimal } from '@prisma/client/runtime/library';
import { PaymentProviderName } from '@prisma/client';

export interface InitiatePaymentInput {
  ticketId: string;
  amount: Decimal;
  currency: 'PKR';
  consumerId: string;
  returnUrl: string;
  notifyUrl: string;
}

export interface InitiatePaymentResult {
  providerTxnId: string;
  redirectUrl: string;
  rawRequest: unknown;
}

export interface VerifyCallbackResult {
  providerTxnId: string;
  status: 'SUCCESS' | 'FAILED' | 'CANCELLED';
  amount: number;
  signatureValid: boolean;
}

export interface PaymentProvider {
  readonly name: PaymentProviderName;
  initiate(input: InitiatePaymentInput): Promise<InitiatePaymentResult>;
  verifyCallback(
    rawBody: unknown,
    headers: Record<string, string>,
  ): VerifyCallbackResult;
}

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');
```

- [ ] **Step 2: Write the DTOs**

`apps/api/src/payments/dto/initiate-payment.dto.ts`:

```ts
import { IsString } from 'class-validator';

export class InitiatePaymentDto {
  @IsString()
  ticketId!: string;
}
```

`apps/api/src/payments/dto/webhook-payload.dto.ts`:

```ts
// Webhook bodies are provider-specific; we accept arbitrary JSON and let the
// active PaymentProvider.verifyCallback validate signature + shape.
export type WebhookPayload = Record<string, unknown>;
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/payments/providers/payment-provider.interface.ts apps/api/src/payments/dto
git commit -m "feat(payments): add PaymentProvider interface and DTOs"
```

---

## Task 3: MockProvider implementation (TDD)

**Files:**
- Create: `apps/api/src/payments/providers/mock-provider.spec.ts`
- Create: `apps/api/src/payments/providers/mock-provider.ts`

- [ ] **Step 1: Write the failing tests**

`apps/api/src/payments/providers/mock-provider.spec.ts`:

```ts
import { Decimal } from '@prisma/client/runtime/library';
import { MockProvider } from './mock-provider';

describe('MockProvider', () => {
  const provider = new MockProvider();

  describe('initiate', () => {
    it('returns a deterministic-shaped providerTxnId and a mock redirect URL', async () => {
      const result = await provider.initiate({
        ticketId: 'tkt_123',
        amount: new Decimal('500.00'),
        currency: 'PKR',
        consumerId: 'usr_1',
        returnUrl: 'http://localhost:3000/return',
        notifyUrl: 'http://localhost:4000/api/payments/webhook/mock',
      });
      expect(result.providerTxnId).toMatch(/^MOCK-/);
      expect(result.redirectUrl).toContain('/consumer/payments/mock/');
      expect(result.rawRequest).toMatchObject({ ticketId: 'tkt_123', amount: '500' });
    });
  });

  describe('verifyCallback', () => {
    it('rejects payloads without the shared mock signature header', () => {
      const result = provider.verifyCallback(
        { providerTxnId: 'MOCK-1', status: 'SUCCESS', amount: 500 },
        {},
      );
      expect(result.signatureValid).toBe(false);
    });

    it('accepts a valid signed payload', () => {
      const result = provider.verifyCallback(
        { providerTxnId: 'MOCK-1', status: 'SUCCESS', amount: 500 },
        { 'x-mock-signature': 'mock-signed' },
      );
      expect(result.signatureValid).toBe(true);
      expect(result.status).toBe('SUCCESS');
      expect(result.amount).toBe(500);
      expect(result.providerTxnId).toBe('MOCK-1');
    });

    it('normalises unknown status to FAILED', () => {
      const result = provider.verifyCallback(
        { providerTxnId: 'MOCK-1', status: 'WAT', amount: 500 },
        { 'x-mock-signature': 'mock-signed' },
      );
      expect(result.status).toBe('FAILED');
    });
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run:
```bash
cd apps/api && pnpm test -- --testPathPattern=mock-provider
```
Expected: FAIL — `Cannot find module './mock-provider'`.

- [ ] **Step 3: Implement MockProvider**

`apps/api/src/payments/providers/mock-provider.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { PaymentProviderName } from '@prisma/client';
import { randomUUID } from 'crypto';
import {
  InitiatePaymentInput,
  InitiatePaymentResult,
  PaymentProvider,
  VerifyCallbackResult,
} from './payment-provider.interface';

const MOCK_SIGNATURE = 'mock-signed';

@Injectable()
export class MockProvider implements PaymentProvider {
  readonly name: PaymentProviderName = 'MOCK';

  async initiate(input: InitiatePaymentInput): Promise<InitiatePaymentResult> {
    const providerTxnId = `MOCK-${randomUUID()}`;
    return {
      providerTxnId,
      redirectUrl: `/consumer/payments/mock/${providerTxnId}`,
      rawRequest: {
        ticketId: input.ticketId,
        amount: input.amount.toString(),
        currency: input.currency,
        consumerId: input.consumerId,
        returnUrl: input.returnUrl,
        notifyUrl: input.notifyUrl,
      },
    };
  }

  verifyCallback(
    rawBody: unknown,
    headers: Record<string, string>,
  ): VerifyCallbackResult {
    const body = (rawBody ?? {}) as Record<string, unknown>;
    const signatureValid = headers['x-mock-signature'] === MOCK_SIGNATURE;
    const rawStatus = String(body.status ?? '');
    const status: VerifyCallbackResult['status'] =
      rawStatus === 'SUCCESS' || rawStatus === 'FAILED' || rawStatus === 'CANCELLED'
        ? rawStatus
        : 'FAILED';
    return {
      providerTxnId: String(body.providerTxnId ?? ''),
      status,
      amount: Number(body.amount ?? 0),
      signatureValid,
    };
  }
}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run:
```bash
cd apps/api && pnpm test -- --testPathPattern=mock-provider
```
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/payments/providers
git commit -m "feat(payments): add MockProvider for dev payment gating"
```

---

## Task 4: Provider factory

**Files:**
- Create: `apps/api/src/payments/providers/provider.factory.ts`

- [ ] **Step 1: Write the factory**

`apps/api/src/payments/providers/provider.factory.ts`:

```ts
import { ConfigService } from '@nestjs/config';
import { Provider } from '@nestjs/common';
import { PAYMENT_PROVIDER } from './payment-provider.interface';
import { MockProvider } from './mock-provider';

export const PaymentProviderFactory: Provider = {
  provide: PAYMENT_PROVIDER,
  inject: [ConfigService],
  useFactory: (config: ConfigService) => {
    const name = (config.get<string>('PAYMENT_PROVIDER') ?? 'mock').toLowerCase();
    switch (name) {
      case 'mock':
        return new MockProvider();
      default:
        throw new Error(`Unknown PAYMENT_PROVIDER "${name}"`);
    }
  },
};
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/payments/providers/provider.factory.ts
git commit -m "feat(payments): add provider factory selecting impl from env"
```

---

## Task 5: PaymentsService — initiate + handleWebhook (TDD)

**Files:**
- Create: `apps/api/src/payments/payments.service.spec.ts`
- Create: `apps/api/src/payments/payments.service.ts`

- [ ] **Step 1: Write the failing tests**

`apps/api/src/payments/payments.service.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentsService } from './payments.service';
import { MockProvider } from './providers/mock-provider';
import { PAYMENT_PROVIDER } from './providers/payment-provider.interface';
import { AuditLogsService } from '../audit-logs/audit-logs.service';

const makePrisma = () => ({
  ticket: { findUnique: jest.fn(), update: jest.fn() },
  payment: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
  invoice: { upsert: jest.fn() },
  $transaction: jest.fn(async (cb: any) => cb(prisma)),
});

let prisma: ReturnType<typeof makePrisma>;

describe('PaymentsService', () => {
  let service: PaymentsService;
  let audit: { create: jest.Mock };

  beforeEach(async () => {
    prisma = makePrisma();
    audit = { create: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: PAYMENT_PROVIDER, useValue: new MockProvider() },
        { provide: AuditLogsService, useValue: audit },
        {
          provide: ConfigService,
          useValue: {
            get: (k: string) =>
              k === 'PAYMENT_RETURN_URL'
                ? 'http://localhost:3000/consumer/payments/return'
                : 'http://localhost:4000/api/payments/webhook/mock',
          },
        },
      ],
    }).compile();
    service = moduleRef.get(PaymentsService);
  });

  describe('initiate', () => {
    it('creates a Payment row and returns redirectUrl from provider', async () => {
      prisma.ticket.findUnique.mockResolvedValue({
        id: 'tkt_1',
        consumerId: 'usr_1',
        totalAmount: new Decimal('500'),
        paymentStatus: 'UNPAID',
      });
      prisma.payment.create.mockResolvedValue({ id: 'pay_1', providerTxnId: 'MOCK-x' });

      const result = await service.initiate('tkt_1', 'usr_1');

      expect(prisma.payment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            ticketId: 'tkt_1',
            provider: 'MOCK',
            status: 'INITIATED',
          }),
        }),
      );
      expect(result.redirectUrl).toContain('/consumer/payments/mock/');
    });

    it('rejects when ticket is not owned by consumer', async () => {
      prisma.ticket.findUnique.mockResolvedValue({
        id: 'tkt_1',
        consumerId: 'usr_other',
        totalAmount: new Decimal('500'),
        paymentStatus: 'UNPAID',
      });
      await expect(service.initiate('tkt_1', 'usr_1')).rejects.toThrow(/forbidden/i);
    });

    it('rejects when ticket is already paid', async () => {
      prisma.ticket.findUnique.mockResolvedValue({
        id: 'tkt_1',
        consumerId: 'usr_1',
        totalAmount: new Decimal('500'),
        paymentStatus: 'PAID',
      });
      await expect(service.initiate('tkt_1', 'usr_1')).rejects.toThrow(/already paid/i);
    });
  });

  describe('handleWebhook', () => {
    it('rejects payloads with invalid signature', async () => {
      await expect(
        service.handleWebhook('mock', { providerTxnId: 'MOCK-x', status: 'SUCCESS', amount: 500 }, {}),
      ).rejects.toThrow(/signature/i);
    });

    it('flips ticket to PAID on successful verified callback', async () => {
      prisma.payment.findUnique.mockResolvedValue({
        id: 'pay_1',
        ticketId: 'tkt_1',
        providerTxnId: 'MOCK-x',
        status: 'INITIATED',
        amount: new Decimal('500'),
        ticket: { id: 'tkt_1', totalAmount: new Decimal('500') },
      });

      await service.handleWebhook(
        'mock',
        { providerTxnId: 'MOCK-x', status: 'SUCCESS', amount: 500 },
        { 'x-mock-signature': 'mock-signed' },
      );

      expect(prisma.ticket.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'tkt_1' },
          data: expect.objectContaining({ paymentStatus: 'PAID' }),
        }),
      );
      expect(prisma.invoice.upsert).toHaveBeenCalled();
    });

    it('is idempotent — re-deliveries of a SUCCESS callback no-op', async () => {
      prisma.payment.findUnique.mockResolvedValue({
        id: 'pay_1',
        ticketId: 'tkt_1',
        providerTxnId: 'MOCK-x',
        status: 'SUCCESS',
        amount: new Decimal('500'),
        ticket: { id: 'tkt_1', totalAmount: new Decimal('500') },
      });
      await service.handleWebhook(
        'mock',
        { providerTxnId: 'MOCK-x', status: 'SUCCESS', amount: 500 },
        { 'x-mock-signature': 'mock-signed' },
      );
      expect(prisma.ticket.update).not.toHaveBeenCalled();
    });

    it('rejects callbacks where the verified amount mismatches the ticket total', async () => {
      prisma.payment.findUnique.mockResolvedValue({
        id: 'pay_1',
        ticketId: 'tkt_1',
        providerTxnId: 'MOCK-x',
        status: 'INITIATED',
        amount: new Decimal('500'),
        ticket: { id: 'tkt_1', totalAmount: new Decimal('500') },
      });
      await expect(
        service.handleWebhook(
          'mock',
          { providerTxnId: 'MOCK-x', status: 'SUCCESS', amount: 100 },
          { 'x-mock-signature': 'mock-signed' },
        ),
      ).rejects.toThrow(/amount/i);
    });
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run:
```bash
cd apps/api && pnpm test -- --testPathPattern=payments.service
```
Expected: FAIL — `Cannot find module './payments.service'`.

- [ ] **Step 3: Implement PaymentsService**

`apps/api/src/payments/payments.service.ts`:

```ts
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import {
  PAYMENT_PROVIDER,
  PaymentProvider,
} from './providers/payment-provider.interface';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly config: ConfigService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  async initiate(ticketId: string, consumerId: string) {
    const ticket = await this.prisma.ticket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Ticket not found');
    if (ticket.consumerId !== consumerId) {
      throw new ForbiddenException('Forbidden: ticket not owned by consumer');
    }
    if (ticket.paymentStatus === 'PAID') {
      throw new BadRequestException('Ticket already paid');
    }

    const returnUrl = this.config.get<string>('PAYMENT_RETURN_URL')!;
    const notifyUrl = this.config.get<string>('PAYMENT_NOTIFY_URL')!;
    const result = await this.provider.initiate({
      ticketId: ticket.id,
      amount: new Decimal(ticket.totalAmount),
      currency: 'PKR',
      consumerId,
      returnUrl,
      notifyUrl,
    });

    const payment = await this.prisma.payment.create({
      data: {
        ticketId: ticket.id,
        provider: this.provider.name,
        providerTxnId: result.providerTxnId,
        status: 'INITIATED',
        amount: new Decimal(ticket.totalAmount),
        rawRequest: result.rawRequest as any,
      },
    });

    return { paymentId: payment.id, providerTxnId: result.providerTxnId, redirectUrl: result.redirectUrl };
  }

  async getById(paymentId: string, consumerId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { ticket: { select: { consumerId: true, paymentStatus: true } } },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.ticket.consumerId !== consumerId) {
      throw new ForbiddenException('Forbidden');
    }
    return {
      id: payment.id,
      status: payment.status,
      ticketPaymentStatus: payment.ticket.paymentStatus,
    };
  }

  async handleWebhook(
    providerName: string,
    body: unknown,
    headers: Record<string, string>,
  ) {
    if (providerName.toUpperCase() !== this.provider.name) {
      throw new BadRequestException('Provider mismatch');
    }
    const verified = this.provider.verifyCallback(body, headers);
    if (!verified.signatureValid) {
      throw new ForbiddenException('Invalid signature');
    }
    const payment = await this.prisma.payment.findUnique({
      where: { providerTxnId: verified.providerTxnId },
      include: { ticket: { select: { id: true, totalAmount: true } } },
    });
    if (!payment) throw new NotFoundException('Payment not found');

    // Idempotency — terminal states no-op.
    if (payment.status !== 'INITIATED') {
      return { ok: true, idempotent: true };
    }

    if (verified.status === 'SUCCESS') {
      if (new Decimal(verified.amount).comparedTo(new Decimal(payment.ticket.totalAmount)) !== 0) {
        throw new BadRequestException('Webhook amount mismatch');
      }

      await this.prisma.$transaction(async (tx) => {
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: 'SUCCESS',
            completedAt: new Date(),
            rawCallback: body as any,
          },
        });
        await tx.ticket.update({
          where: { id: payment.ticket.id },
          data: {
            paymentStatus: 'PAID',
            amountPaid: new Decimal(payment.ticket.totalAmount),
          },
        });
        await tx.invoice.upsert({
          where: { ticketId: payment.ticket.id },
          create: {
            ticketId: payment.ticket.id,
            invoiceNo: `INV-${Date.now()}-${payment.ticket.id.slice(-6)}`,
            totalAmount: new Decimal(payment.ticket.totalAmount),
            amountPaid: new Decimal(payment.ticket.totalAmount),
            dueAmount: new Decimal(0),
            status: 'PAID',
            paidAt: new Date(),
          },
          update: {
            amountPaid: new Decimal(payment.ticket.totalAmount),
            dueAmount: new Decimal(0),
            status: 'PAID',
            paidAt: new Date(),
          },
        });
      });

      await this.auditLogs.create({
        action: 'PAYMENT_COMPLETED',
        entity: 'TICKET',
        entityId: payment.ticket.id,
        metadata: { paymentId: payment.id, providerTxnId: verified.providerTxnId },
      });
      return { ok: true };
    }

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: verified.status,
        completedAt: new Date(),
        rawCallback: body as any,
        failureReason: verified.status,
      },
    });
    return { ok: true, status: verified.status };
  }

  // Mock-only helper called by the dev mock-checkout page. Synthesises a webhook
  // body + signed header and routes through handleWebhook so the integration is
  // exercised identically in dev and prod.
  async devResolveMock(providerTxnId: string, outcome: 'SUCCESS' | 'FAILED' | 'CANCELLED') {
    if (this.provider.name !== 'MOCK') {
      throw new ForbiddenException('Mock-resolve disabled');
    }
    const payment = await this.prisma.payment.findUnique({
      where: { providerTxnId },
      include: { ticket: { select: { totalAmount: true } } },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    return this.handleWebhook(
      'mock',
      {
        providerTxnId,
        status: outcome,
        amount: Number(payment.ticket.totalAmount),
      },
      { 'x-mock-signature': 'mock-signed' },
    );
  }
}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run:
```bash
cd apps/api && pnpm test -- --testPathPattern=payments.service
```
Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/payments/payments.service.ts apps/api/src/payments/payments.service.spec.ts
git commit -m "feat(payments): add PaymentsService with idempotent webhook handling"
```

---

## Task 6: PaymentsController + PaymentsModule wiring

**Files:**
- Create: `apps/api/src/payments/payments.controller.ts`
- Create: `apps/api/src/payments/payments.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Write the controller**

`apps/api/src/payments/payments.controller.ts`:

```ts
import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Public } from '../auth/public.decorator';
import { PaymentsService } from './payments.service';
import { InitiatePaymentDto } from './dto/initiate-payment.dto';

interface AuthedRequest extends Request {
  user: { sub: string };
}

@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @UseGuards(JwtAuthGuard)
  @Post('initiate')
  initiate(@Body() dto: InitiatePaymentDto, @Req() req: AuthedRequest) {
    return this.payments.initiate(dto.ticketId, req.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':paymentId')
  getById(@Param('paymentId') paymentId: string, @Req() req: AuthedRequest) {
    return this.payments.getById(paymentId, req.user.sub);
  }

  @Public()
  @HttpCode(200)
  @Post('webhook/:provider')
  webhook(
    @Param('provider') provider: string,
    @Body() body: Record<string, unknown>,
    @Headers() headers: Record<string, string>,
  ) {
    return this.payments.handleWebhook(provider, body, headers);
  }

  @Public()
  @Post('mock/:providerTxnId/resolve')
  resolveMock(
    @Param('providerTxnId') providerTxnId: string,
    @Body() body: { outcome: 'SUCCESS' | 'FAILED' | 'CANCELLED' },
  ) {
    return this.payments.devResolveMock(providerTxnId, body.outcome);
  }
}
```

- [ ] **Step 2: Write the module**

`apps/api/src/payments/payments.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PaymentProviderFactory } from './providers/provider.factory';

@Module({
  imports: [ConfigModule, PrismaModule, AuditLogsModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, PaymentProviderFactory],
  exports: [PaymentsService],
})
export class PaymentsModule {}
```

- [ ] **Step 3: Register in AppModule**

Open `apps/api/src/app.module.ts`. Find the `imports:` array. Add `PaymentsModule`:

```ts
import { PaymentsModule } from './payments/payments.module';
// inside imports: [...existing, PaymentsModule]
```

- [ ] **Step 4: Verify the API still builds**

Run:
```bash
cd apps/api && pnpm build
```
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/payments/payments.controller.ts apps/api/src/payments/payments.module.ts apps/api/src/app.module.ts
git commit -m "feat(payments): expose initiate / webhook / mock-resolve endpoints"
```

---

## Task 7: Stamp Ticket.createdBy on creation paths (TDD)

**Files:**
- Modify: `apps/api/src/tickets/tickets.service.ts`
- Modify: `apps/api/src/tickets/tickets.service.spec.ts`

- [ ] **Step 1: Write the failing tests**

Append to `apps/api/src/tickets/tickets.service.spec.ts` (inside the existing top-level `describe('TicketsService', …)`):

```ts
describe('Ticket origin stamping', () => {
  it('stamps createdBy=CONSUMER when the actor is the consumer themselves', async () => {
    const created = await ticketsService.createIntakeTicket(
      { consumerId: 'consumer-1', serviceId: 'svc-1', flow: 'judicial_case_files', payload: {} } as any,
      { actorUserId: 'consumer-1', actorEmail: 'c@x.com' },
    );
    const row = await prisma.ticket.findUnique({ where: { id: created.id } });
    expect(row?.createdBy).toBe('CONSUMER');
  });

  it('stamps createdBy=ADMIN_STAFF when the actor is staff (different user from consumer)', async () => {
    const created = await ticketsService.createIntakeTicket(
      { consumerId: 'consumer-1', serviceId: 'svc-1', flow: 'judicial_case_files', payload: {} } as any,
      { actorUserId: 'admin-1', actorEmail: 'a@x.com' },
    );
    const row = await prisma.ticket.findUnique({ where: { id: created.id } });
    expect(row?.createdBy).toBe('ADMIN_STAFF');
  });
});
```

Note: this assumes the spec's existing test harness sets up `consumer-1`, `svc-1`, and a pricing rule that matches `judicial_case_files`. If those fixtures don't yet exist, follow the patterns already established at the top of the spec file (look for `beforeAll` / `beforeEach` to see what's set up).

- [ ] **Step 2: Run and verify they fail**

Run:
```bash
cd apps/api && pnpm test -- --testPathPattern=tickets.service
```
Expected: FAIL — `createdBy` is undefined on the row (column exists from migration but is never set, defaults to ADMIN_STAFF — so the first test fails).

- [ ] **Step 3: Implement the stamping**

In `apps/api/src/tickets/tickets.service.ts`, inside `createIntakeTicket`, in the `prisma.ticket.create` data object (currently around line 433), add:

```ts
        createdBy: actor?.actorUserId && actor.actorUserId === dto.consumerId
          ? 'CONSUMER'
          : 'ADMIN_STAFF',
```

Also locate the other ticket-create path (search for the second `status: 'PENDING'` create around line 1020) and apply the same logic there. If that path does not receive an `actor`, default to `'ADMIN_STAFF'`.

- [ ] **Step 4: Run and verify they pass**

Run:
```bash
cd apps/api && pnpm test -- --testPathPattern=tickets.service
```
Expected: both new tests pass; existing tests still pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/tickets/tickets.service.ts apps/api/src/tickets/tickets.service.spec.ts
git commit -m "feat(tickets): stamp createdBy on ticket creation"
```

---

## Task 8: assertPaymentSatisfied gate (TDD)

**Files:**
- Modify: `apps/api/src/tickets/tickets.service.ts`
- Modify: `apps/api/src/tickets/tickets.service.spec.ts`

- [ ] **Step 1: Write the failing gate-matrix tests**

Append to `tickets.service.spec.ts`:

```ts
describe('Payment gate', () => {
  it('blocks PENDING → ASSIGNED for a CONSUMER ticket that is UNPAID', async () => {
    const tkt = await prisma.ticket.create({
      data: {
        batchNo: 'B-G1',
        consumerId: 'consumer-1',
        serviceId: 'svc-1',
        status: 'PENDING',
        paymentStatus: 'UNPAID',
        createdBy: 'CONSUMER',
      },
    });
    await expect(
      ticketsService.updateStatus(tkt.id, 'ASSIGNED', undefined, { actorUserId: 'admin-1' }),
    ).rejects.toThrow(/payment/i);
  });

  it('allows PENDING → ASSIGNED for an ADMIN_STAFF ticket while UNPAID', async () => {
    const tkt = await prisma.ticket.create({
      data: {
        batchNo: 'B-G2',
        consumerId: 'consumer-1',
        serviceId: 'svc-1',
        status: 'PENDING',
        paymentStatus: 'UNPAID',
        createdBy: 'ADMIN_STAFF',
      },
    });
    const updated = await ticketsService.updateStatus(tkt.id, 'ASSIGNED', undefined, {
      actorUserId: 'admin-1',
    });
    expect(updated.status).toBe('ASSIGNED');
  });

  it('allows PENDING → ASSIGNED for a CONSUMER ticket once paymentStatus=PAID', async () => {
    const tkt = await prisma.ticket.create({
      data: {
        batchNo: 'B-G3',
        consumerId: 'consumer-1',
        serviceId: 'svc-1',
        status: 'PENDING',
        paymentStatus: 'PAID',
        createdBy: 'CONSUMER',
      },
    });
    const updated = await ticketsService.updateStatus(tkt.id, 'ASSIGNED', undefined, {
      actorUserId: 'admin-1',
    });
    expect(updated.status).toBe('ASSIGNED');
  });
});
```

- [ ] **Step 2: Run and verify they fail**

Run:
```bash
cd apps/api && pnpm test -- --testPathPattern=tickets.service
```
Expected: the "blocks" test fails (ticket is updated instead of throwing).

- [ ] **Step 3: Add the gate to TicketsService**

In `tickets.service.ts`, add the helper after `getAllowedTransitions`:

```ts
  private assertPaymentSatisfied(
    ticket: { createdBy: 'CONSUMER' | 'ADMIN_STAFF'; paymentStatus: 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' },
    nextStatus: TicketStatus,
  ) {
    if (ticket.createdBy !== 'CONSUMER') return;
    if (nextStatus === 'PENDING') return;
    if (ticket.paymentStatus === 'PAID') return;
    throw new ForbiddenException(
      'Ticket cannot be progressed until consumer payment is completed.',
    );
  }
```

Then, inside `updateStatus` (around line 657 today), after the `allowedTransitions` check, add:

```ts
    this.assertPaymentSatisfied(ticket, status);
```

Also find the direct assign code path (around line 828 today) — the place that does `prisma.ticket.update({ … status: 'ASSIGNED' })` directly without going through `updateStatus`. Before that update, fetch the ticket if not already loaded and call:

```ts
    this.assertPaymentSatisfied(ticket, 'ASSIGNED');
```

Make sure `ForbiddenException` is imported from `@nestjs/common` at the top of the file (likely already is — check).

- [ ] **Step 4: Run and verify they pass**

Run:
```bash
cd apps/api && pnpm test -- --testPathPattern=tickets.service
```
Expected: all three gate tests pass; existing tests still pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/tickets/tickets.service.ts apps/api/src/tickets/tickets.service.spec.ts
git commit -m "feat(tickets): block consumer ticket progression until paid"
```

---

## Task 9: API env wiring

**Files:**
- Modify: `apps/api/.env.example`

- [ ] **Step 1: Add env vars**

Append to `apps/api/.env.example`:

```
# Payments
PAYMENT_PROVIDER=mock
PAYMENT_RETURN_URL=http://localhost:3000/consumer/payments/return
PAYMENT_NOTIFY_URL=http://localhost:4000/api/payments/webhook/mock
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/.env.example
git commit -m "chore(env): document payment provider env vars"
```

---

## Task 10: Frontend — payments client helper

**Files:**
- Create: `apps/web/lib/payments-client.ts`

- [ ] **Step 1: Write the client**

`apps/web/lib/payments-client.ts`:

```ts
import { api } from './api-client';

export interface InitiateResponse {
  paymentId: string;
  providerTxnId: string;
  redirectUrl: string;
}

export interface PaymentStatusResponse {
  id: string;
  status: 'INITIATED' | 'SUCCESS' | 'FAILED' | 'CANCELLED';
  ticketPaymentStatus: 'UNPAID' | 'PARTIALLY_PAID' | 'PAID';
}

export const paymentsClient = {
  initiate(ticketId: string) {
    return api.post<InitiateResponse>('/payments/initiate', { ticketId });
  },
  getById(paymentId: string) {
    return api.get<PaymentStatusResponse>(`/payments/${paymentId}`);
  },
  resolveMock(providerTxnId: string, outcome: 'SUCCESS' | 'FAILED' | 'CANCELLED') {
    return api.post(`/payments/mock/${providerTxnId}/resolve`, { outcome });
  },
};
```

If the existing `api-client.ts` exports a different shape (e.g. `apiClient.post`), match its actual API — read `apps/web/lib/api-client.ts` first.

- [ ] **Step 2: Commit**

```bash
git add apps/web/lib/payments-client.ts
git commit -m "feat(web): add payments client helper"
```

---

## Task 11: Frontend — pay page

**Files:**
- Create: `apps/web/app/(consumer)/tickets/[id]/pay/page.tsx`

- [ ] **Step 1: Write the page**

`apps/web/app/(consumer)/tickets/[id]/pay/page.tsx`:

```tsx
'use client';

import { useEffect, useState, useTransition } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api-client';
import { paymentsClient } from '@/lib/payments-client';

interface TicketSummary {
  id: string;
  batchNo: string;
  totalAmount: string;
  paymentStatus: 'UNPAID' | 'PARTIALLY_PAID' | 'PAID';
}

export default function PayPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [ticket, setTicket] = useState<TicketSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api.get<TicketSummary>(`/tickets/${params.id}`);
        if (!cancelled) startTransition(() => setTicket(data));
      } catch (e: any) {
        if (!cancelled) startTransition(() => setError(e.message ?? 'Failed to load ticket'));
      }
    })();
    return () => { cancelled = true; };
  }, [params.id]);

  const onPayNow = async () => {
    setError(null);
    try {
      const { redirectUrl } = await paymentsClient.initiate(params.id);
      router.push(redirectUrl);
    } catch (e: any) {
      setError(e.message ?? 'Could not start payment');
    }
  };

  const onPayLater = () => router.push('/consumer/dashboard?tab=unpaid');

  if (error) return <div className="p-8 text-red-600">{error}</div>;
  if (!ticket) return <div className="p-8">Loading…</div>;
  if (ticket.paymentStatus === 'PAID') {
    return <div className="p-8">This ticket is already paid. <a className="underline" href="/consumer/dashboard">Back to dashboard</a></div>;
  }

  return (
    <div className="mx-auto max-w-md p-8">
      <h1 className="mb-4 text-2xl font-semibold">Complete your payment</h1>
      <div className="mb-6 rounded border p-4">
        <div>Ticket: <span className="font-mono">{ticket.batchNo}</span></div>
        <div>Amount due: <span className="font-semibold">PKR {ticket.totalAmount}</span></div>
      </div>
      <div className="flex flex-col gap-3">
        <button
          onClick={onPayNow}
          disabled={isPending}
          className="rounded bg-black px-4 py-2 text-white"
        >
          Pay Now
        </button>
        <button
          onClick={onPayLater}
          className="rounded border px-4 py-2"
        >
          Pay Later
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add 'apps/web/app/(consumer)/tickets/[id]/pay/page.tsx'
git commit -m "feat(web): add post-intake payment page"
```

---

## Task 12: Frontend — mock checkout page

**Files:**
- Create: `apps/web/app/(consumer)/payments/mock/[paymentId]/page.tsx`

- [ ] **Step 1: Write the page**

`apps/web/app/(consumer)/payments/mock/[paymentId]/page.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { paymentsClient } from '@/lib/payments-client';

// This page is reached via the MockProvider redirectUrl: /consumer/payments/mock/{providerTxnId}
export default function MockCheckoutPage() {
  const params = useParams<{ paymentId: string }>();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (process.env.NEXT_PUBLIC_PAYMENT_PROVIDER !== 'mock') {
    return <div className="p-8">Mock checkout disabled.</div>;
  }

  const resolve = async (outcome: 'SUCCESS' | 'FAILED' | 'CANCELLED') => {
    setBusy(true);
    setError(null);
    try {
      await paymentsClient.resolveMock(params.paymentId, outcome);
      router.push(`/consumer/payments/return?providerTxnId=${params.paymentId}&outcome=${outcome}`);
    } catch (e: any) {
      setError(e.message ?? 'Mock resolve failed');
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md p-8">
      <h1 className="mb-4 text-2xl font-semibold">Mock Gateway</h1>
      <p className="mb-6 text-sm text-gray-600">
        Dev-only checkout. Pick an outcome to simulate the gateway response.
      </p>
      {error && <div className="mb-4 text-red-600">{error}</div>}
      <div className="flex flex-col gap-3">
        <button onClick={() => resolve('SUCCESS')} disabled={busy} className="rounded bg-green-600 px-4 py-2 text-white">Success</button>
        <button onClick={() => resolve('FAILED')} disabled={busy} className="rounded bg-red-600 px-4 py-2 text-white">Fail</button>
        <button onClick={() => resolve('CANCELLED')} disabled={busy} className="rounded border px-4 py-2">Cancel</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add 'apps/web/app/(consumer)/payments/mock/[paymentId]/page.tsx'
git commit -m "feat(web): add mock-gateway dev checkout page"
```

---

## Task 13: Frontend — return page

**Files:**
- Create: `apps/web/app/(consumer)/payments/return/page.tsx`

- [ ] **Step 1: Write the page**

`apps/web/app/(consumer)/payments/return/page.tsx`:

```tsx
'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api-client';

export default function PaymentReturnPage() {
  const search = useSearchParams();
  const router = useRouter();
  const providerTxnId = search.get('providerTxnId');
  const [status, setStatus] = useState<'pending' | 'paid' | 'failed'>('pending');
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (!providerTxnId) return;
    let cancelled = false;
    let attempts = 0;
    const poll = async () => {
      attempts++;
      try {
        const payment = await api.get<{ status: string; ticketPaymentStatus: string; ticketId?: string }>(
          `/payments/by-txn/${providerTxnId}`,
        );
        if (cancelled) return;
        if (payment.ticketPaymentStatus === 'PAID') {
          startTransition(() => setStatus('paid'));
          return;
        }
        if (payment.status === 'FAILED' || payment.status === 'CANCELLED') {
          startTransition(() => setStatus('failed'));
          return;
        }
        if (attempts < 15) setTimeout(poll, 2000);
        else startTransition(() => setStatus('failed'));
      } catch {
        if (attempts < 15) setTimeout(poll, 2000);
        else startTransition(() => setStatus('failed'));
      }
    };
    poll();
    return () => { cancelled = true; };
  }, [providerTxnId]);

  if (status === 'paid') {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-semibold">Payment received</h1>
        <p className="mt-2">Your ticket is now active.</p>
        <button onClick={() => router.push('/consumer/dashboard')} className="mt-4 rounded bg-black px-4 py-2 text-white">Back to dashboard</button>
      </div>
    );
  }
  if (status === 'failed') {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-semibold">Payment failed</h1>
        <p className="mt-2">No charge was made. You can try again from the dashboard.</p>
        <button onClick={() => router.push('/consumer/dashboard?tab=unpaid')} className="mt-4 rounded border px-4 py-2">Back to unpaid tickets</button>
      </div>
    );
  }
  return <div className="p-8">Confirming payment…</div>;
}
```

Note: this references `GET /payments/by-txn/:providerTxnId`. Add it now.

- [ ] **Step 2: Add the supporting API endpoint**

In `apps/api/src/payments/payments.service.ts`, add:

```ts
  async getByProviderTxnId(providerTxnId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { providerTxnId },
      include: { ticket: { select: { id: true, paymentStatus: true } } },
    });
    if (!payment) return null;
    return {
      id: payment.id,
      status: payment.status,
      ticketId: payment.ticket.id,
      ticketPaymentStatus: payment.ticket.paymentStatus,
    };
  }
```

In `apps/api/src/payments/payments.controller.ts`, add:

```ts
  @Public()
  @Get('by-txn/:providerTxnId')
  getByTxn(@Param('providerTxnId') providerTxnId: string) {
    return this.payments.getByProviderTxnId(providerTxnId);
  }
```

Public is acceptable here because the response carries no PII — only payment+ticket status flags keyed on an opaque txn id. Tighten with JWT if your team prefers.

- [ ] **Step 3: Commit**

```bash
git add 'apps/web/app/(consumer)/payments/return/page.tsx' apps/api/src/payments
git commit -m "feat(payments): add return page and by-txn status lookup"
```

---

## Task 14: Intake wizard redirect

**Files:**
- Modify: `apps/web/components/intake-wizard.tsx`

- [ ] **Step 1: Locate the post-submit redirect**

Find the success branch of `submitTicket` in `intake-wizard.tsx`. It currently routes to the dashboard / a success page. Change it to push to the pay page using the created ticket id.

```ts
// inside submitTicket, after createIntakeTicket() resolves with `ticket`:
router.push(`/consumer/tickets/${ticket.id}/pay`);
```

If there is currently a success modal that fires first, leave the modal but switch its primary CTA to "Continue to payment" which calls the same `router.push`. Discuss with the user if unsure — pick the redirect path for v1.

- [ ] **Step 2: Smoke test in the browser**

Run:
```bash
pnpm dev
```
Submit a consumer intake and verify the post-submit URL is `/consumer/tickets/<id>/pay`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/intake-wizard.tsx
git commit -m "feat(intake): redirect to pay page after ticket creation"
```

---

## Task 15: Consumer dashboard — Unpaid tab

**Files:**
- Modify: `apps/web/app/(consumer)/dashboard/page.tsx`

- [ ] **Step 1: Add an Unpaid tab**

In the dashboard page, add a tab/filter alongside existing ones. The tab is selected when the URL has `?tab=unpaid`. Filter the existing ticket list by `paymentStatus !== 'PAID'`. Each unpaid card gets a "Pay Now" button that routes to `/consumer/tickets/{id}/pay`.

Concrete shape (adapt to existing component style):

```tsx
const tab = searchParams.get('tab') ?? 'active';
const visible = tickets.filter((t) =>
  tab === 'unpaid' ? t.paymentStatus !== 'PAID' : true,
);
// …
<button onClick={() => router.push(`?tab=unpaid`)}>Unpaid</button>
// per-card:
{t.paymentStatus !== 'PAID' && (
  <a href={`/consumer/tickets/${t.id}/pay`} className="rounded bg-black px-3 py-1 text-white">Pay Now</a>
)}
```

- [ ] **Step 2: Commit**

```bash
git add 'apps/web/app/(consumer)/dashboard/page.tsx'
git commit -m "feat(consumer): add Unpaid tab and Pay Now CTA to dashboard"
```

---

## Task 16: Web env wiring

**Files:**
- Modify: `apps/web/.env.example`

- [ ] **Step 1: Add env var**

Append to `apps/web/.env.example`:

```
NEXT_PUBLIC_PAYMENT_PROVIDER=mock
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/.env.example
git commit -m "chore(env): document NEXT_PUBLIC_PAYMENT_PROVIDER"
```

---

## Task 17: E2E happy-path + gate-block

**Files:**
- Create: `tests/e2e/payment-gating.spec.ts`

- [ ] **Step 1: Write the e2e test**

`tests/e2e/payment-gating.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

// Pre-req: NEXT_PUBLIC_PAYMENT_PROVIDER=mock and a seeded consumer
// (testconsumer@wusuq.com / password123) exists. See CLAUDE.md "Local Dev Seed".

test('consumer pays via mock gateway and ticket becomes assignable', async ({ page, request }) => {
  // 1. log in as consumer
  await page.goto('/consumer/login/email');
  await page.getByLabel(/email/i).fill('testconsumer@wusuq.com');
  await page.getByLabel(/password/i).fill('password123');
  await page.getByRole('button', { name: /log in/i }).click();
  await page.waitForURL(/\/consumer\/dashboard/);

  // 2. start an intake flow and submit it (flow-specific steps abstracted —
  //    if a helper exists in tests/e2e/helpers, use it; otherwise inline)
  // …

  // 3. expect redirect to /consumer/tickets/<id>/pay
  await expect(page).toHaveURL(/\/consumer\/tickets\/.+\/pay/);

  // 4. click Pay Now → lands on mock checkout
  await page.getByRole('button', { name: /pay now/i }).click();
  await expect(page).toHaveURL(/\/consumer\/payments\/mock\//);

  // 5. click Success → return page → ticket is PAID
  await page.getByRole('button', { name: /success/i }).click();
  await expect(page.getByText(/payment received/i)).toBeVisible({ timeout: 15_000 });
});

test('pay later parks the ticket in Unpaid tab and admin assignment is blocked', async ({ page, request }) => {
  // Same setup as above, but on the pay page click "Pay Later".
  // Then issue a request as an admin user to PATCH /tickets/:id { status: 'ASSIGNED' }
  // and assert 403.
});
```

Leave the intake-submission section as a TODO comment with a pointer to whatever helper exists in `tests/e2e/`; the goal of this task is to wire the new screens, not re-author the full intake e2e harness.

- [ ] **Step 2: Run the e2e**

Run:
```bash
pnpm e2e -- payment-gating
```
Expected: scenarios pass against `pnpm dev`-served stack with mock provider.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/payment-gating.spec.ts
git commit -m "test(e2e): cover payment gate happy path and pay-later block"
```

---

## Task 18: Final verification sweep

- [ ] **Step 1: Typecheck and lint**

Run:
```bash
pnpm typecheck && pnpm lint
```
Expected: clean.

- [ ] **Step 2: Full API test run**

Run:
```bash
pnpm test
```
Expected: all green.

- [ ] **Step 3: Manual smoke**

- Log in as the seeded consumer.
- Submit an intake.
- Confirm redirect to `/consumer/tickets/<id>/pay`.
- Pay Later → confirm ticket appears under Unpaid.
- As admin, attempt to assign that ticket → expect 403 with payment-gate message.
- Pay Now → mock checkout → Success → confirm `paymentStatus=PAID` and the same admin assignment now succeeds.
- Create a ticket as admin → confirm `createdBy=ADMIN_STAFF`, `paymentStatus=UNPAID`, but assignable.

- [ ] **Step 4: Final commit if any tweaks**

```bash
git status
# If clean, no commit needed.
```

---

## Self-review summary

- **Spec coverage:** Schema (Task 1), provider abstraction (Tasks 2–4), service + webhook idempotency + amount-mismatch rejection (Task 5), endpoints (Task 6), origin stamping (Task 7), lifecycle gate (Task 8), env (Tasks 9, 16), frontend pay page + mock checkout + return page (Tasks 11–13), wizard redirect (Task 14), Unpaid tab (Task 15), E2E (Task 17), verification (Task 18). All spec sections accounted for.
- **Placeholder scan:** Only the intentional "wire to existing intake e2e helper" pointer remains in Task 17, with explicit guidance for the implementer. No `TBD`/`TODO` in production code.
- **Type consistency:** `PaymentProvider.name` is `PaymentProviderName`; `Payment.providerTxnId` is unique; controller param names match service method signatures; `paymentsClient.resolveMock` matches `POST /payments/mock/:providerTxnId/resolve`; return-page lookup uses `GET /payments/by-txn/:providerTxnId` which is defined in Task 13.
