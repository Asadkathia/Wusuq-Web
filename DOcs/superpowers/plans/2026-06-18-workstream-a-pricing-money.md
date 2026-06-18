# Workstream A — Pricing & Money — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add configurable percentage tax, consumer promo/coupon codes, a staff "edit ticket → re-price" flow, and a persisted price-breakdown snapshot — all routed through one canonical money function so the quote and the charge can never drift.

**Architecture:** A single pure function `computeTicketTotal()` in `@wusuq/shared` owns the calculation order (`subtotal → − discount → − promo → taxable base → + tax → total`). Every server site that computes `totalAmount` (intake, finance charge edit, finalize, re-price) and the wizard's live checkout preview call it. Tax rate is read from a DB-backed `AppSetting` (env fallback) and **stamped** onto each ticket so historical tickets keep their rate. Promo codes are a new `PromoCode`/`PromoRedemption` pair validated server-side and redeemed inside the ticket-creation transaction.

**Tech Stack:** NestJS 11 + Prisma (Postgres), Next.js 16, TypeScript monorepo (`packages/shared` built before `apps/api` before `apps/web`), Jest (API unit tests with hand-rolled Prisma mocks), Playwright (E2E).

## Global Constraints

- Monorepo build order is **`shared → api → web`**. After editing `packages/shared`, run `pnpm --filter @wusuq/shared build` before the API typechecks against it.
- **`computeTicketTotal()` is the ONLY place tax/discount/promo math lives.** Never re-implement the formula at a call site (this mirrors the existing `buildPricingResolveInput` single-source rule).
- **`buildPricingResolveInput(flow, payload)` is the ONLY resolver-input builder.** Re-price and intake both use it; never hand-extract resolve fields.
- **Never read-then-write `Ticket.status`.** Status transitions stay conditional `updateMany({ where: { id, status: expectedFrom } })` with the history row in the same `$transaction`; `count === 0` → `ConflictException`. (Re-price does **not** change status.)
- **Lock order:** when a write can credit the wallet, take the USER row lock **before** the ticket row lock (same order as `finalizeRemainderCore` and wallet settlement) to avoid deadlock.
- **Money is PKR, 2 decimals.** All persisted money values pass through `round2`.
- Consumer redaction is unchanged by this workstream; do not expose `clerkCost`/`clerkReport`/`dispatchProofUrl`/rep phone.
- API unit tests use plain Jest with manual Prisma mock objects passed as `new Service(prismaMock as never, ...)` — **no `Test.createTestingModule`** for these service specs (match `pricing-resolve.spec.ts` / `finance.service.spec.ts`).
- New permissions added to `PERMISSIONS` in `@wusuq/shared` are automatically granted to `super-admin` (it maps to the full `PERMISSIONS` array); grant to other roles explicitly.

---

### Task 1: Canonical money math + shared constants

**Files:**
- Modify: `packages/shared/src/index.ts` (add money types/function near the pricing helpers; add permissions to the `PERMISSIONS` array at `:59-85` and `ROLE_PERMISSIONS` at `:89-144`)
- Test: `apps/api/src/pricing/ticket-money.spec.ts` (new; runs under the API Jest project, where `@wusuq/shared` is already importable)

**Interfaces:**
- Produces:
  - `round2(n: number): number`
  - `type PromoType = 'PERCENT' | 'FIXED'`
  - `interface TicketChargeComponents { serviceCost: number; deliveryCharges: number; printingCharges: number; attestedCharges: number; nonAttestedCharges: number; additionalCharges: number; additionalServiceCost: number; }`
  - `interface TicketMoneyInput { charges: TicketChargeComponents; discountPrice?: number; promoDiscount?: number; taxRate?: number; }`
  - `interface TicketMoneyResult { chargesSubtotal: number; discountTotal: number; taxableBase: number; taxAmount: number; totalAmount: number; }`
  - `computeTicketTotal(input: TicketMoneyInput): TicketMoneyResult`
  - Permission strings `'promos.write'`, `'settings.read'`, `'settings.write'`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/pricing/ticket-money.spec.ts`:

```ts
import { computeTicketTotal, round2 } from '@wusuq/shared';

const ZERO = {
  serviceCost: 0,
  deliveryCharges: 0,
  printingCharges: 0,
  attestedCharges: 0,
  nonAttestedCharges: 0,
  additionalCharges: 0,
  additionalServiceCost: 0,
};

describe('computeTicketTotal', () => {
  it('sums charges with no discount/tax', () => {
    const r = computeTicketTotal({ charges: { ...ZERO, serviceCost: 3000 } });
    expect(r.chargesSubtotal).toBe(3000);
    expect(r.taxableBase).toBe(3000);
    expect(r.taxAmount).toBe(0);
    expect(r.totalAmount).toBe(3000);
  });

  it('applies staff discount and promo before tax', () => {
    const r = computeTicketTotal({
      charges: { ...ZERO, serviceCost: 10000 },
      discountPrice: 1000,
      promoDiscount: 1000,
      taxRate: 0.17,
    });
    expect(r.discountTotal).toBe(2000);
    expect(r.taxableBase).toBe(8000);
    expect(r.taxAmount).toBe(1360); // 8000 * 0.17
    expect(r.totalAmount).toBe(9360);
  });

  it('never lets discounts push the taxable base below zero', () => {
    const r = computeTicketTotal({
      charges: { ...ZERO, serviceCost: 500 },
      discountPrice: 9999,
      taxRate: 0.17,
    });
    expect(r.taxableBase).toBe(0);
    expect(r.taxAmount).toBe(0);
    expect(r.totalAmount).toBe(0);
  });

  it('rounds tax to 2 decimals', () => {
    const r = computeTicketTotal({
      charges: { ...ZERO, serviceCost: 333 },
      taxRate: 0.17,
    });
    expect(r.taxAmount).toBe(56.61); // round2(56.61)
    expect(round2(56.61)).toBe(56.61);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && pnpm test -- --testPathPattern=ticket-money`
Expected: FAIL — `computeTicketTotal`/`round2` not exported from `@wusuq/shared`.

- [ ] **Step 3: Add the money math to `packages/shared/src/index.ts`**

Add near the other pricing helpers (e.g. just above `buildPricingResolveInput` at `:695`):

```ts
/** Round to 2 decimals (PKR). Avoids binary-float drift on persisted money. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export type PromoType = 'PERCENT' | 'FIXED';

export interface TicketChargeComponents {
  serviceCost: number;
  deliveryCharges: number;
  printingCharges: number;
  attestedCharges: number;
  nonAttestedCharges: number;
  additionalCharges: number;
  additionalServiceCost: number;
}

export interface TicketMoneyInput {
  charges: TicketChargeComponents;
  /** Staff-applied discount (Ticket.discountPrice). */
  discountPrice?: number;
  /** Promo-code discount (Ticket.promoDiscount). */
  promoDiscount?: number;
  /** Tax rate as a fraction (e.g. 0.17). 0 / undefined = no tax. */
  taxRate?: number;
}

export interface TicketMoneyResult {
  chargesSubtotal: number;
  discountTotal: number;
  taxableBase: number;
  taxAmount: number;
  totalAmount: number;
}

/**
 * THE single source for a ticket's total. Order: sum charges → subtract staff
 * discount + promo → tax the remainder → add tax. Every server site that writes
 * Ticket.totalAmount (createIntakeTicket, finance.updateCharge,
 * finalizeRemainderCore, reprice) and the wizard's checkout preview call this,
 * so the quote and the charge cannot drift.
 */
export function computeTicketTotal(input: TicketMoneyInput): TicketMoneyResult {
  const c = input.charges;
  const chargesSubtotal = round2(
    c.serviceCost +
      c.deliveryCharges +
      c.printingCharges +
      c.attestedCharges +
      c.nonAttestedCharges +
      c.additionalCharges +
      c.additionalServiceCost,
  );
  const discountTotal = round2((input.discountPrice ?? 0) + (input.promoDiscount ?? 0));
  const taxableBase = Math.max(0, round2(chargesSubtotal - discountTotal));
  const taxAmount = round2(taxableBase * (input.taxRate ?? 0));
  const totalAmount = round2(taxableBase + taxAmount);
  return { chargesSubtotal, discountTotal, taxableBase, taxAmount, totalAmount };
}
```

- [ ] **Step 4: Add the new permissions**

In the `PERMISSIONS` array (`:59-85`), add after `'audit.read',`:

```ts
  'settings.read',
  'settings.write',
  'promos.write',
```

In `ROLE_PERMISSIONS`, grant the admin tiers. Add `'settings.read'`, `'settings.write'`, `'promos.write'` to `'manager-admin'` and `'staff-admin'`, and `'settings.read'` to `'lead-admin'`. (`'super-admin'` already maps to the full `PERMISSIONS` array — no edit needed.)

- [ ] **Step 5: Build shared, run test to verify it passes**

Run: `pnpm --filter @wusuq/shared build && cd apps/api && pnpm test -- --testPathPattern=ticket-money`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/index.ts apps/api/src/pricing/ticket-money.spec.ts
git commit -m "feat(shared): canonical computeTicketTotal + tax/promo/settings permissions"
```

---

### Task 2: Schema — promo, app settings, ticket money fields

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (add 3 models + 1 enum; add fields to `Ticket` at `:203-279`)
- Generated: a new migration under `apps/api/prisma/migrations/`

**Interfaces:**
- Produces (Prisma client types): `PromoCode`, `PromoRedemption`, `AppSetting`, enum `PromoType`; `Ticket.taxRate`, `Ticket.taxAmount`, `Ticket.promoCodeId`, `Ticket.promoDiscount`, `Ticket.priceBreakdown`.

- [ ] **Step 1: Add the enum and models to `schema.prisma`**

Add near the other enums:

```prisma
enum PromoType {
  PERCENT
  FIXED
}
```

Add three new models (place after the `TicketClerkReport` model, `:297`):

```prisma
model AppSetting {
  key             String   @id
  value           String
  updatedByUserId String?
  updatedAt       DateTime @updatedAt
}

model PromoCode {
  id              String   @id @default(cuid())
  code            String   @unique
  type            PromoType
  value           Decimal
  maxDiscount     Decimal?
  startsAt        DateTime?
  endsAt          DateTime?
  totalUsageLimit Int?
  perUserLimit    Int?
  serviceScope    String[]
  active          Boolean  @default(true)
  createdByUserId String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  redemptions     PromoRedemption[]

  @@index([active])
}

model PromoRedemption {
  id          String    @id @default(cuid())
  promoCodeId String
  userId      String
  ticketId    String
  amount      Decimal
  createdAt   DateTime  @default(now())
  promoCode   PromoCode @relation(fields: [promoCodeId], references: [id])

  @@unique([promoCodeId, ticketId])
  @@index([promoCodeId, userId])
}
```

- [ ] **Step 2: Add money fields to the `Ticket` model**

In `model Ticket` add after `discountPrice` (`:218`):

```prisma
  promoCodeId           String?
  promoDiscount         Decimal             @default(0)
  taxRate               Decimal             @default(0)
  taxAmount             Decimal             @default(0)
  // Structured price-breakdown snapshot (resolver lines + discount/promo/tax),
  // written at intake, reprice, and finalize. Powers invoices/audit; flat
  // columns remain the source of truth for math.
  priceBreakdown        Json?
```

- [ ] **Step 3: Create the migration**

Run: `cd apps/api && pnpm prisma:migrate:dev -- --name add_tax_promo_money_fields`
Expected: a new migration folder; `prisma generate` runs automatically. All fields are nullable/defaulted, so the migration is additive and safe.

- [ ] **Step 4: Verify the client compiles**

Run: `cd apps/api && pnpm typecheck`
Expected: PASS (the new models/fields exist on the Prisma client).

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(db): PromoCode/PromoRedemption/AppSetting + ticket tax/promo/breakdown fields"
```

---

### Task 3: Tax settings module (rate source of truth)

**Files:**
- Create: `apps/api/src/settings/settings.service.ts`
- Create: `apps/api/src/settings/settings.controller.ts`
- Create: `apps/api/src/settings/settings.module.ts`
- Create: `apps/api/src/settings/dto/update-tax.dto.ts`
- Modify: `apps/api/src/app.module.ts` (register `SettingsModule`)
- Test: `apps/api/src/settings/settings.service.spec.ts`

**Interfaces:**
- Consumes: `PrismaService`, `round2` (from `@wusuq/shared`).
- Produces:
  - `SettingsService.getTaxRate(): Promise<number>` — reads `AppSetting` key `tax.rate`; falls back to `Number(process.env.TAX_RATE)` then `0`. Clamped to `[0, 1]`.
  - `SettingsService.getTaxConfig(): Promise<{ rate: number; enabled: boolean }>`
  - `SettingsService.setTaxConfig(rate: number, enabled: boolean, actorUserId?: string): Promise<{ rate: number; enabled: boolean }>`
  - `GET /settings/tax` (perm `settings.read`), `PUT /settings/tax` (perm `settings.write`).

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/settings/settings.service.spec.ts`:

```ts
import { SettingsService } from './settings.service';

function build(rows: Record<string, string> = {}) {
  const store: Record<string, string> = { ...rows };
  const prisma = {
    appSetting: {
      findUnique: jest.fn(async ({ where }: { where: { key: string } }) =>
        store[where.key] != null ? { key: where.key, value: store[where.key] } : null,
      ),
      upsert: jest.fn(async ({ where, create, update }: any) => {
        store[where.key] = (update.value ?? create.value) as string;
        return { key: where.key, value: store[where.key] };
      }),
    },
  };
  return { service: new SettingsService(prisma as never), store };
}

describe('SettingsService tax config', () => {
  const OLD = process.env.TAX_RATE;
  afterEach(() => {
    process.env.TAX_RATE = OLD;
  });

  it('falls back to 0 when unset and no env', async () => {
    delete process.env.TAX_RATE;
    const { service } = build();
    expect(await service.getTaxRate()).toBe(0);
  });

  it('uses the env fallback when no DB row', async () => {
    process.env.TAX_RATE = '0.17';
    const { service } = build();
    expect(await service.getTaxRate()).toBe(0.17);
  });

  it('prefers the DB row over env and clamps to [0,1]', async () => {
    process.env.TAX_RATE = '0.17';
    const { service } = build({ 'tax.rate': '0.05' });
    expect(await service.getTaxRate()).toBe(0.05);
  });

  it('persists rate + enabled via setTaxConfig', async () => {
    const { service } = build();
    await service.setTaxConfig(0.13, true, 'admin-1');
    expect(await service.getTaxConfig()).toEqual({ rate: 0.13, enabled: true });
  });

  it('returns rate 0 effectively when disabled', async () => {
    const { service } = build({ 'tax.rate': '0.17', 'tax.enabled': 'false' });
    expect(await service.getTaxRate()).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && pnpm test -- --testPathPattern=settings.service`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the service**

Create `apps/api/src/settings/settings.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const TAX_RATE_KEY = 'tax.rate';
const TAX_ENABLED_KEY = 'tax.enabled';

function clampRate(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0;
  return n > 1 ? 1 : n;
}

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  private async readKey(key: string): Promise<string | null> {
    const row = await this.prisma.appSetting.findUnique({ where: { key } });
    return row?.value ?? null;
  }

  async getTaxConfig(): Promise<{ rate: number; enabled: boolean }> {
    const rawRate = await this.readKey(TAX_RATE_KEY);
    const rawEnabled = await this.readKey(TAX_ENABLED_KEY);
    const rate = clampRate(
      Number(rawRate ?? process.env.TAX_RATE ?? '0'),
    );
    // Default enabled = true once a rate exists; explicit 'false' disables.
    const enabled = rawEnabled != null ? rawEnabled === 'true' : true;
    return { rate, enabled };
  }

  /** Effective rate used by pricing: 0 when disabled. */
  async getTaxRate(): Promise<number> {
    const { rate, enabled } = await this.getTaxConfig();
    return enabled ? rate : 0;
  }

  async setTaxConfig(
    rate: number,
    enabled: boolean,
    actorUserId?: string,
  ): Promise<{ rate: number; enabled: boolean }> {
    const clamped = clampRate(rate);
    await this.prisma.appSetting.upsert({
      where: { key: TAX_RATE_KEY },
      create: { key: TAX_RATE_KEY, value: String(clamped), updatedByUserId: actorUserId },
      update: { value: String(clamped), updatedByUserId: actorUserId },
    });
    await this.prisma.appSetting.upsert({
      where: { key: TAX_ENABLED_KEY },
      create: { key: TAX_ENABLED_KEY, value: String(enabled), updatedByUserId: actorUserId },
      update: { value: String(enabled), updatedByUserId: actorUserId },
    });
    return { rate: clamped, enabled };
  }
}
```

- [ ] **Step 4: DTO, controller, module**

Create `apps/api/src/settings/dto/update-tax.dto.ts`:

```ts
import { Transform } from 'class-transformer';
import { IsBoolean, IsNumber, Max, Min } from 'class-validator';

export class UpdateTaxDto {
  @Transform(({ value }) => Number(value))
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  @Max(1)
  rate!: number;

  @IsBoolean()
  enabled!: boolean;
}
```

Create `apps/api/src/settings/settings.controller.ts`:

```ts
import { Body, Controller, Get, Put, Req } from '@nestjs/common';
import type { Request } from 'express';
import { RequirePermissions } from '../auth/permissions.decorator';
import { SettingsService } from './settings.service';
import { UpdateTaxDto } from './dto/update-tax.dto';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get('tax')
  @RequirePermissions('settings.read')
  getTax() {
    return this.settings.getTaxConfig();
  }

  @Put('tax')
  @RequirePermissions('settings.write')
  setTax(@Body() dto: UpdateTaxDto, @Req() req: Request) {
    const userId = (req.user as { userId?: string } | undefined)?.userId;
    return this.settings.setTaxConfig(dto.rate, dto.enabled, userId);
  }
}
```

> Verify the decorator import path + the `req.user` shape against an existing controller (e.g. `apps/api/src/finance/finance.controller.ts`) and match it exactly — use the same `@RequirePermissions(...)` decorator name the codebase already uses.

Create `apps/api/src/settings/settings.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SettingsService } from './settings.service';
import { SettingsController } from './settings.controller';

@Module({
  imports: [PrismaModule],
  controllers: [SettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
```

Register `SettingsModule` in `apps/api/src/app.module.ts` `imports`.

- [ ] **Step 5: Run test + typecheck to verify pass**

Run: `cd apps/api && pnpm test -- --testPathPattern=settings.service && pnpm typecheck`
Expected: PASS (5 tests; typecheck clean).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/settings apps/api/src/app.module.ts
git commit -m "feat(api): SettingsModule with DB-backed tax rate (env fallback)"
```

---

### Task 4: Promo code service + admin CRUD + validate endpoint

**Files:**
- Create: `apps/api/src/promos/promos.service.ts`
- Create: `apps/api/src/promos/promos.controller.ts`
- Create: `apps/api/src/promos/promos.module.ts`
- Create: `apps/api/src/promos/dto/create-promo.dto.ts`, `apps/api/src/promos/dto/validate-promo.dto.ts`
- Modify: `apps/api/src/app.module.ts` (register `PromosModule`)
- Test: `apps/api/src/promos/promos.service.spec.ts`

**Interfaces:**
- Consumes: `PrismaService`, `round2`, `PromoType` (from `@wusuq/shared`).
- Produces:
  - `PromosService.validate(args: { code: string; userId: string; flow: string; subtotal: number; tx?: Prisma.TransactionClient }): Promise<{ valid: boolean; reason?: string; discount: number; promoCodeId?: string }>`
  - `PromosService.create(dto: CreatePromoDto, actorUserId?: string)`, `list()`, `deactivate(id: string)`
  - `POST /promos/validate` (perm `tickets.create`), `GET /promos` + `POST /promos` + `POST /promos/:id/deactivate` (perm `promos.write`).
- Used by: Task 5 (`createIntakeTicket` calls `validate` with the txn client and writes the `PromoRedemption`).

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/promos/promos.service.spec.ts`:

```ts
import { PromosService } from './promos.service';

const BASE = {
  id: 'promo-1',
  code: 'SAVE10',
  type: 'PERCENT',
  value: 10,
  maxDiscount: 2000,
  startsAt: null,
  endsAt: null,
  totalUsageLimit: null,
  perUserLimit: 1,
  serviceScope: [],
  active: true,
};

function build(promo: any, redemptionCounts = { total: 0, user: 0 }) {
  const prisma = {
    promoCode: {
      findUnique: jest.fn(async () => promo),
    },
    promoRedemption: {
      count: jest.fn(async ({ where }: any) =>
        where.userId ? redemptionCounts.user : redemptionCounts.total,
      ),
    },
  };
  return new PromosService(prisma as never);
}

describe('PromosService.validate', () => {
  it('returns the capped percentage discount', async () => {
    const svc = build(BASE);
    const r = await svc.validate({ code: 'save10', userId: 'u1', flow: 'judicial_case_files', subtotal: 100000 });
    expect(r.valid).toBe(true);
    expect(r.discount).toBe(2000); // 10% of 100000 = 10000, capped at 2000
    expect(r.promoCodeId).toBe('promo-1');
  });

  it('returns a fixed discount not exceeding the subtotal', async () => {
    const svc = build({ ...BASE, type: 'FIXED', value: 5000, maxDiscount: null });
    const r = await svc.validate({ code: 'SAVE10', userId: 'u1', flow: 'x', subtotal: 3000 });
    expect(r.discount).toBe(3000);
  });

  it('rejects an unknown code', async () => {
    const svc = build(null);
    const r = await svc.validate({ code: 'NOPE', userId: 'u1', flow: 'x', subtotal: 1000 });
    expect(r.valid).toBe(false);
    expect(r.discount).toBe(0);
  });

  it('rejects an inactive code', async () => {
    const svc = build({ ...BASE, active: false });
    const r = await svc.validate({ code: 'SAVE10', userId: 'u1', flow: 'x', subtotal: 1000 });
    expect(r.valid).toBe(false);
  });

  it('rejects a code outside its service scope', async () => {
    const svc = build({ ...BASE, serviceScope: ['judicial_case_search'] });
    const r = await svc.validate({ code: 'SAVE10', userId: 'u1', flow: 'judicial_case_files', subtotal: 1000 });
    expect(r.valid).toBe(false);
  });

  it('rejects when the per-user limit is reached', async () => {
    const svc = build(BASE, { total: 5, user: 1 }); // perUserLimit = 1
    const r = await svc.validate({ code: 'SAVE10', userId: 'u1', flow: 'x', subtotal: 1000 });
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/limit/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && pnpm test -- --testPathPattern=promos.service`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `PromosService`**

Create `apps/api/src/promos/promos.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { round2 } from '@wusuq/shared';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePromoDto } from './dto/create-promo.dto';

export interface PromoValidation {
  valid: boolean;
  reason?: string;
  discount: number;
  promoCodeId?: string;
}

@Injectable()
export class PromosService {
  constructor(private readonly prisma: PrismaService) {}

  async validate(args: {
    code: string;
    userId: string;
    flow: string;
    subtotal: number;
    tx?: Prisma.TransactionClient;
  }): Promise<PromoValidation> {
    const db = args.tx ?? this.prisma;
    const code = args.code.trim().toUpperCase();
    const promo = await db.promoCode.findUnique({ where: { code } });
    if (!promo || !promo.active) {
      return { valid: false, reason: 'Invalid or inactive code', discount: 0 };
    }
    const now = new Date();
    if (promo.startsAt && now < promo.startsAt) {
      return { valid: false, reason: 'Code not yet active', discount: 0 };
    }
    if (promo.endsAt && now > promo.endsAt) {
      return { valid: false, reason: 'Code has expired', discount: 0 };
    }
    if (promo.serviceScope.length > 0 && !promo.serviceScope.includes(args.flow)) {
      return { valid: false, reason: 'Code not valid for this service', discount: 0 };
    }
    if (promo.totalUsageLimit != null) {
      const total = await db.promoRedemption.count({ where: { promoCodeId: promo.id } });
      if (total >= promo.totalUsageLimit) {
        return { valid: false, reason: 'Code usage limit reached', discount: 0 };
      }
    }
    if (promo.perUserLimit != null) {
      const mine = await db.promoRedemption.count({
        where: { promoCodeId: promo.id, userId: args.userId },
      });
      if (mine >= promo.perUserLimit) {
        return { valid: false, reason: 'Per-user limit reached', discount: 0 };
      }
    }

    const subtotal = Math.max(0, args.subtotal);
    let discount: number;
    if (promo.type === 'PERCENT') {
      discount = round2((subtotal * Number(promo.value)) / 100);
      if (promo.maxDiscount != null) {
        discount = Math.min(discount, Number(promo.maxDiscount));
      }
    } else {
      discount = Number(promo.value);
    }
    discount = round2(Math.min(discount, subtotal));
    return { valid: true, discount, promoCodeId: promo.id };
  }

  create(dto: CreatePromoDto, actorUserId?: string) {
    return this.prisma.promoCode.create({
      data: {
        code: dto.code.trim().toUpperCase(),
        type: dto.type,
        value: dto.value,
        maxDiscount: dto.maxDiscount ?? null,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
        totalUsageLimit: dto.totalUsageLimit ?? null,
        perUserLimit: dto.perUserLimit ?? null,
        serviceScope: dto.serviceScope ?? [],
        createdByUserId: actorUserId,
      },
    });
  }

  list() {
    return this.prisma.promoCode.findMany({ orderBy: { createdAt: 'desc' } });
  }

  deactivate(id: string) {
    return this.prisma.promoCode.update({ where: { id }, data: { active: false } });
  }
}
```

- [ ] **Step 4: DTOs, controller, module**

Create `apps/api/src/promos/dto/create-promo.dto.ts`:

```ts
import { Type } from 'class-transformer';
import {
  ArrayUnique, IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsOptional,
  IsString, Min, MaxLength,
} from 'class-validator';

export class CreatePromoDto {
  @IsString() @MaxLength(32)
  code!: string;

  @IsIn(['PERCENT', 'FIXED'])
  type!: 'PERCENT' | 'FIXED';

  @IsNumber() @Min(0)
  value!: number;

  @IsOptional() @IsNumber() @Min(0)
  maxDiscount?: number;

  @IsOptional() @IsString()
  startsAt?: string;

  @IsOptional() @IsString()
  endsAt?: string;

  @IsOptional() @IsInt() @Min(1)
  totalUsageLimit?: number;

  @IsOptional() @IsInt() @Min(1)
  perUserLimit?: number;

  @IsOptional() @IsArray() @ArrayUnique() @IsString({ each: true })
  serviceScope?: string[];
}
```

Create `apps/api/src/promos/dto/validate-promo.dto.ts`:

```ts
import { Transform } from 'class-transformer';
import { IsNumber, IsString, Min } from 'class-validator';

export class ValidatePromoDto {
  @IsString()
  code!: string;

  @IsString()
  flow!: string;

  @Transform(({ value }) => Number(value))
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  subtotal!: number;
}
```

Create `apps/api/src/promos/promos.controller.ts`:

```ts
import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { RequirePermissions } from '../auth/permissions.decorator';
import { PromosService } from './promos.service';
import { CreatePromoDto } from './dto/create-promo.dto';
import { ValidatePromoDto } from './dto/validate-promo.dto';

@Controller('promos')
export class PromosController {
  constructor(private readonly promos: PromosService) {}

  @Post('validate')
  @RequirePermissions('tickets.create')
  validate(@Body() dto: ValidatePromoDto, @Req() req: Request) {
    const userId = (req.user as { userId?: string } | undefined)?.userId ?? '';
    return this.promos.validate({
      code: dto.code,
      userId,
      flow: dto.flow,
      subtotal: dto.subtotal,
    });
  }

  @Get()
  @RequirePermissions('promos.write')
  list() {
    return this.promos.list();
  }

  @Post()
  @RequirePermissions('promos.write')
  create(@Body() dto: CreatePromoDto, @Req() req: Request) {
    const userId = (req.user as { userId?: string } | undefined)?.userId;
    return this.promos.create(dto, userId);
  }

  @Post(':id/deactivate')
  @RequirePermissions('promos.write')
  deactivate(@Param('id') id: string) {
    return this.promos.deactivate(id);
  }
}
```

Create `apps/api/src/promos/promos.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PromosService } from './promos.service';
import { PromosController } from './promos.controller';

@Module({
  imports: [PrismaModule],
  controllers: [PromosController],
  providers: [PromosService],
  exports: [PromosService],
})
export class PromosModule {}
```

Register `PromosModule` in `apps/api/src/app.module.ts` `imports`.

- [ ] **Step 5: Run test + typecheck**

Run: `cd apps/api && pnpm test -- --testPathPattern=promos.service && pnpm typecheck`
Expected: PASS (6 tests; typecheck clean).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/promos apps/api/src/app.module.ts
git commit -m "feat(api): promo codes — validate + admin CRUD"
```

---

### Task 5: Apply tax + promo + discount at intake

**Files:**
- Modify: `apps/api/src/tickets/tickets.service.ts` (`createIntakeTicket` at `:443-644`; constructor to inject `SettingsService` + `PromosService`)
- Modify: `apps/api/src/tickets/dto/create-ticket-intake.dto.ts` (add optional `promoCode`)
- Modify: `apps/api/src/tickets/tickets.module.ts` (import `SettingsModule`, `PromosModule`)
- Test: `apps/api/src/tickets/intake-tax-promo.spec.ts`

**Interfaces:**
- Consumes: `computeTicketTotal`, `paymentModelFor` (shared); `SettingsService.getTaxRate()`; `PromosService.validate(...)`.
- Produces: tickets persist `taxRate`, `taxAmount`, `promoCodeId`, `promoDiscount`, `priceBreakdown`; `billedTotal` now tax-inclusive.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/tickets/intake-tax-promo.spec.ts`. This test drives the helper that assembles the money block so we don't have to stand up the whole service. Add a private-but-testable static helper `TicketsService.assembleIntakeMoney(...)`:

```ts
import { TicketsService } from './tickets.service';

describe('TicketsService.assembleIntakeMoney', () => {
  it('digital ONE_TIME: tax on the full service cost, no discount', () => {
    const m = TicketsService.assembleIntakeMoney({
      flow: 'judicial_case_information',
      serviceCost: 5000,
      deliveryCharge: 0,
      taxRate: 0.17,
      promoDiscount: 0,
    });
    expect(m.charges.serviceCost).toBe(5000);
    expect(m.money.taxAmount).toBe(850);
    expect(m.money.totalAmount).toBe(5850);
  });

  it('SPLIT: bills only phase-1 base + tax on it at intake', () => {
    const m = TicketsService.assembleIntakeMoney({
      flow: 'judicial_case_files',
      serviceCost: 3000,
      deliveryCharge: 0,
      taxRate: 0.17,
      promoDiscount: 0,
    });
    expect(m.charges.deliveryCharges).toBe(0); // phase-2 for SPLIT
    expect(m.money.totalAmount).toBe(3510); // 3000 + 17%
  });

  it('applies promo before tax', () => {
    const m = TicketsService.assembleIntakeMoney({
      flow: 'judicial_case_information',
      serviceCost: 5000,
      deliveryCharge: 0,
      taxRate: 0.17,
      promoDiscount: 1000,
    });
    expect(m.money.taxableBase).toBe(4000);
    expect(m.money.totalAmount).toBe(4680);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && pnpm test -- --testPathPattern=intake-tax-promo`
Expected: FAIL — `assembleIntakeMoney` undefined.

- [ ] **Step 3: Add the static helper + wire it into `createIntakeTicket`**

In `tickets.service.ts`, import the shared money helpers at the top (extend the existing `@wusuq/shared` import):

```ts
import {
  buildPricingResolveInput,
  paymentModelFor,
  chargeCapabilitiesFor,
  computeTicketTotal,
  type TicketChargeComponents,
} from '@wusuq/shared';
```

Add the static helper (place near other private helpers in the class):

```ts
/**
 * Assemble the intake charge components + money for a freshly resolved price.
 * SPLIT flows bill phase-1 base only (phase-2 charges stay 0 until finalize);
 * ONE_TIME flows fold everything into serviceCost. Tax/promo/discount applied
 * via the single shared computeTicketTotal.
 */
static assembleIntakeMoney(args: {
  flow: string;
  serviceCost: number;
  deliveryCharge: number;
  taxRate: number;
  promoDiscount: number;
  discountPrice?: number;
}) {
  const isSplit = paymentModelFor(args.flow) === 'SPLIT';
  const charges: TicketChargeComponents = {
    serviceCost: args.serviceCost,
    // Delivery is a phase-2 charge for SPLIT; ONE_TIME digital flows are 0 too.
    deliveryCharges: isSplit ? 0 : args.deliveryCharge,
    printingCharges: 0,
    attestedCharges: 0,
    nonAttestedCharges: 0,
    additionalCharges: 0,
    additionalServiceCost: 0,
  };
  const money = computeTicketTotal({
    charges,
    discountPrice: args.discountPrice ?? 0,
    promoDiscount: args.promoDiscount,
    taxRate: args.taxRate,
  });
  return { charges, money };
}
```

Inject the new services in the constructor (add params alongside the existing ones — match the existing constructor signature/order):

```ts
    private readonly settingsService: SettingsService,
    private readonly promosService: PromosService,
```

(import `SettingsService` from `../settings/settings.service`, `PromosService` from `../promos/promos.service`.)

In `createIntakeTicket`, after the `pricing` resolve block and before computing `billedTotal` (`:521`), resolve tax + promo:

```ts
    const taxRate = await this.settingsService.getTaxRate();

    let promoDiscount = 0;
    let promoCodeId: string | null = null;
    let promoValidation: { valid: boolean; reason?: string; discount: number; promoCodeId?: string } | null = null;
    if (pricing.matched && dto.promoCode) {
      promoValidation = await this.promosService.validate({
        code: dto.promoCode,
        userId: dto.consumerId,
        flow: dto.flow,
        subtotal: paymentModelFor(dto.flow) === 'SPLIT' ? pricing.serviceCost : pricing.total,
      });
      if (!promoValidation.valid) {
        throw new BadRequestException(promoValidation.reason ?? 'Invalid promo code');
      }
      promoDiscount = promoValidation.discount;
      promoCodeId = promoValidation.promoCodeId ?? null;
    }

    const assembled = pricing.matched
      ? TicketsService.assembleIntakeMoney({
          flow: dto.flow,
          serviceCost: pricing.serviceCost,
          deliveryCharge: pricing.deliveryCharge,
          taxRate,
          promoDiscount,
        })
      : null;
```

Replace the `billedTotal` block (`:525-529`) with:

```ts
    const billedTotal = assembled ? assembled.money.totalAmount : 0;
```

In the `tx.ticket.create` `data` (`:537-574`), change the money fields:

```ts
            serviceCost: pricing.matched ? pricing.serviceCost : 0,
            deliveryCharges: assembled ? assembled.charges.deliveryCharges : 0,
            promoCodeId,
            promoDiscount,
            taxRate,
            taxAmount: assembled ? assembled.money.taxAmount : 0,
            priceBreakdown: assembled
              ? ({
                  resolver: {
                    basePrice: pricing.basePrice,
                    pdfSurcharge: pricing.pdfSurcharge,
                    titleSurcharge: pricing.titleSurcharge,
                    ageSurcharge: pricing.ageSurcharge,
                    bundleSurcharge: pricing.bundleSurcharge,
                    searchBothSurcharge: pricing.searchBothSurcharge,
                    cityCount: pricing.cityCount,
                    serviceCost: pricing.serviceCost,
                    total: pricing.total,
                  },
                  applied: assembled.money,
                  taxRate,
                  promoDiscount,
                } as Prisma.InputJsonValue)
              : undefined,
            defaultClerkCost: pricing.matched ? (pricing.clerkBaseCost ?? null) : null,
            totalAmount: billedTotal,
```

After the ticket+history `tx.ticket.create`/`ticketStatusHistory.create`, add the promo redemption **inside the same transaction** (so a failed create never leaks a redemption; the `@@unique([promoCodeId, ticketId])` blocks replays):

```ts
        if (promoCodeId) {
          await tx.promoRedemption.create({
            data: {
              promoCodeId,
              userId: dto.consumerId,
              ticketId: createdTicket.id,
              amount: promoDiscount,
            },
          });
        }
```

- [ ] **Step 4: Add `promoCode` to the intake DTO**

In `apps/api/src/tickets/dto/create-ticket-intake.dto.ts` add:

```ts
  @IsOptional()
  @IsString()
  promoCode?: string;
```

(ensure `IsOptional`, `IsString` are imported.)

- [ ] **Step 5: Wire modules**

In `apps/api/src/tickets/tickets.module.ts` add `SettingsModule` and `PromosModule` to `imports`.

- [ ] **Step 6: Run test + typecheck**

Run: `cd apps/api && pnpm test -- --testPathPattern=intake-tax-promo && pnpm typecheck`
Expected: PASS (3 tests; typecheck clean).

- [ ] **Step 7: Run the full ticket spec to confirm no regression**

Run: `cd apps/api && pnpm test -- --testPathPattern=tickets.service`
Expected: PASS (existing intake/idempotency tests still green — the money block is additive; `taxRate=0` by default keeps totals unchanged when tax is disabled).

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/tickets apps/api/src/settings apps/api/src/promos
git commit -m "feat(tickets): apply tax + promo at intake via computeTicketTotal; persist breakdown"
```

---

### Task 6: Route finance.updateCharge through computeTicketTotal

**Files:**
- Modify: `apps/api/src/finance/finance.service.ts` (`updateCharge` at `:210-308`)
- Modify: `apps/api/src/finance/dto/update-charge.dto.ts` (add optional `promoDiscount`)
- Test: `apps/api/src/finance/update-charge-money.spec.ts`

**Interfaces:**
- Consumes: `computeTicketTotal` (shared).
- Produces: `updateCharge` recomputes `totalAmount` (and `taxAmount`) via the shared function; the old `total >= serviceCost` gate is removed (a discount/promo may legitimately push the total below `serviceCost`); the `total >= amountPaid` gate stays.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/finance/update-charge-money.spec.ts`:

```ts
import { BadRequestException } from '@nestjs/common';
import { FinanceService } from './finance.service';

function build(ticket: any) {
  const prisma = {
    ticket: {
      findUnique: jest.fn(async () => ticket),
      update: jest.fn(async ({ data }: any) => ({ ...ticket, ...data })),
    },
  };
  const auditLogsService = { create: jest.fn() };
  return { service: new FinanceService(prisma as never, auditLogsService as never), prisma };
}

const TICKET = {
  id: 't1',
  serviceCost: 5000,
  deliveryCharges: 0,
  printingCharges: 0,
  attestedCharges: 0,
  nonAttestedCharges: 0,
  additionalCharges: 0,
  additionalServiceCost: 0,
  discountPrice: 0,
  promoDiscount: 0,
  taxRate: 0.17,
  amountPaid: 0,
};

describe('FinanceService.updateCharge money', () => {
  it('recomputes total with tax via the shared function', async () => {
    const { service } = build(TICKET);
    const r = await service.updateCharge('t1', { discountPrice: 1000 });
    // taxable 4000 → tax 680 → total 4680
    expect(r.totalAmount).toBe(4680);
  });

  it('allows a discount that pushes total below serviceCost', async () => {
    const { service } = build(TICKET);
    const r = await service.updateCharge('t1', { discountPrice: 4900 });
    // taxable 100 → tax 17 → total 117 (< serviceCost 5000) — allowed
    expect(r.totalAmount).toBe(117);
  });

  it('still rejects a total below amount already paid', async () => {
    const { service } = build({ ...TICKET, amountPaid: 3000, taxRate: 0 });
    await expect(
      service.updateCharge('t1', { discountPrice: 4000 }), // total 1000 < paid 3000
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && pnpm test -- --testPathPattern=update-charge-money`
Expected: FAIL — current `updateCharge` ignores tax and rejects total < serviceCost.

- [ ] **Step 3: Rewrite the money block in `updateCharge`**

Add the import at the top of `finance.service.ts`:

```ts
import { computeTicketTotal } from '@wusuq/shared';
```

Replace the `computedTotal`/gate block (`:238-260`) with:

```ts
    const promoDiscount = dto.promoDiscount ?? toNumber(ticket.promoDiscount);
    const taxRate = toNumber(ticket.taxRate);

    const money = computeTicketTotal({
      charges: {
        serviceCost,
        deliveryCharges,
        printingCharges,
        attestedCharges,
        nonAttestedCharges,
        additionalCharges,
        additionalServiceCost,
      },
      discountPrice,
      promoDiscount,
      taxRate,
    });

    // A staff discount or promo may legitimately push the total below
    // serviceCost, so the old `total >= serviceCost` gate is gone. The discount
    // may not exceed the charges subtotal, and the total may never drop below
    // what the consumer has already paid (the surplus-credit path on finalize
    // handles intentional downward corrections after a settlement).
    if (money.discountTotal > money.chargesSubtotal) {
      throw new BadRequestException('Discount cannot exceed the charges subtotal');
    }
    const totalAmount = dto.amount ?? money.totalAmount;

    const amountPaid = toNumber(ticket.amountPaid);
    if (totalAmount < amountPaid) {
      throw new BadRequestException(
        `New total (${totalAmount}) cannot be less than amount already paid (${amountPaid}).`,
      );
    }
```

In the `prisma.ticket.update` `data` (`:264-274`) add `promoDiscount` and `taxAmount`:

```ts
        discountPrice,
        promoDiscount,
        taxAmount: money.taxAmount,
        totalAmount,
```

- [ ] **Step 4: Add `promoDiscount` to the DTO**

In `apps/api/src/finance/dto/update-charge.dto.ts` add an optional numeric `promoDiscount` field mirroring the existing `discountPrice` field's decorators.

- [ ] **Step 5: Run test + the existing finance spec**

Run: `cd apps/api && pnpm test -- --testPathPattern="update-charge-money|finance.service"`
Expected: PASS (3 new + existing finance tests green).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/finance
git commit -m "feat(finance): updateCharge uses computeTicketTotal; drop total>=serviceCost gate"
```

---

### Task 7: Per-phase tax + breakdown at finalize

**Files:**
- Modify: `apps/api/src/tickets/tickets.service.ts` (`finalizeRemainderCore` at `:2302-2435`)
- Test: `apps/api/src/tickets/finalize-tax.spec.ts`

**Interfaces:**
- Consumes: `computeTicketTotal` (already imported in Task 5).
- Produces: finalize computes the cumulative `totalAmount` (incl. tax on phase-2 charges) via `computeTicketTotal`; persists `taxAmount` + refreshed `priceBreakdown`; surplus-credit logic unchanged.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/tickets/finalize-tax.spec.ts`. Like Task 5, test a pure static helper to avoid standing up the transaction:

```ts
import { TicketsService } from './tickets.service';

describe('TicketsService.assembleFinalizeMoney', () => {
  it('taxes the full cumulative charges at finalize', () => {
    const m = TicketsService.assembleFinalizeMoney({
      serviceCost: 3000,
      additionalCharges: 0,
      additionalServiceCost: 0,
      discountPrice: 0,
      promoDiscount: 0,
      taxRate: 0.17,
      attested: 1000,
      nonAttested: 0,
      printing: 500,
      delivery: 800,
    });
    // subtotal 5300 → tax 901 → total 6201
    expect(m.totalAmount).toBe(6201);
    expect(m.taxAmount).toBe(901);
  });

  it('subtracts discount + promo before tax', () => {
    const m = TicketsService.assembleFinalizeMoney({
      serviceCost: 3000,
      additionalCharges: 0,
      additionalServiceCost: 0,
      discountPrice: 300,
      promoDiscount: 0,
      taxRate: 0.17,
      attested: 0,
      nonAttested: 0,
      printing: 0,
      delivery: 0,
    });
    // taxable 2700 → tax 459 → total 3159
    expect(m.totalAmount).toBe(3159);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && pnpm test -- --testPathPattern=finalize-tax`
Expected: FAIL — `assembleFinalizeMoney` undefined.

- [ ] **Step 3: Add the helper + use it in `finalizeRemainderCore`**

Add the static helper near `assembleIntakeMoney`:

```ts
static assembleFinalizeMoney(args: {
  serviceCost: number;
  additionalCharges: number;
  additionalServiceCost: number;
  discountPrice: number;
  promoDiscount: number;
  taxRate: number;
  attested: number;
  nonAttested: number;
  printing: number;
  delivery: number;
}) {
  return computeTicketTotal({
    charges: {
      serviceCost: args.serviceCost,
      deliveryCharges: args.delivery,
      printingCharges: args.printing,
      attestedCharges: args.attested,
      nonAttestedCharges: args.nonAttested,
      additionalCharges: args.additionalCharges,
      additionalServiceCost: args.additionalServiceCost,
    },
    discountPrice: args.discountPrice,
    promoDiscount: args.promoDiscount,
    taxRate: args.taxRate,
  });
}
```

In `finalizeRemainderCore`, add `promoDiscount` + `taxRate` to the `select` (`:2310-2327`):

```ts
        promoDiscount: true,
        taxRate: true,
```

Replace the manual `total` formula (`:2366-2374`) with:

```ts
    const money = TicketsService.assembleFinalizeMoney({
      serviceCost: Number(ticket.serviceCost),
      additionalCharges: Number(ticket.additionalCharges ?? 0),
      additionalServiceCost: Number(ticket.additionalServiceCost ?? 0),
      discountPrice: Number(ticket.discountPrice ?? 0),
      promoDiscount: Number(ticket.promoDiscount ?? 0),
      taxRate: Number(ticket.taxRate ?? 0),
      attested,
      nonAttested,
      printing,
      delivery,
    });
    const total = money.totalAmount;
```

In the `tx.ticket.updateMany` `data` (`:2408-2418`) add `taxAmount`:

```ts
        taxAmount: money.taxAmount,
```

> The surplus-credit block (`:2382-2404`) and the conditional `updateMany({ where: { id, remainderFinalizedAt: null } })` are unchanged — `total` now simply comes from the shared function.

- [ ] **Step 4: Run test + the full ticket spec**

Run: `cd apps/api && pnpm test -- --testPathPattern="finalize-tax|tickets.service"`
Expected: PASS (2 new + existing finalize/surplus tests green when `taxRate=0`).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/tickets
git commit -m "feat(tickets): finalize computes cumulative tax via computeTicketTotal"
```

---

### Task 8: Edit ticket → re-price endpoint (+ preview)

**Files:**
- Create: `apps/api/src/tickets/dto/reprice-ticket.dto.ts`
- Modify: `apps/api/src/tickets/tickets.service.ts` (add `repriceTicket` + `repricePreview`)
- Modify: `apps/api/src/tickets/tickets.controller.ts` (add `POST /tickets/:id/reprice/preview` + `PATCH /tickets/:id/reprice`)
- Test: `apps/api/src/tickets/reprice.spec.ts`

**Interfaces:**
- Consumes: `buildPricingResolveInput`, `paymentModelFor`, `computeTicketTotal` (shared); `pricingService.resolve`; `settingsService.getTaxRate`.
- Produces:
  - `TicketsService.repricePreview(id, dto): Promise<{ resolver; charges; money }>` — no persistence.
  - `TicketsService.repriceTicket(id, dto, actor): Promise<Ticket>` — persists merged `formPayload`, recomputed charges, `taxAmount`, `priceBreakdown`, `totalAmount`; surplus-credit on downward correction; audit `TICKET_REPRICE`.
  - `RepriceTicketDto { payload?: Record<string,string>; overrides?: { ... charge fields ... }; discountPrice?: number }`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/tickets/reprice.spec.ts`:

```ts
import { ConflictException } from '@nestjs/common';
import { TicketsService } from './tickets.service';

function buildService(ticket: any, resolved: any) {
  const tx = {
    ticket: {
      findUnique: jest.fn(async () => ticket),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    user: { update: jest.fn(async () => ({})) },
    walletTransaction: { create: jest.fn(async () => ({})) },
    ticketStatusHistory: { create: jest.fn(async () => ({})) },
  };
  const prisma = {
    ticket: { findUnique: jest.fn(async () => ticket) },
    $transaction: jest.fn(async (cb: any) => cb(tx)),
  };
  const pricingService = { resolve: jest.fn(async () => resolved) };
  const settingsService = { getTaxRate: jest.fn(async () => 0.17) };
  const auditLogsService = { create: jest.fn() };
  // Match the real constructor parameter order when wiring the service.
  const svc = new TicketsService(
    prisma as never,
    pricingService as never,
    auditLogsService as never,
    settingsService as never,
    /* promosService */ {} as never,
    /* ...any remaining deps as never... */
  );
  return { svc, tx };
}

const RESOLVED = {
  matched: true, available: true, rulesExistForFlow: true,
  serviceCost: 7000, total: 7000, deliveryCharge: 0,
  basePrice: 7000, pdfSurcharge: 0, titleSurcharge: 0, ageSurcharge: 0,
  bundleSurcharge: 0, searchBothSurcharge: 0, cityCount: 1, clerkBaseCost: null,
  attestedCharge: 0, nonAttestedCharge: 0,
};

describe('TicketsService.repricePreview', () => {
  it('re-resolves and returns the tax-inclusive money for a digital flow', async () => {
    const ticket = {
      id: 't1', status: 'PAID', amountPaid: 0, intakeFlow: 'judicial_case_information',
      formPayload: { case_status: 'Pending Case' }, serviceCost: 3300,
      deliveryCharges: 0, printingCharges: 0, attestedCharges: 0, nonAttestedCharges: 0,
      additionalCharges: 0, additionalServiceCost: 0, discountPrice: 0, promoDiscount: 0,
    };
    const { svc } = buildService(ticket, RESOLVED);
    const out = await svc.repricePreview('t1', { payload: { year: '2024' } });
    expect(out.charges.serviceCost).toBe(7000);
    expect(out.money.totalAmount).toBe(8190); // 7000 + 17%
  });
});
```

> The constructor wiring in `buildService` must match the real `TicketsService` constructor parameter order (Task 5 added `settingsService` + `promosService`). Adjust the `new TicketsService(...)` arguments to the actual order before running.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && pnpm test -- --testPathPattern=reprice`
Expected: FAIL — `repricePreview` undefined.

- [ ] **Step 3: DTO**

Create `apps/api/src/tickets/dto/reprice-ticket.dto.ts`:

```ts
import { Type } from 'class-transformer';
import { IsNumber, IsObject, IsOptional, Min } from 'class-validator';

class RepriceOverridesDto {
  @IsOptional() @IsNumber() @Min(0) printingCharges?: number;
  @IsOptional() @IsNumber() @Min(0) attestedCharges?: number;
  @IsOptional() @IsNumber() @Min(0) nonAttestedCharges?: number;
  @IsOptional() @IsNumber() @Min(0) deliveryCharges?: number;
  @IsOptional() @IsNumber() @Min(0) additionalCharges?: number;
  @IsOptional() @IsNumber() @Min(0) additionalServiceCost?: number;
}

export class RepriceTicketDto {
  @IsOptional() @IsObject()
  payload?: Record<string, string>;

  @IsOptional() @Type(() => RepriceOverridesDto)
  overrides?: RepriceOverridesDto;

  @IsOptional() @IsNumber() @Min(0)
  discountPrice?: number;
}
```

- [ ] **Step 4: Implement `repricePreview` + `repriceTicket`**

Add to `TicketsService` (imports from Task 5 already cover the shared helpers):

```ts
private buildRepriceResult(
  ticket: {
    intakeFlow: string | null;
    formPayload: unknown;
    printingCharges: unknown; attestedCharges: unknown; nonAttestedCharges: unknown;
    deliveryCharges: unknown; additionalCharges: unknown; additionalServiceCost: unknown;
    discountPrice: unknown; promoDiscount: unknown;
  },
  resolved: Awaited<ReturnType<PricingService['resolve']>>,
  taxRate: number,
  dto: RepriceTicketDto,
) {
  const flow = ticket.intakeFlow ?? '';
  const isSplit = paymentModelFor(flow) === 'SPLIT';
  const o = dto.overrides ?? {};
  const num = (v: unknown) => Number(v ?? 0);
  const charges = {
    serviceCost: resolved.matched ? resolved.serviceCost : num(0),
    deliveryCharges: o.deliveryCharges ?? (isSplit ? num(ticket.deliveryCharges) : resolved.deliveryCharge),
    printingCharges: o.printingCharges ?? num(ticket.printingCharges),
    attestedCharges: o.attestedCharges ?? num(ticket.attestedCharges),
    nonAttestedCharges: o.nonAttestedCharges ?? num(ticket.nonAttestedCharges),
    additionalCharges: o.additionalCharges ?? num(ticket.additionalCharges),
    additionalServiceCost: o.additionalServiceCost ?? num(ticket.additionalServiceCost),
  };
  const money = computeTicketTotal({
    charges,
    discountPrice: dto.discountPrice ?? num(ticket.discountPrice),
    promoDiscount: num(ticket.promoDiscount),
    taxRate,
  });
  return { resolver: resolved, charges, money };
}

private mergedPayload(ticket: { formPayload: unknown }, dto: RepriceTicketDto) {
  const base = (ticket.formPayload ?? {}) as Record<string, string | undefined>;
  return { ...base, ...(dto.payload ?? {}) } as Record<string, string | undefined>;
}

async repricePreview(id: string, dto: RepriceTicketDto) {
  const ticket = await this.prisma.ticket.findUnique({ where: { id } });
  if (!ticket) throw new NotFoundException('Ticket not found');
  const payload = this.mergedPayload(ticket, dto);
  const resolved = await this.pricingService.resolve(
    buildPricingResolveInput(ticket.intakeFlow ?? '', payload),
  );
  const taxRate = await this.settingsService.getTaxRate();
  return this.buildRepriceResult(ticket, resolved, taxRate, dto);
}

async repriceTicket(
  id: string,
  dto: RepriceTicketDto,
  actor: { actorUserId?: string; actorEmail?: string },
) {
  const existing = await this.prisma.ticket.findUnique({ where: { id } });
  if (!existing) throw new NotFoundException('Ticket not found');
  if (existing.status === 'DELIVERED') {
    throw new BadRequestException('A delivered ticket can no longer be repriced');
  }
  const payload = this.mergedPayload(existing, dto);
  const resolved = await this.pricingService.resolve(
    buildPricingResolveInput(existing.intakeFlow ?? '', payload),
  );
  if (!resolved.matched && resolved.rulesExistForFlow) {
    throw new BadRequestException('No pricing rule matched the edited case details');
  }
  const taxRate = await this.settingsService.getTaxRate();
  const result = this.buildRepriceResult(existing, resolved, taxRate, dto);
  const total = result.money.totalAmount;

  // USER lock BEFORE ticket lock (deadlock-safe; same order as finalize).
  await this.prisma.$transaction(async (tx) => {
    const amountPaid = Number(existing.amountPaid);
    const surplus = Math.max(0, amountPaid - total);
    if (surplus > 0) {
      await tx.user.update({
        where: { id: existing.consumerId },
        data: { walletBalance: { increment: surplus } },
      });
      await tx.walletTransaction.create({
        data: {
          userId: existing.consumerId, ticketId: id, amount: surplus,
          paymentMode: 'BANK_TRANSFER', currency: 'PKR', status: 'VERIFIED',
          type: 'ADMIN_ADJUSTMENT', verifiedAt: new Date(),
          reviewedByUserId: actor.actorUserId ?? null,
          note: `Reprice surplus: new total (${total}) below amount paid (${amountPaid})`,
        },
      });
    }
    await tx.ticket.updateMany({
      where: { id },
      data: {
        serviceCost: result.charges.serviceCost,
        deliveryCharges: result.charges.deliveryCharges,
        printingCharges: result.charges.printingCharges,
        attestedCharges: result.charges.attestedCharges,
        nonAttestedCharges: result.charges.nonAttestedCharges,
        additionalCharges: result.charges.additionalCharges,
        additionalServiceCost: result.charges.additionalServiceCost,
        discountPrice: dto.discountPrice ?? existing.discountPrice,
        taxRate,
        taxAmount: result.money.taxAmount,
        totalAmount: total,
        ...(surplus > 0 ? { amountPaid: total } : {}),
        formPayload: payload as Prisma.InputJsonValue,
        priceBreakdown: {
          resolver: result.resolver,
          applied: result.money,
          taxRate,
        } as Prisma.InputJsonValue,
      },
    });
  });

  await this.auditLogsService.create({
    action: 'TICKET_REPRICE',
    entity: 'TICKET',
    entityId: id,
    actorUserId: actor.actorUserId,
    actorEmail: actor.actorEmail,
    metadata: { total, taxRate, payloadKeys: Object.keys(dto.payload ?? {}) },
  });

  return this.findOne(id);
}
```

- [ ] **Step 5: Controller endpoints**

In `apps/api/src/tickets/tickets.controller.ts` add (using the file's existing `@RequirePermissions` decorator + `req.user` access pattern):

```ts
  @Post(':id/reprice/preview')
  @RequirePermissions('tickets.write')
  repricePreview(@Param('id') id: string, @Body() dto: RepriceTicketDto) {
    return this.ticketsService.repricePreview(id, dto);
  }

  @Patch(':id/reprice')
  @RequirePermissions('tickets.write')
  reprice(@Param('id') id: string, @Body() dto: RepriceTicketDto, @Req() req: Request) {
    const user = req.user as { userId?: string; email?: string } | undefined;
    return this.ticketsService.repriceTicket(id, dto, {
      actorUserId: user?.userId,
      actorEmail: user?.email,
    });
  }
```

(import `RepriceTicketDto`; ensure `Patch`, `Post`, `Body`, `Param`, `Req` are imported.)

- [ ] **Step 6: Run test + typecheck + full ticket spec**

Run: `cd apps/api && pnpm test -- --testPathPattern="reprice|tickets.service" && pnpm typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/tickets
git commit -m "feat(tickets): edit-ticket reprice endpoint with live preview + surplus credit"
```

---

### Task 9: Checkout — tax / discount / promo lines + promo input (web)

**Files:**
- Modify: `apps/web/components/intake-wizard.tsx` (CheckoutPanel + the pricing-preview effect at `:637`/`:693`)
- Modify: `apps/web/lib/api-client.ts` (if a typed helper is added — otherwise call inline)
- Verify: `apps/web/.../checkout` line rendering

**Interfaces:**
- Consumes: `computeTicketTotal` (shared, now bundled to web), `POST /promos/validate`, `GET /settings/tax`.
- Produces: checkout shows **Discount**, **Promo**, and **Tax** lines and a promo-code input; the displayed total is `computeTicketTotal(...).totalAmount`.

> Frontend in this repo is verified via Playwright E2E, not component unit tests. Each web task ends with a manual/E2E verification step rather than a Jest cycle.

- [ ] **Step 1: Fetch the tax rate once on wizard mount**

In `intake-wizard.tsx`, add state `const [taxRate, setTaxRate] = useState(0);` and a mount effect that GETs `/settings/tax` and, inside `startTransition`, sets `setTaxRate(enabled ? rate : 0)`. (Follow the existing `startTransition` pattern the file uses for effect-driven setState — see the React 19 conventions in CLAUDE.md.)

- [ ] **Step 2: Add promo state + validate call**

Add `const [promoCode, setPromoCode] = useState('');` and `const [promoDiscount, setPromoDiscount] = useState(0);` and a `validatePromo()` handler that POSTs `{ code, flow, subtotal }` to `/promos/validate` and sets `promoDiscount` from the response (showing the `reason` on failure). `subtotal` = the resolver's billed amount for the flow (serviceCost for SPLIT, total for ONE_TIME) — the same value the checkout already displays as the base.

- [ ] **Step 3: Compute the displayed total via the shared function**

Where the checkout total is currently derived from `pricingResult`, replace the local arithmetic with:

```ts
import { computeTicketTotal } from '@wusuq/shared';

const money = computeTicketTotal({
  charges: {
    serviceCost: billedBase,            // existing checkout base value
    deliveryCharges: 0, printingCharges: 0, attestedCharges: 0,
    nonAttestedCharges: 0, additionalCharges: 0, additionalServiceCost: 0,
  },
  promoDiscount,
  taxRate,
});
```

Render `money.taxableBase` is implicit; add line items: a **Discount** line when `promoDiscount > 0`, a **Tax (NN%)** line when `taxRate > 0` showing `money.taxAmount`, and the grand total from `money.totalAmount`.

- [ ] **Step 4: Send `promoCode` on submit**

In `submitTicket`, include `promoCode: promoCode || undefined` in the intake POST body (the server re-validates and redeems).

- [ ] **Step 5: Build + manual verify**

Run: `pnpm --filter @wusuq/shared build && pnpm --filter web build`
Then run the app (`pnpm dev`), open a Case Information intake, confirm: a Tax line appears when a rate is set; entering a valid promo reduces the total before tax; an invalid promo shows the reason and leaves the total unchanged.

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/intake-wizard.tsx apps/web/lib/api-client.ts
git commit -m "feat(web): checkout shows discount/promo/tax lines + promo input"
```

---

### Task 10: Charges board tax line + Edit-Ticket reprice UI (web)

**Files:**
- Modify: `apps/web/components/ticket-charges-board.tsx` (show tax read-only)
- Modify: `apps/web/components/ticket-detail-panel.tsx` (add an "Edit ticket" action that opens a reprice form)
- Create: `apps/web/components/ticket-reprice-dialog.tsx` (edit case fields + live preview + manual overrides)

**Interfaces:**
- Consumes: `POST /tickets/:id/reprice/preview`, `PATCH /tickets/:id/reprice`.
- Produces: staff can edit case fields, see the re-priced breakdown (preview), and persist.

- [ ] **Step 1: Tax line in the charges board**

In `ticket-charges-board.tsx`, render `taxAmount` (and the `taxRate` as a label) as a **read-only** line in the breakdown — derived, not an editable input. Keep `discountPrice` editable; add a read-only **Promo** line when `promoDiscount > 0`.

- [ ] **Step 2: Reprice dialog**

Create `ticket-reprice-dialog.tsx`: a form pre-filled from the ticket's `formPayload` exposing the editable case fields (reuse the intake field components where practical), plus an optional manual-overrides section. On change (debounced ~400ms to respect the rate limit), POST to `/tickets/:id/reprice/preview` and render the returned `money` breakdown (subtotal, discount, promo, tax, total) with a before/after diff vs the ticket's current `totalAmount`. A **Save** button PATCHes `/tickets/:id/reprice` and refreshes the detail panel.

- [ ] **Step 3: Wire the action**

In `ticket-detail-panel.tsx`, add an "Edit ticket" button (gated on a staff permission/role check already used in that file) that opens `TicketRepriceDialog`.

- [ ] **Step 4: Build + manual verify**

Run: `pnpm --filter web build`, run the app, open a paid ticket as admin, edit the case year, confirm the preview re-prices live and Save persists the new total; confirm a downward correction below `amountPaid` credits the consumer wallet (check the wallet ledger).

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/ticket-charges-board.tsx apps/web/components/ticket-detail-panel.tsx apps/web/components/ticket-reprice-dialog.tsx
git commit -m "feat(web): charges-board tax line + edit-ticket reprice dialog with live preview"
```

---

### Task 11: Admin screens — tax settings + promo CRUD (web)

**Files:**
- Create: `apps/web/app/(portal)/settings/pricing/page.tsx` (tax rate form)
- Create: `apps/web/components/promo-codes-board.tsx` (list/create/deactivate)
- Create: `apps/web/app/(portal)/promos/page.tsx`
- Modify: `apps/web/components/nav.tsx` (add nav entries gated on `settings.write` / `promos.write`)

**Interfaces:**
- Consumes: `GET/PUT /settings/tax`, `GET/POST /promos`, `POST /promos/:id/deactivate`.

- [ ] **Step 1: Tax settings page**

A simple form: number input for `rate` (display as a percentage, store as a fraction — e.g. UI shows `17`, sends `0.17`), an `enabled` toggle, Save → `PUT /settings/tax`. Load current via `GET /settings/tax`.

- [ ] **Step 2: Promo codes board**

A table of existing codes (code, type, value, window, usage limits, active) + a create form (code, type select, value, optional cap/window/limits/serviceScope) → `POST /promos`; a Deactivate action → `POST /promos/:id/deactivate`.

- [ ] **Step 3: Nav entries**

Add "Pricing settings" and "Promo codes" nav items, visible only when the user holds `settings.write` / `promos.write` (reuse the existing permission-gated nav pattern in `nav.tsx`).

- [ ] **Step 4: Build + manual verify**

Run: `pnpm --filter web build`, run the app as super-admin, set the tax rate to 17%, create a `SAVE10` promo, confirm both appear and the intake checkout now reflects them.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/(portal)/settings apps/web/app/(portal)/promos apps/web/components/promo-codes-board.tsx apps/web/components/nav.tsx
git commit -m "feat(web): admin tax-settings + promo-codes management screens"
```

---

### Task 12: End-to-end + regression sweep

**Files:**
- Create: `tests/e2e/pricing-tax-promo.spec.ts` (or extend an existing intake E2E spec)
- Verify: full API suite + lint + typecheck.

- [ ] **Step 1: E2E — tax + promo at checkout and on the ticket**

Add a Playwright test: as super-admin set tax 17% and create a fixed Rs 1,000 promo scoped to all flows; as a consumer run a Case Information intake, apply the promo, assert the checkout total = `(base − 1000) × 1.17`; submit; assert the created ticket's total matches and a `PromoRedemption` exists (via an admin view or API check).

- [ ] **Step 2: E2E — edit-ticket reprice**

As admin, open a PAID ticket, change the case year so the price changes, confirm the preview updates, Save, and assert the new `totalAmount`.

- [ ] **Step 3: Full regression**

Run: `pnpm lint && pnpm typecheck && cd apps/api && pnpm test`
Expected: all green. Then `pnpm e2e` for the new specs (Chromium).

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/pricing-tax-promo.spec.ts
git commit -m "test(e2e): tax + promo checkout and edit-ticket reprice"
```

---

## Self-Review

**1. Spec coverage (Workstream A items):**
- A1 Tax → Tasks 1 (math), 2 (fields), 3 (settings), 5/6/7 (applied at intake/finance/finalize), 9/10/11 (UI). ✓
- A2 Promo codes → Tasks 1 (PromoType), 2 (models), 4 (service+CRUD), 5 (redeem at intake), 9/11 (UI). ✓
- A3 Edit→reprice + overrides → Task 8 (+ Task 10 UI). ✓
- A5 Surface staff discount → Tasks 9/10 (checkout + charges board lines). ✓
- Persisted breakdown snapshot (§3.5) → Task 2 (`priceBreakdown`) + written in Tasks 5/7/8. ✓
- §3.2 gate change → Task 6 (drops `total >= serviceCost`). ✓
- §3.3 per-phase tax → Tasks 5 (intake phase-1) + 7 (finalize cumulative). ✓
- §3.4 configurable + stamped rate → Task 3 (`getTaxRate`) + stamped in Tasks 5/7/8. ✓

**2. Placeholder scan:** No "TBD/TODO". Two deliberate *verification* notes ("verify the decorator import path", "match the real constructor parameter order") point the implementer at existing patterns rather than leaving logic unwritten — acceptable because the exact import/param order is an environment detail to confirm, not design to invent.

**3. Type consistency:** `computeTicketTotal` / `TicketChargeComponents` / `TicketMoneyResult` used identically in Tasks 1, 5, 6, 7, 8, 9, 10. `getTaxRate()` returns a fraction everywhere. `PromosService.validate(...)` signature is identical in Tasks 4 and 5. `RepriceTicketDto` shape is identical in Tasks 8's service, DTO, and controller.

**Out of scope for this plan (separate workstreams):** `regeneratedFromTicketId` (B), instant client-side rate (C), payment proof (E), consumer/clerk detail UX + sidebar (D), onboarding/case-file fields (F).

## Open items carried from the spec (§15)
1. Tax rate value + exactly which charges are taxable (default: all consumer charges; rate starts at 0).
2. Whether to reuse an existing admin permission instead of `settings.write`/`promos.write`.
3. Whether re-price is allowed in `COMPLETED` (currently allowed for any non-`DELIVERED` status; tighten if owner prefers).
