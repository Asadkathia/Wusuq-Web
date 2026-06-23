# Country-Based Pricing (PKR / USD) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bill Pakistan customers in PKR (existing rates) and all other countries in USD off a separate manual price list, deriving currency from the phone dial code.

**Architecture:** Currency is a property of the `User` (derived from the phone dial code: `+92` → PKR, else USD), snapshotted onto each `Ticket` at intake. PKR and USD `PricingRule` rows live in one table keyed by a new `currency` dimension; the resolver short-circuits to a flat all-inclusive lookup for USD (no surcharges, no tax, no promo, ONE_TIME). Wallet is single-currency per user. The frontend formats money per the relevant currency and hides USD-unavailable services.

**Tech Stack:** NestJS 11 + Prisma (Postgres) API, Next.js 16 web, TypeScript-only `@wusuq/shared`, Jest (API unit), Playwright (E2E).

## Global Constraints

- `@wusuq/shared` is the SINGLE source for currency derivation, payment-model, money math, and money formatting. Never hand-roll these at a call site (same rule as `buildPricingResolveInput` / `computeTicketTotal`).
- After editing `packages/shared/src/index.ts` you MUST run `pnpm --filter @wusuq/shared build` before the **API** (or its Jest tests) sees the change — the API resolves `@wusuq/shared` from `dist/`. The web app maps to `src` directly (no rebuild).
- Currency values are exactly `'PKR' | 'USD'` (the `Currency` type). `+92` ⇒ PKR; any other dial code ⇒ USD; default PKR when unknown.
- USD is **all-inclusive flat**: the matched rule's `basePrice` IS the total. No PDF / delivery / attestation / title / age / search-both / per-year / per-city / bundle math, **no tax, no promo, no clerk phase-2 remainder**. USD ⇒ `paymentModelFor` returns `ONE_TIME` for every flow.
- USD service menu = `judicial_case_files`, `judicial_case_information`, `judicial_case_search` ONLY. Case Filing, PoA, and all non-judicial flows are hidden/unavailable for USD.
- Currency **locks once the account is active**: re-derive on phone/country change ONLY when the user has zero non-archived tickets AND zero wallet balance.
- The server is **authoritative**: `Ticket.currency` is stamped from `User.currency` at intake regardless of any client-supplied value.
- Never read-then-write `Ticket.status` (existing audit 2.1 rule) — do not introduce non-conditional status writes.
- USD year-band → cell mapping (Case Files, `judicial_case_files`): `pending`=base "Case Files" row, `current`="Case Record Current Year", `y2025`/`y2024_2023`/`y2022_2020`/`y2019_2017`/`y2016_back`= the image-2 ladder. Court tiers: `Lower Court` / `Special Court` / `High Court` / `Supreme Court`. Regions: `Punjab` / `other`. Full price table in the design spec Appendix A (`DOcs/superpowers/specs/2026-06-23-country-based-pricing-design.md`).

---

## Phase A — Foundation & data model

### Task A1: `Currency` type + `deriveCurrency` helper (shared)

**Files:**
- Modify: `packages/shared/src/index.ts` (add near the role helpers, ~line 192)
- Test: `apps/api/src/auth/derive-currency.spec.ts` (new — unit-tests the shared helper via the built dist, using the existing API Jest runner)

**Interfaces:**
- Produces: `export type Currency = 'PKR' | 'USD'` and `export function deriveCurrency(input: { phone?: string | null; country?: string | null }): Currency`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/auth/derive-currency.spec.ts`:

```ts
import { deriveCurrency } from '@wusuq/shared';

describe('deriveCurrency', () => {
  it('returns PKR for a +92 phone', () => {
    expect(deriveCurrency({ phone: '+923001234567' })).toBe('PKR');
  });
  it('treats a +92 phone with stray spaces as PKR', () => {
    expect(deriveCurrency({ phone: ' +92 300 1234567 ' })).toBe('PKR');
  });
  it('returns USD for a non-+92 phone', () => {
    expect(deriveCurrency({ phone: '+447911123456' })).toBe('USD');
  });
  it('falls back to country ISO when phone is absent', () => {
    expect(deriveCurrency({ country: 'PK' })).toBe('PKR');
    expect(deriveCurrency({ country: 'GB' })).toBe('USD');
  });
  it('prefers phone over country (phone dial code wins)', () => {
    expect(deriveCurrency({ phone: '+447911123456', country: 'PK' })).toBe('USD');
  });
  it('defaults to PKR when nothing is provided', () => {
    expect(deriveCurrency({})).toBe('PKR');
    expect(deriveCurrency({ phone: null, country: null })).toBe('PKR');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && pnpm test -- --testPathPattern=derive-currency`
Expected: FAIL — `deriveCurrency` is not exported from `@wusuq/shared`.

- [ ] **Step 3: Implement in shared**

In `packages/shared/src/index.ts`, after the `isStaffRole` block (~line 190), add:

```ts
// ── Billing currency ──────────────────────────────────────────────────────
// A customer is billed in PKR when their phone dial code is +92 (Pakistan),
// otherwise in USD. Phone dial code wins; country ISO is the fallback when no
// phone is on file; default PKR. This is the ONLY place currency is derived.
export type Currency = 'PKR' | 'USD';

export function deriveCurrency(input: {
  phone?: string | null;
  country?: string | null;
}): Currency {
  const phone = input.phone?.replace(/\s+/g, '') ?? '';
  if (phone) return phone.startsWith('+92') ? 'PKR' : 'USD';
  if (input.country) return input.country.toUpperCase() === 'PK' ? 'PKR' : 'USD';
  return 'PKR';
}
```

- [ ] **Step 4: Build shared, then run the test**

Run: `pnpm --filter @wusuq/shared build && cd apps/api && pnpm test -- --testPathPattern=derive-currency`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/index.ts apps/api/src/auth/derive-currency.spec.ts
git commit -m "feat(shared): add Currency type and deriveCurrency helper"
```

---

### Task A2: Currency-aware `paymentModelFor` + `formatMoney` (shared)

**Files:**
- Modify: `packages/shared/src/index.ts` (`paymentModelFor` ~line 527; add `formatMoney` near `round2` ~line 690)
- Test: `apps/api/src/pricing/payment-model-currency.spec.ts` (new), `apps/api/src/pricing/format-money.spec.ts` (new)

**Interfaces:**
- Consumes: `Currency`, `PaymentModel` (existing) from A1/shared
- Produces:
  - `paymentModelFor(flow?: string | null, currency?: Currency): PaymentModel` — USD ⇒ always `'ONE_TIME'`; omitted/undefined currency preserves existing PKR behaviour.
  - `formatMoney(amount: number, currency: Currency, opts?: { decimals?: number }): string` — USD ⇒ `"$1,234"`, PKR ⇒ `"PKR 1,234"`.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/pricing/payment-model-currency.spec.ts`:

```ts
import { paymentModelFor } from '@wusuq/shared';

describe('paymentModelFor (currency-aware)', () => {
  it('keeps Case Files SPLIT for PKR', () => {
    expect(paymentModelFor('judicial_case_files', 'PKR')).toBe('SPLIT');
  });
  it('forces ONE_TIME for any USD flow', () => {
    expect(paymentModelFor('judicial_case_files', 'USD')).toBe('ONE_TIME');
    expect(paymentModelFor('non_judicial_copy_of_fir', 'USD')).toBe('ONE_TIME');
  });
  it('preserves existing behaviour when currency omitted', () => {
    expect(paymentModelFor('judicial_case_files')).toBe('SPLIT');
    expect(paymentModelFor('judicial_case_search')).toBe('ONE_TIME');
  });
});
```

Create `apps/api/src/pricing/format-money.spec.ts`:

```ts
import { formatMoney } from '@wusuq/shared';

describe('formatMoney', () => {
  it('formats USD with a $ prefix', () => {
    expect(formatMoney(1234, 'USD')).toBe('$1,234');
  });
  it('formats PKR with a PKR prefix', () => {
    expect(formatMoney(1234, 'PKR')).toBe('PKR 1,234');
  });
  it('respects a decimals option', () => {
    expect(formatMoney(1234.5, 'USD', { decimals: 2 })).toBe('$1,234.50');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && pnpm test -- --testPathPattern="payment-model-currency|format-money"`
Expected: FAIL — `formatMoney` undefined; `paymentModelFor` ignores the 2nd arg.

- [ ] **Step 3: Implement in shared**

Replace `paymentModelFor` (currently lines 527-530) in `packages/shared/src/index.ts`:

```ts
export function paymentModelFor(
  flow?: string | null,
  currency?: Currency,
): PaymentModel {
  // USD orders are all-inclusive flat — always a single up-front payment, even
  // for physically-fulfilled Case Files (no clerk phase-2 remainder is billed).
  if (currency === 'USD') return 'ONE_TIME';
  if (!flow) return 'ONE_TIME';
  return PAYMENT_MODEL_BY_FLOW[flow] ?? 'ONE_TIME';
}
```

Add `formatMoney` immediately after `round2` (~line 690):

```ts
/**
 * Format a money amount for display. USD → "$1,234"; PKR → "PKR 1,234".
 * The ONLY money formatter — replaces the per-component formatPKR helpers.
 */
export function formatMoney(
  amount: number,
  currency: Currency,
  opts?: { decimals?: number },
): string {
  const decimals = opts?.decimals ?? 0;
  const n = new Intl.NumberFormat(currency === 'USD' ? 'en-US' : 'en-PK', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount);
  return currency === 'USD' ? `$${n}` : `PKR ${n}`;
}
```

- [ ] **Step 4: Build shared, run tests**

Run: `pnpm --filter @wusuq/shared build && cd apps/api && pnpm test -- --testPathPattern="payment-model-currency|format-money"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/index.ts apps/api/src/pricing/payment-model-currency.spec.ts apps/api/src/pricing/format-money.spec.ts
git commit -m "feat(shared): currency-aware paymentModelFor + formatMoney"
```

---

### Task A3: Prisma migration — `PricingRule.currency`, `Ticket.currency`, new unique key

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (`PricingRule` 530-563; `Ticket` 208-295)
- Create: `apps/api/prisma/migrations/<timestamp>_add_currency_pricing_ticket/migration.sql` (generated)

**Interfaces:**
- Produces: `PricingRule.currency String @default("PKR")`; unique key `PricingRule_dimensions_unique` becomes `(currency, region, courtLevel, flow, yearBand, setType)`. `Ticket.currency String @default("PKR")`.

- [ ] **Step 1: Edit the schema — PricingRule**

In `apps/api/prisma/schema.prisma`, add the `currency` field to `PricingRule` (after `region` line 543) and extend the unique key (line 562):

```prisma
  region                 String?
  currency               String   @default("PKR")
```

Change line 562 from:
```prisma
  @@unique([region, courtLevel, flow, yearBand, setType], name: "PricingRule_dimensions_unique")
```
to:
```prisma
  @@unique([currency, region, courtLevel, flow, yearBand, setType], name: "PricingRule_dimensions_unique")
```

- [ ] **Step 2: Edit the schema — Ticket**

Add a `currency` column to `Ticket` (after `serviceCost` line 255):

```prisma
  serviceCost     Decimal             @default(0)
  // Billing currency snapshotted from User.currency at intake (PKR | USD).
  currency        String              @default("PKR")
```

- [ ] **Step 3: Create the migration**

Run: `cd apps/api && pnpm prisma:migrate:dev --name add_currency_pricing_ticket`
Expected: a new migration adds both columns (default `'PKR'`, so existing rows backfill automatically) and recreates the unique index to include `currency`. Since every existing `PricingRule` row is now `'PKR'`, the new composite unique index has no collisions.

- [ ] **Step 4: Regenerate the client + typecheck**

Run: `cd apps/api && pnpm prisma:generate && cd .. && pnpm typecheck`
Expected: client regenerates; typecheck passes (no code reads `currency` yet).

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(db): add currency to PricingRule (+unique key) and Ticket"
```

---

### Task A4: Persist `User.country`/`currency` at signup, profile, OTP — with lock rule

**Files:**
- Modify: `apps/api/src/auth/dto/signup.dto.ts` (add `country`), `apps/api/src/auth/dto/profile-complete.dto.ts` (add `country`)
- Modify: `apps/api/src/auth/auth.service.ts` (`signup` 152-172; `completeProfile` 220-252)
- Modify: `apps/api/src/auth/otp.service.ts` (`verify` user-create 125-132)
- Test: `apps/api/src/auth/auth-currency.spec.ts` (new)

**Interfaces:**
- Consumes: `deriveCurrency` (A1)
- Produces: `signup` and `otp.verify` write `country` + `currency`; `completeProfile` re-derives `currency`/`country` only when the user has zero tickets and zero wallet balance (lock rule).

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/auth/auth-currency.spec.ts` (unit test against a mocked PrismaService):

```ts
import { AuthService } from './auth.service';

function makePrisma(overrides: any = {}) {
  return {
    user: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(({ data }) => ({ id: 'u1', ...data })),
      update: jest.fn().mockImplementation(({ data }) => ({ id: 'u1', ...data })),
      findUniqueOrThrow: jest.fn(),
    },
    ticket: { count: jest.fn().mockResolvedValue(0) },
    ...overrides,
  } as any;
}

describe('AuthService currency derivation', () => {
  it('signup stores currency=USD + country for a non-PK phone', async () => {
    const prisma = makePrisma();
    const svc = new AuthService(prisma, {} as any, {} as any); // adjust ctor args to match real signature
    await svc.signup({ name: 'A', email: 'a@x.com', password: 'password1', phone: '+447911123456', country: 'GB' } as any);
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ currency: 'USD', country: 'GB' }) }),
    );
  });

  it('signup stores currency=PKR for a +92 phone', async () => {
    const prisma = makePrisma();
    const svc = new AuthService(prisma, {} as any, {} as any);
    await svc.signup({ name: 'A', email: 'a@x.com', password: 'password1', phone: '+923001234567', country: 'PK' } as any);
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ currency: 'PKR' }) }),
    );
  });
});
```

> NOTE: match `new AuthService(...)` to the real constructor argument list in `auth.service.ts` (read the constructor before writing the test). If construction is awkward to mock, instead assert on a small extracted pure helper `currencyFieldsForUser({phone, country})` you add to `auth.service.ts` that returns `{ country, currency }` — and unit-test that helper directly.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && pnpm test -- --testPathPattern=auth-currency`
Expected: FAIL — signup doesn't write `currency`/`country`.

- [ ] **Step 3: Add `country` to the DTOs**

`apps/api/src/auth/dto/signup.dto.ts` — add after `phone`:

```ts
  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2)
  country?: string; // ISO code from the signup country picker (e.g. 'PK', 'GB')
```
(Add `MaxLength` to the `class-validator` import.)

`apps/api/src/auth/dto/profile-complete.dto.ts` — add after `postalCode`:

```ts
  @IsOptional()
  @IsString()
  @MaxLength(2)
  country?: string;
```

- [ ] **Step 4: Write currency at signup**

In `apps/api/src/auth/auth.service.ts`, import the helper at the top:

```ts
import { deriveCurrency } from '@wusuq/shared';
```

Replace the `signup` create (lines 161-169) so the new user gets country + currency:

```ts
    const passwordHash = await hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        passwordHash,
        phone: dto.phone,
        country: dto.country ?? null,
        currency: deriveCurrency({ phone: dto.phone, country: dto.country }),
        role: 'consumer',
      },
    });
```

- [ ] **Step 5: Write currency at OTP verify (user creation)**

In `apps/api/src/auth/otp.service.ts`, import `deriveCurrency` and set currency on the create (lines 125-132). The phone is always `+92…` here (normalizePhone), so currency resolves to PKR, but go through the helper for consistency:

```ts
import { deriveCurrency } from '@wusuq/shared';
// ...
      user = await this.prisma.user.create({
        data: {
          phone,
          phoneVerified: true,
          role: 'consumer',
          isActive: true,
          currency: deriveCurrency({ phone }),
        },
      });
```

- [ ] **Step 6: Apply the currency-lock rule in completeProfile**

In `apps/api/src/auth/auth.service.ts`, extend `completeProfile` to accept `country` and re-derive currency ONLY when the account has no activity. Replace the body (lines 220-252):

```ts
  async completeProfile(
    userId: string,
    dto: {
      name: string;
      cityName?: string;
      consumerKind?: 'LAWYER' | 'NON_LAWYER' | 'CORPORATE';
      address?: string;
      province?: string;
      district?: string;
      postalCode?: string;
      country?: string;
    },
  ) {
    // Currency locks once the account is active. Re-derive (and update country)
    // only when the user has zero non-archived tickets AND zero wallet balance,
    // so an in-flight account can never end up with a mixed PKR/USD ledger.
    const existing = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { walletBalance: true, currency: true, phone: true },
    });
    const ticketCount = await this.prisma.ticket.count({
      where: { consumerId: userId, archivedAt: null },
    });
    const locked = ticketCount > 0 || Number(existing.walletBalance) !== 0;
    const currencyUpdate =
      !locked && dto.country
        ? {
            country: dto.country,
            currency: deriveCurrency({ phone: existing.phone, country: dto.country }),
          }
        : dto.country && locked
          ? { country: dto.country } // contact info only; billing currency stays
          : {};

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        name: dto.name,
        ...(dto.cityName ? { city: dto.cityName } : {}),
        ...(dto.consumerKind ? { consumerKind: dto.consumerKind } : {}),
        ...(dto.address ? { address: dto.address } : {}),
        ...(dto.province ? { province: dto.province } : {}),
        ...(dto.district ? { district: dto.district } : {}),
        ...(dto.postalCode ? { postalCode: dto.postalCode } : {}),
        ...currencyUpdate,
      },
    });
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      city: user.city,
      consumerKind: user.consumerKind,
      currency: user.currency,
    };
  }
```

Wire the controller that calls `completeProfile` to pass `dto.country` through (find the `@Post` profile-complete handler in `auth.controller.ts` and add `country: dto.country` to the object it passes).

- [ ] **Step 7: Build shared (for the import), run tests + typecheck**

Run: `pnpm --filter @wusuq/shared build && cd apps/api && pnpm test -- --testPathPattern=auth-currency && cd .. && pnpm typecheck`
Expected: PASS.

- [ ] **Step 8: Backfill existing users' currency from phone**

Create a one-shot script `apps/api/scripts/backfill-user-currency.ts`:

```ts
import { PrismaClient } from '@prisma/client';
import { deriveCurrency } from '@wusuq/shared';

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({ select: { id: true, phone: true, country: true } });
  let updated = 0;
  for (const u of users) {
    const currency = deriveCurrency({ phone: u.phone, country: u.country });
    if (currency !== 'PKR') {
      await prisma.user.update({ where: { id: u.id }, data: { currency } });
      updated++;
    }
  }
  console.log(`Backfilled currency for ${updated} non-PKR users (of ${users.length}).`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
```

Run (local DB): `cd apps/api && npx tsx scripts/backfill-user-currency.ts`
Expected: prints a count (likely 0 in a PK-only dataset; correct).

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/auth apps/api/scripts/backfill-user-currency.ts
git commit -m "feat(auth): derive + persist User.country/currency at signup/profile/otp with lock rule"
```

---

## Phase B — USD resolver + seed

### Task B1: Thread `currency` through the resolve input

**Files:**
- Modify: `packages/shared/src/index.ts` (`PricingResolveInput` 747-768; `buildPricingResolveInput` 770-830)
- Modify: `apps/api/src/pricing/dto/resolve-pricing.dto.ts` (add `currency`)
- Test: `apps/api/src/pricing/build-resolve-input-currency.spec.ts` (new)

**Interfaces:**
- Produces: `PricingResolveInput.currency: Currency`; `buildPricingResolveInput(flow, payload, currency: Currency = 'PKR')`; `ResolvePricingDto.currency?: string`.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/pricing/build-resolve-input-currency.spec.ts`:

```ts
import { buildPricingResolveInput } from '@wusuq/shared';

describe('buildPricingResolveInput currency', () => {
  it('defaults to PKR', () => {
    expect(buildPricingResolveInput('judicial_case_files', {}).currency).toBe('PKR');
  });
  it('passes USD through', () => {
    expect(buildPricingResolveInput('judicial_case_files', {}, 'USD').currency).toBe('USD');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && pnpm test -- --testPathPattern=build-resolve-input-currency`
Expected: FAIL — `currency` not on the input.

- [ ] **Step 3: Add `currency` to `PricingResolveInput` + builder**

In `packages/shared/src/index.ts`, add to `PricingResolveInput` (after `flow`):

```ts
export interface PricingResolveInput {
  flow: string;
  currency: Currency;
  courtLevel?: string;
```

Change `buildPricingResolveInput` signature + return (lines 770-830):

```ts
export function buildPricingResolveInput(
  flow: string,
  payload: Record<string, string | undefined> | undefined | null,
  currency: Currency = 'PKR',
): PricingResolveInput {
```
and add `currency,` to the returned object (next to `flow,`).

- [ ] **Step 4: Add `currency` to `ResolvePricingDto`**

In `apps/api/src/pricing/dto/resolve-pricing.dto.ts`, add:

```ts
  @IsOptional()
  @IsString()
  currency?: string; // 'PKR' | 'USD' — server treats absent as 'PKR'
```

- [ ] **Step 5: Build shared, run test + typecheck**

Run: `pnpm --filter @wusuq/shared build && cd apps/api && pnpm test -- --testPathPattern=build-resolve-input-currency && cd .. && pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/index.ts apps/api/src/pricing/dto/resolve-pricing.dto.ts apps/api/src/pricing/build-resolve-input-currency.spec.ts
git commit -m "feat(pricing): thread currency through the resolve input"
```

---

### Task B2: Resolver currency filter + USD flat short-circuit

**Files:**
- Modify: `apps/api/src/pricing/pricing.service.ts` (`resolve` 304-673; `availabilityFor` 199-300)
- Test: `apps/api/src/pricing/resolve-usd.spec.ts` (new — uses a stubbed PrismaService returning fixture rules)

**Interfaces:**
- Consumes: `ResolvePricingDto.currency`, `Currency`
- Produces: `resolve` returns the flat all-inclusive USD result; both `resolve` and `availabilityFor` filter rules by currency (treating a null/absent rule currency as `'PKR'`).

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/pricing/resolve-usd.spec.ts`:

```ts
import { PricingService } from './pricing.service';

function stubPrisma(rules: any[]) {
  return {
    pricingRule: { findMany: jest.fn().mockResolvedValue(rules) },
    geoCity: { findUnique: jest.fn().mockResolvedValue(null), findFirst: jest.fn().mockResolvedValue(null) },
    ticketClerkReport: { findUnique: jest.fn().mockResolvedValue(null) },
    // getSettings() in the service reads from somewhere — stub via the method or settings table:
    appSetting: { findMany: jest.fn().mockResolvedValue([]) },
  } as any;
}

const usdCaseFiles2024 = {
  id: 'usd1', flow: 'judicial_case_files', courtLevel: 'Lower Court',
  region: 'Punjab', yearBand: 'y2024_2023', setType: null, currency: 'USD',
  isLegacy: false, isActive: true, availability: true, priority: 5,
  basePrice: 50, pdfSurchargeAmount: 0, deliveryGuyFee: 0, deliveryCharge: 0,
  clerkBaseCost: null, caseStatus: null, yearFrom: 2023, yearTo: 2024,
};

describe('resolve() USD flat short-circuit', () => {
  it('returns the cell as an all-inclusive ONE_TIME total with zero surcharges', async () => {
    const svc = new PricingService(stubPrisma([usdCaseFiles2024]));
    // If getSettings() can't be stubbed via the table, spy it:
    jest.spyOn(svc as any, 'getSettings').mockResolvedValue({ pricingMode: 'v2' });
    const r = await svc.resolve({
      flow: 'judicial_case_files', courtLevel: 'Lower Court', region: 'Punjab',
      caseStatus: 'Decided Case', caseYear: 2024, yearBand: 'y2024_2023',
      currency: 'USD',
    } as any);
    expect(r.matched).toBe(true);
    expect(r.available).toBe(true);
    expect(r.basePrice).toBe(50);
    expect(r.serviceCost).toBe(50);
    expect(r.total).toBe(50);
    expect(r.pdfSurcharge).toBe(0);
    expect(r.ageSurcharge).toBe(0);
    expect(r.deliveryCharge).toBe(0);
    expect(r.attestedCharge).toBe(0);
  });

  it('does not match a USD request against a PKR rule', async () => {
    const pkr = { ...usdCaseFiles2024, id: 'pkr1', currency: 'PKR', basePrice: 7300 };
    const svc = new PricingService(stubPrisma([pkr]));
    jest.spyOn(svc as any, 'getSettings').mockResolvedValue({ pricingMode: 'v2' });
    const r = await svc.resolve({
      flow: 'judicial_case_files', courtLevel: 'Lower Court', region: 'Punjab',
      yearBand: 'y2024_2023', currency: 'USD',
    } as any);
    expect(r.matched).toBe(false);
  });
});
```

> Read the real `PricingService` constructor + `getSettings()` before finalizing the stub; adjust how `getSettings` and the settings source are mocked to match the actual implementation.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && pnpm test -- --testPathPattern=resolve-usd`
Expected: FAIL — USD request matches the PKR rule and/or applies surcharges.

- [ ] **Step 3: Add the currency filter to every candidate filter**

In `resolve` (pricing.service.ts), compute the requested currency near the top (after `region` is derived, ~line 343):

```ts
    const currency = (dto.currency as 'PKR' | 'USD') ?? 'PKR';
```

Add this predicate to EACH of the four candidate `.filter((r) => { … })` blocks (strict match ~366, pending→current fallback ~382, setType fallback ~410, legacy fallback ~436) as the FIRST check:

```ts
      if ((r.currency ?? 'PKR') !== currency) return false;
```

Do the same in `availabilityFor`: compute `const currency = (args as any).currency ? ((args as any).currency as 'PKR'|'USD') : 'PKR';` (add `currency?: string` to the `availabilityFor` args type and to `PricingAvailabilityDto`), and add `if ((r.currency ?? 'PKR') !== currency) return false;` to the `lookup` and `lookupNullSetType` filters.

- [ ] **Step 4: Add the USD flat short-circuit**

In `resolve`, immediately AFTER the `best.availability === false` early-return block (~line 478, before `const caseInfoBase = …`), insert:

```ts
    // USD orders are all-inclusive flat: the matched rule's basePrice IS the
    // total. No PDF/delivery/attestation/title/age/search-both/per-year/
    // per-city/bundle math, and ONE_TIME (no clerk phase-2 remainder).
    if (currency === 'USD') {
      const flat = Number(best.basePrice);
      return {
        matched: true,
        available: true,
        rulesExistForFlow: true,
        ruleId: best.id,
        yearBand: best.yearBand,
        setType: best.setType,
        basePrice: flat,
        base: flat,
        pdfSurcharge: 0,
        deliveryFee: 0,
        titleSurcharge: 0,
        ageSurcharge: 0,
        bundleSurcharge: 0,
        searchBothSurcharge: 0,
        cityCount: 1,
        clerkBaseCost: null,
        attestedCharge: 0,
        nonAttestedCharge: 0,
        deliveryCharge: 0,
        serviceCost: flat,
        total: flat,
      };
    }
```

- [ ] **Step 5: Run the test**

Run: `cd apps/api && pnpm test -- --testPathPattern=resolve-usd`
Expected: PASS (2 tests).

- [ ] **Step 6: Guard against PKR regressions**

Run the existing pricing tests to confirm the currency filter (default PKR) didn't change PKR resolution:
Run: `cd apps/api && pnpm test -- --testPathPattern=pricing`
Expected: PASS (all existing pricing tests still green).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/pricing
git commit -m "feat(pricing): currency-filter rules + USD flat all-inclusive short-circuit"
```

---

### Task B3: USD price-list data + seed insertion + smoke test

**Files:**
- Create: `apps/api/data/usd-pricing.ts` (the transcribed USD table — single source)
- Modify: `apps/api/scripts/seed-pricing.ts` (build USD rows, append to `allRows` before the single `createMany`, ~line 560-568)
- Create: `apps/api/scripts/smoke-usd-pricing.ts` (worked examples)

**Interfaces:**
- Consumes: nothing new (plain data + Prisma createMany)
- Produces: USD `PricingRule` rows in the DB; a smoke script that asserts matched + total for sample USD combinations.

- [ ] **Step 1: Write the USD data module**

Create `apps/api/data/usd-pricing.ts` (court tiers `Lower Court`/`Special Court`/`High Court`/`Supreme Court`; values from spec Appendix A):

```ts
// USD all-inclusive flat rates (owner list 2026-06-14). Court-tier order:
// [Lower Court, Special Court, High Court, Supreme Court].
type Tier4 = [number, number, number, number];
const TIERS = ['Lower Court', 'Special Court', 'High Court', 'Supreme Court'] as const;

export type UsdPricingRow = {
  flow: string;
  courtLevel: string;
  region: 'Punjab' | 'other';
  yearBand: string | null;
  basePrice: number;
};

// Case Files (judicial_case_files) by yearBand. pending = "Case Files",
// current = "Case Record Current Year", y2025.. = decided-year ladder.
const CASE_FILES: Record<'Punjab' | 'other', Record<string, Tier4>> = {
  Punjab: {
    pending:     [15, 25, 20, 20],
    current:     [25, 35, 30, 30],
    y2025:       [35, 45, 40, 40],
    y2024_2023:  [50, 60, 50, 50],
    y2022_2020:  [65, 70, 65, 65],
    y2019_2017:  [80, 85, 80, 80],
    y2016_back:  [95, 100, 95, 95],
  },
  other: {
    pending:     [20, 30, 25, 25],
    current:     [30, 40, 35, 35],
    y2025:       [45, 55, 45, 45],
    y2024_2023:  [60, 70, 60, 60],
    y2022_2020:  [75, 80, 75, 75],
    y2019_2017:  [90, 95, 90, 90],
    y2016_back:  [105, 110, 105, 105],
  },
};

// Case Info (flat, yearBand=null) and Case Search (flat $20, yearBand=null).
const CASE_INFO: Record<'Punjab' | 'other', Tier4> = {
  Punjab: [7, 12, 10, 10],
  other: [12, 20, 15, 15],
};
const CASE_SEARCH: Record<'Punjab' | 'other', Tier4> = {
  Punjab: [20, 20, 20, 20],
  other: [20, 20, 20, 20],
};

export function buildUsdPricingRows(): UsdPricingRow[] {
  const rows: UsdPricingRow[] = [];
  for (const region of ['Punjab', 'other'] as const) {
    for (const [yearBand, tiers] of Object.entries(CASE_FILES[region])) {
      TIERS.forEach((courtLevel, i) =>
        rows.push({ flow: 'judicial_case_files', courtLevel, region, yearBand, basePrice: tiers[i] }));
    }
    TIERS.forEach((courtLevel, i) =>
      rows.push({ flow: 'judicial_case_information', courtLevel, region, yearBand: null, basePrice: CASE_INFO[region][i] }));
    TIERS.forEach((courtLevel, i) =>
      rows.push({ flow: 'judicial_case_search', courtLevel, region, yearBand: null, basePrice: CASE_SEARCH[region][i] }));
  }
  return rows;
}

// Expected count: 2 regions × (7 bands + 1 info + 1 search) × 4 tiers = 72.
export const USD_PRICING_ROW_COUNT = 72;
```

- [ ] **Step 2: Insert USD rows in the seed (before the single createMany)**

In `apps/api/scripts/seed-pricing.ts`, import the builder at the top:

```ts
import { buildUsdPricingRows, USD_PRICING_ROW_COUNT } from '../data/usd-pricing';
```

After `const nonJudicialRows = buildNonJudicialPricingRows();` (~line 558) and before `const allRows = [...rows, ...nonJudicialRows];` (~line 560), build the USD rows (match the fuller non-judicial row shape — include `caseStatus`):

```ts
  // USD all-inclusive flat rules (owner list 2026-06-14). Same dimensions as
  // PKR rows but currency='USD'; the resolver short-circuits these to a flat
  // total (no surcharges). Court-tier + region keyed; year bands for Case Files
  // only. Not counted toward the judicial-draft floor (separate currency).
  const YEAR_BAND_RANGES_USD = YEAR_BAND_RANGES; // reuse the canonical ranges
  const usdRows = buildUsdPricingRows().map((d) => {
    const range = d.yearBand ? YEAR_BAND_RANGES_USD[d.yearBand as keyof typeof YEAR_BAND_RANGES] : { yearFrom: null, yearTo: null };
    return {
      name: `USD ${d.flow} ${d.region} ${d.courtLevel}${d.yearBand ? ' ' + d.yearBand : ''}`,
      flow: d.flow,
      courtLevel: d.courtLevel,
      caseStatus: null,
      region: d.region,
      yearBand: d.yearBand,
      yearFrom: range.yearFrom,
      yearTo: range.yearTo,
      setType: null,
      currency: 'USD',
      basePrice: d.basePrice,
      availability: true,
      clerkBaseCost: null,
      pdfSurchargeAmount: 0,
      deliveryGuyFee: 0,
      isLegacy: false,
      isActive: true,
      priority: d.yearBand ? 5 : 0,
    };
  });
  if (usdRows.length !== USD_PRICING_ROW_COUNT) {
    console.error(`USD rows = ${usdRows.length}, expected ${USD_PRICING_ROW_COUNT}. Aborting.`);
    process.exit(1);
  }
```

Change `const allRows = [...rows, ...nonJudicialRows];` to:

```ts
  const allRows = [...rows, ...nonJudicialRows, ...usdRows];
```

> NOTE: the existing PKR `rows.map` (line 530) does NOT set `currency`; that's fine — the column defaults to `'PKR'`. The new `usdRows` set `currency: 'USD'` explicitly. Confirm the `MIN_TOTAL_DRAFTS` floor still only counts `drafts` (judicial xlsx), so adding USD rows does not affect it.

- [ ] **Step 3: Re-seed locally**

Run: `cd apps/api && npx tsx scripts/seed-pricing.ts`
Expected: log line now reports judicial + non-judicial counts; no abort; USD rows inserted (total rises by 72).

- [ ] **Step 4: Write + run the USD smoke test**

Create `apps/api/scripts/smoke-usd-pricing.ts`:

```ts
import { PrismaClient } from '@prisma/client';
import { PricingService } from '../src/pricing/pricing.service';

const prisma = new PrismaClient();

const CASES = [
  { label: 'Punjab Lower Case Files 2024 → $50', input: { flow: 'judicial_case_files', courtLevel: 'Lower Court', region: 'Punjab', caseStatus: 'Decided Case', caseYear: 2024, yearBand: 'y2024_2023', currency: 'USD' }, expect: 50 },
  { label: 'other Special Case Info → $20', input: { flow: 'judicial_case_information', courtLevel: 'Special Court', region: 'other', currency: 'USD' }, expect: 20 },
  { label: 'Punjab High Case Search → $20', input: { flow: 'judicial_case_search', courtLevel: 'High Court', region: 'Punjab', currency: 'USD' }, expect: 20 },
  { label: 'Punjab Lower Case Files pending → $15', input: { flow: 'judicial_case_files', courtLevel: 'Lower Court', region: 'Punjab', caseStatus: 'Pending Case', yearBand: 'pending', currency: 'USD' }, expect: 15 },
];

async function main() {
  const svc = new PricingService(prisma as any);
  let fail = 0;
  for (const c of CASES) {
    const r = await svc.resolve(c.input as any);
    const ok = r.matched && r.available !== false && r.total === c.expect;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${c.label} (got matched=${r.matched} total=${r.total})`);
    if (!ok) fail++;
  }
  if (fail) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
```

Run: `cd apps/api && npx tsx scripts/smoke-usd-pricing.ts`
Expected: 4× PASS, exit 0.

- [ ] **Step 5: Commit**

```bash
git add apps/api/data/usd-pricing.ts apps/api/scripts/seed-pricing.ts apps/api/scripts/smoke-usd-pricing.ts
git commit -m "feat(pricing): seed USD price list + USD resolve smoke test"
```

---

### Task B4: Intake — pass consumer currency to resolver, stamp Ticket.currency, USD = ONE_TIME, no tax/promo

**Files:**
- Modify: `apps/api/src/tickets/tickets.service.ts` (`createIntakeTicket` 507-781; `assembleIntakeMoney` 2658-2684)
- Test: `apps/api/src/tickets/intake-currency.spec.ts` (new)

**Interfaces:**
- Consumes: `deriveCurrency` indirectly via `User.currency`; `paymentModelFor(flow, currency)`, `buildPricingResolveInput(flow, payload, currency)`
- Produces: `Ticket.currency` stamped from the consumer's `User.currency`; USD tickets billed full `total` (ONE_TIME), `taxRate = 0`, promo rejected.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/tickets/intake-currency.spec.ts`. Mirror the existing `createIntakeTicket` test setup (read a neighbouring tickets spec for the mock shape first), then assert:

```ts
// Pseudocode shape — adapt mocks to the real constructor + helpers.
describe('createIntakeTicket currency', () => {
  it('stamps Ticket.currency from the consumer and bills USD as ONE_TIME full total', async () => {
    // consumer User.currency = 'USD'; pricing.resolve stubbed to return a flat
    // USD result { matched:true, serviceCost:50, total:50, ... }.
    // EXPECT tx.ticket.create called with data.currency === 'USD'
    //   and data.totalAmount === 50 (full total, not a SPLIT phase-1 base)
    //   and data.taxAmount === 0.
  });
  it('rejects a promo code for a USD ticket', async () => {
    // consumer currency USD + dto.promoCode set → BadRequestException.
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && pnpm test -- --testPathPattern=intake-currency`
Expected: FAIL.

- [ ] **Step 3: Load the consumer's currency + build the resolve input with it**

In `createIntakeTicket`, after `await this.ensureUserExists(dto.consumerId);` (line 514), load the consumer's currency:

```ts
    const consumer = await this.prisma.user.findUniqueOrThrow({
      where: { id: dto.consumerId },
      select: { currency: true },
    });
    const currency = (consumer.currency as 'PKR' | 'USD') ?? 'PKR';
```

Change the resolve call (lines 555-557) to pass currency:

```ts
    const pricing = await this.pricingService.resolve(
      buildPricingResolveInput(dto.flow, payload, currency),
    );
```

- [ ] **Step 4: USD ⇒ no tax, reject promo**

Replace the tax read (line 587):

```ts
    // USD orders are taxed at 0 and cannot use promo codes (owner spec).
    const taxRate = currency === 'USD' ? 0 : ((await this.settingsService?.getTaxRate?.()) ?? 0);
```

Right before the promo-validation block (line 598), add:

```ts
    if (currency === 'USD' && dto.promoCode) {
      throw new BadRequestException('Promo codes are not available for international (USD) orders.');
    }
```

Also make the promo subtotal use the currency-aware payment model — change the `paymentModelFor(dto.flow)` at line 604 to `paymentModelFor(dto.flow, currency)`.

- [ ] **Step 5: Bill USD as ONE_TIME + stamp currency**

Change the `assembleIntakeMoney` call (lines 619-627) to pass currency:

```ts
    const assembled = pricing.matched
      ? TicketsService.assembleIntakeMoney({
          flow: dto.flow,
          currency,
          serviceCost: pricing.serviceCost,
          deliveryCharge: pricing.deliveryCharge,
          taxRate,
          promoDiscount,
        })
      : null;
```

Add `currency,` to the `tx.ticket.create({ data: { … } })` object (e.g. after `serviceCost:` line 651):

```ts
            serviceCost: pricing.matched ? pricing.serviceCost : 0,
            currency,
```

Update `assembleIntakeMoney` (lines 2658-2684) to take currency and use it for the SPLIT decision:

```ts
  static assembleIntakeMoney(args: {
    flow: string;
    currency?: 'PKR' | 'USD';
    serviceCost: number;
    deliveryCharge: number;
    taxRate: number;
    promoDiscount: number;
    discountPrice?: number;
  }) {
    const isSplit = paymentModelFor(args.flow, args.currency) === 'SPLIT';
    // …unchanged body…
```

> Because the USD resolver returns `serviceCost === total` and `paymentModelFor(flow,'USD')` is `ONE_TIME`, `isSplit` is false and the ticket bills the full flat total at intake. No further change needed for the USD ONE_TIME requirement.

- [ ] **Step 6: Run tests + typecheck**

Run: `cd apps/api && pnpm test -- --testPathPattern="intake-currency|tickets" && cd .. && pnpm typecheck`
Expected: PASS (new tests green; existing tickets tests still green).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/tickets/tickets.service.ts apps/api/src/tickets/intake-currency.spec.ts
git commit -m "feat(tickets): stamp Ticket.currency, bill USD ONE_TIME, no tax/promo for USD"
```

---

## Phase C — Wallet currency

### Task C1: Wallet + login payload expose currency; transactions stamp User.currency

**Files:**
- Modify: `apps/api/src/wallet/wallet.service.ts` (`getMyWallet` 312-351; `applyPaymentToTicket` 589-629; any `adjustWallet`/`topup` hardcoded `'PKR'`)
- Modify: `apps/api/src/auth/auth.service.ts` (the login/`issueTokensForUser` response that the FE stores as `wusuq_user` — add `currency`)
- Test: `apps/api/src/wallet/wallet-currency.spec.ts` (new)

**Interfaces:**
- Produces: `getMyWallet` returns `{ balance, credit, due, currency, transactions }`; wallet transaction rows carry the user's currency; the login `user` object includes `currency`.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/wallet/wallet-currency.spec.ts`:

```ts
// Stub PrismaService: user.findUniqueOrThrow returns { walletBalance: 0, currency: 'USD', ... };
// ticket.findMany returns []. EXPECT getMyWallet(userId).currency === 'USD'.
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && pnpm test -- --testPathPattern=wallet-currency`
Expected: FAIL — `currency` not returned.

- [ ] **Step 3: Return currency from getMyWallet**

In `wallet.service.ts` `getMyWallet`, add `currency: true` to the user `select` (line 315) and `currency: user.currency` to the returned object (after `due,` line 344).

- [ ] **Step 4: Stamp the user's currency on auto-deduction rows**

In `applyPaymentToTicket` (line 589), accept the user's currency and use it instead of the hardcoded `'PKR'` (line 622). The simplest correct approach: read it once in the caller (`clearPendingTickets`) — it already has `userId` — and thread it down. In `clearPendingTickets` (line 506), after fetching candidates, load the user's currency once:

```ts
    const { currency } = await tx.user.findUniqueOrThrow({
      where: { id: userId }, select: { currency: true },
    });
```
Pass `currency` into `applyPaymentToTicket` and change line 622 from `currency: 'PKR',` to `currency,`. Apply the same fix to any other `currency: 'PKR'` literal in `adjustWallet` (the agent noted line ~473) — read the user's currency there too. Leave `topup` (passes `dto.currency`) as-is but ensure the wallet UI sends the right currency (Phase D).

- [ ] **Step 5: Add currency to the login user object**

Find where the login response builds the `user` object returned to the client (in `auth.service.ts` — the method that returns `{ accessToken, refreshToken, user }`; `issueTokensForUser` at 269-295 returns tokens, the caller assembles `user`). Add `currency` (and `country`) to the selected user fields and to the returned `user` object so the FE's `wusuq_user` localStorage carries it.

- [ ] **Step 6: Run tests + typecheck**

Run: `cd apps/api && pnpm test -- --testPathPattern="wallet-currency|wallet" && cd .. && pnpm typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/wallet/wallet.service.ts apps/api/src/auth/auth.service.ts apps/api/src/wallet/wallet-currency.spec.ts
git commit -m "feat(wallet): expose currency on /wallet/me + login user, stamp user currency on ledger rows"
```

---

## Phase D — Frontend

### Task D1: Wizard — read currency, gate service menu, USD checkout (no tax/promo/add-ons)

**Files:**
- Modify: `apps/web/components/intake-wizard/types.ts` (add `currency` to `LocalUser`)
- Modify: `apps/web/components/intake-wizard.tsx` (user load 802-824; tax fetch 394-400; `checkoutSummary` 1587-1767; resolve-call site; service-menu gating)
- Modify: `apps/web/components/intake-wizard/checkout-panel.tsx` (`formatAmount` 36-47 → use shared `formatMoney`)
- Test: `apps/web/tests/e2e/usd-pricing.spec.ts` (new, mock-API pattern — mirror `pricing-tax-promo.spec.ts`)

**Interfaces:**
- Consumes: `formatMoney`, `paymentModelFor(flow, currency)`, `Currency` from `@wusuq/shared`; `/wallet/me` `currency`
- Produces: a `currency` state in the wizard driving the resolve call, the service menu, and the checkout display.

- [ ] **Step 1: Add `currency` to `LocalUser` + read it**

`apps/web/components/intake-wizard/types.ts` line 33:

```ts
export type LocalUser = { id: string; name?: string; email?: string; role?: string; currency?: 'PKR' | 'USD' };
```

In `intake-wizard.tsx`, add a `currency` state (near `taxRate`, ~line 255):

```ts
  const [currency, setCurrency] = useState<'PKR' | 'USD'>('PKR');
```

In the mount user-load effect (802-824), seed from `wusuq_user` and (authoritative) fetch `/wallet/me`:

```ts
      if (user?.currency) startTransition(() => setCurrency(user.currency!));
```
And alongside the tax fetch (394-400) add:

```ts
  useEffect(() => {
    apiClient.get<{ currency?: 'PKR' | 'USD' }>('/wallet/me')
      .then((r) => { if (r.currency) startTransition(() => setCurrency(r.currency!)); })
      .catch(() => {});
  }, []);
```

- [ ] **Step 2: USD ⇒ tax forced to 0**

Where `taxRate` is fetched (394-400), gate it: if `currency === 'USD'`, keep `taxRate` at 0 (skip applying the fetched rate). Simplest: in the `checkoutSummary` memo, use `const effectiveTaxRate = currency === 'USD' ? 0 : taxRate;` and pass `effectiveTaxRate` to `computeTicketTotal` and the tax-line guard. Add `currency` to the memo dependency array (line 1767).

- [ ] **Step 3: Pass currency to the resolve preview call**

Find the wizard's debounced `POST /pricing-rules/resolve` call (it builds the body from the payload). Add `currency` to that request body so the live preview returns USD prices for USD users. (The server is authoritative on the persisted charge; this keeps the quote consistent.)

- [ ] **Step 4: USD checkout — flat total, hide add-on lines + promo**

In `checkoutSummary`:
- Compute `const isUsd = currency === 'USD';`
- When `isUsd`, skip pushing the surcharge line items (title/age/pdf/search-both/cities/delivery/attested/non-attested) — for USD the resolver returns them all 0 anyway, but also skip the promo line and tax line. Push a single `{ label: 'Service fee', amount: pr.total }` (or keep the existing `Base fee` line since `pr.basePrice === pr.total` for USD).
- Set the return `currency` to the live `currency` value (replace the hardcoded `currency: 'PKR'` at line 1765 with `currency,`).
- Disable the instant year-driven patch when `isUsd` (USD is a flat lookup): wrap the `const pr = (() => {…})()` body so it returns `pricingResult` unchanged when `isUsd`.

Hide the promo input for USD: wherever `promoSlot` / promo UI is rendered, render it only when `currency === 'PKR'`.

- [ ] **Step 5: Gate the service menu + add-on inputs**

Where the wizard chooses available flows / renders the service list (the route reads `judicialFlows`/`nonJudicialFlows` from `lib/intake-flows.ts`), filter to the USD-allowed set when `currency === 'USD'`:

```ts
const USD_ALLOWED_FLOWS = new Set([
  'judicial_case_files', 'judicial_case_information', 'judicial_case_search',
]);
// when currency === 'USD', only show flows in USD_ALLOWED_FLOWS;
// hide nonJudicialFlows entirely and Case Filing / PoA.
```
Also hide the Set Type picker and the "PDF before dispatch" toggle for USD (they don't affect the flat price) — gate their step/field rendering on `currency === 'PKR'`.

> If a USD user deep-links to a hidden flow (e.g. `…/power-of-attorney`), show a "not available in your region" notice and block submit. The server already rejects (no USD rule → `No pricing rule matched`), so this is a UX guard.

- [ ] **Step 6: checkout-panel uses shared formatMoney**

In `apps/web/components/intake-wizard/checkout-panel.tsx`, replace the local `formatAmount` (36-47) with the shared helper:

```tsx
import { formatMoney } from '@wusuq/shared';

function formatAmount(amount: number | null, currency: string): string {
  if (amount === null || amount === undefined) return '—';
  return formatMoney(amount, currency === 'USD' ? 'USD' : 'PKR');
}
```

- [ ] **Step 7: Write + run the E2E (mock-API)**

Create `apps/web/tests/e2e/usd-pricing.spec.ts` mirroring `tests/e2e/pricing-tax-promo.spec.ts`: mock `/wallet/me` → `{ currency: 'USD', … }`, mock `/pricing-rules/resolve` → a flat USD result, drive the wizard, and assert the checkout shows `$`, no tax line, no promo box, and that PoA/non-judicial tiles are absent. (Consumer-checkout interaction may be `fixme` pending the shared intake-wizard driver — match the existing gap.)

Run: `pnpm e2e -- usd-pricing` (or the project's E2E invocation)
Expected: PASS (or documented `fixme`).

- [ ] **Step 8: Lint + typecheck + build web**

Run: `pnpm lint && pnpm typecheck && pnpm --filter web build`
Expected: PASS (watch the React 19 `set-state-in-effect` rule — the new fetches use `startTransition`, per the existing pattern).

- [ ] **Step 9: Commit**

```bash
git add apps/web/components/intake-wizard.tsx apps/web/components/intake-wizard/types.ts apps/web/components/intake-wizard/checkout-panel.tsx apps/web/tests/e2e/usd-pricing.spec.ts
git commit -m "feat(web): currency-aware intake wizard — USD menu gating + flat checkout"
```

---

### Task D2: Replace PKR-hardcoded money displays with `formatMoney(currency)`

**Files (each a money-display surface; currency source noted):**
- `apps/web/components/consumer-ticket-board.tsx` (currency = `ticket.currency`) — lines 130-132 (helper), 441, 444, 484, 718, 719, 815, 821, 826, 886
- `apps/web/app/(consumer)/consumer/tickets/[id]/pay/page.tsx` (currency = the ticket's currency from its fetch) — 34-35 (helper), 190, 323, 407, 419
- `apps/web/app/(consumer)/consumer/dashboard/page.tsx` (currency = `/wallet/me` currency) — 118-119 (helper), 261, 263, 371
- `apps/web/components/consumer-wallet-board.tsx` (currency = `data.currency` from `/wallet/me`) — 53-54 (helper), 127, 133, 135, 196
- `apps/web/components/ui/shell-topbar.tsx` (currency = `/wallet/me` currency) — 180
- Test: extend the wallet/dashboard E2E or add a render assertion that a USD ticket shows `$`.

**Interfaces:**
- Consumes: `formatMoney` (shared), each surface's currency source.

- [ ] **Step 1: Replace each local `formatPKR` helper with a currency-aware call**

For every site above, delete the local `formatPKR`/`rs` helper and replace usages with `formatMoney(value, currency)` where `currency` comes from the noted source. Worked example for `consumer-ticket-board.tsx`:

Remove (lines 130-132):
```tsx
function formatPKR(value: number | string | null | undefined) { /* … */ }
```
Add the import: `import { formatMoney } from '@wusuq/shared';`
Replace line 441 `PKR {formatPKR(total)}` with `{formatMoney(total, ticketCurrency)}` where `ticketCurrency = (ticket.currency as 'PKR'|'USD') ?? 'PKR'`. Apply the same pattern to 444/484/718/719/815/821/826/886 (note 444 builds a composite string — use `${formatMoney(remaining, ticketCurrency)} due${paid > 0 ? ` · ${formatMoney(paid, ticketCurrency)} paid` : ''}`). The `PKR ` literal prefixes are dropped because `formatMoney` includes the symbol.

> The consumer `findOne`/`findAll` ticket payloads must include `currency`. Verify the API ticket serializers return `currency`; if not, add `currency` to the ticket `select`/response (it's a non-sensitive field — safe for consumers). This is a prerequisite for the ticket-scoped surfaces.

- [ ] **Step 2: Wire wallet-scoped surfaces to `/wallet/me` currency**

`dashboard/page.tsx`, `consumer-wallet-board.tsx`, `shell-topbar.tsx` read `balance/credit/due` from `/wallet/me` — also read `currency` from the same payload and pass it to `formatMoney`. Example (`shell-topbar.tsx` line 180):
```tsx
<span className="tabular-nums">{formatMoney(walletBalance, walletCurrency)}</span>
```

- [ ] **Step 3: Lint + typecheck + build**

Run: `pnpm lint && pnpm typecheck && pnpm --filter web build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web
git commit -m "feat(web): currency-aware money formatting on consumer ticket/wallet surfaces"
```

---

### Task D3: Profile country persistence + currency chip; signup sends country

**Files:**
- Modify: `apps/web/app/(auth)/consumer/signup/page.tsx` (send `country` in the signup POST)
- Modify: `apps/web/app/(auth)/consumer/login/hooks/use-login-flow.ts` (send `country` in the profile-complete POST, lines ~101-109)
- Modify: `apps/web/app/(auth)/consumer/login/steps/profile-step.tsx` (country picker already exists — wire its value into the submit)
- Modify: `apps/web/components/consumer-profile-board.tsx` (show a read-only currency/region chip)
- Test: extend an existing auth E2E or add an assertion that signup includes `country`.

**Interfaces:**
- Consumes: `CountryPicker` / `countries.ts` (existing), `/wallet/me` currency
- Produces: signup + profile-complete include `country`; profile shows the derived currency.

- [ ] **Step 1: Send `country` from signup**

In `signup/page.tsx`, the country picker `countryCode` already exists. Add `country: countryCode` to the signup POST body (alongside the composed `phone`).

- [ ] **Step 2: Send `country` from profile completion**

In `use-login-flow.ts` (profile submit ~101-109), add `country: countryCode` to the `completeProfile` payload (the `countryCode` from `profile-step.tsx`). Ensure `profile-step.tsx` lifts its `countryCode` into the hook's submit (it currently holds it in local state — thread it via the hook).

- [ ] **Step 3: Show a currency/region chip on the profile**

In `consumer-profile-board.tsx`, fetch `/wallet/me` (or read `wusuq_user.currency`) and render a small read-only chip: `Billing region: Pakistan (PKR)` or `International (USD)`. Note inline that currency is set from the phone and locked once the account is active.

- [ ] **Step 4: Lint + typecheck + build**

Run: `pnpm lint && pnpm typecheck && pnpm --filter web build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web): persist country at signup/profile + show billing-currency chip"
```

---

## Final verification (run after all phases)

- [ ] `pnpm --filter @wusuq/shared build`
- [ ] `pnpm lint`
- [ ] `pnpm typecheck`
- [ ] `pnpm build`
- [ ] `cd apps/api && pnpm test` (all unit tests green)
- [ ] `cd apps/api && npx tsx scripts/seed-pricing.ts && npx tsx scripts/smoke-pricing.ts && npx tsx scripts/smoke-usd-pricing.ts` (PKR smoke unchanged; USD smoke green)
- [ ] Manual: create a USD consumer (non-+92 phone), confirm the wizard shows only Case Files / Case Info / Case Search, a `$` flat total with no tax/promo, and the ticket persists `currency='USD'` with `totalAmount === serviceCost`.
- [ ] Manual: confirm a PKR consumer is completely unchanged (rates, SPLIT Case Files, tax, promo).

## Self-review notes (spec coverage)

- Currency derivation (spec §1) → A1, A4. Lock rule (§ decision 8) → A4 step 6.
- Data model (spec §2) → A3 (PricingRule/Ticket currency + unique key), A1 (User reuse).
- USD resolver flat short-circuit (spec §3) → B1, B2. Seed (§6) → B3.
- Payment ONE_TIME + stamp + no tax/promo (spec §4) → B4. Wallet per-currency (§4) → C1.
- Frontend formatting + menu gating + add-on hiding (spec §5) → D1, D2, D3.
- Out of scope (OTP/SMS, FX, USD non-judicial/Filing/PoA) → untouched; wizard hides the latter in D1.
