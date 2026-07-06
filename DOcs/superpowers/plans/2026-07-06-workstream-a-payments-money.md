# Workstream A — Payments & Money-Timing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the four urgent payment/money items — freeze the consumer total until admin approval, unblock top-up/pay submission, add a method→details picker, and tax the base charge only.

**Architecture:** Four mostly-independent changes across shared/api/web. B4 is a deletion in `submitClerkCosts`; B5 is a DTO relax + enum-key alignment; C1 is a single edit to `computeTicketTotal`; C6 is a shared payment-details block reused by the pay page and top-up modal. No schema changes.

**Tech Stack:** NestJS/Prisma (`apps/api`), Next.js 16/React 19 (`apps/web`), TS shared (`packages/shared`); Jest (API + web unit), Playwright (web e2e).

**Spec:** `DOcs/superpowers/specs/2026-07-06-workstream-a-payments-money-design.md`.

## Global Constraints

- **`computeTicketTotal` (@wusuq/shared) is the ONLY ticket-total formula.** Never hand-roll a total. B4 removes a hand-rolled sum that violated this.
- **Taxable base = `serviceCost + additionalServiceCost`** (confirmed). Delivery/printing/attested/non-attested/additionalCharges are NOT taxed. Discount reduces the taxable base (floored at 0) and the whole-bill total.
- **Payment methods = Bank Transfer + JazzCash + EasyPaisa** (confirmed; no Cash). A method renders only when its `PaymentSettings` fields are populated.
- **Payment-mode enum values:** `BANK_TRANSFER`, `JAZZ_CASH`, `EASY_PAISA` (`PAYMENT_MODES`, `packages/shared/src/index.ts:42`). The web must submit these exact values as `paymentMode`.
- **Conditional status transitions stay conditional** (audit 2.1) — B4 does not touch the `updateMany({where:{id,status}})` contract, only the `data` payload.
- React 19 `set-state-in-effect`: wrap setState-in-effect in `startTransition` (CLAUDE.md).
- Run `pnpm typecheck` + `pnpm lint` (both apps) and the relevant tests before each commit. Commit messages end with: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

## File Structure

- **Modify** `packages/shared/src/index.ts` — `computeTicketTotal` taxable-base (C1).
- **Modify** `apps/api/src/tickets/tickets.service.ts` — `submitClerkCosts` drop `totalAmount` write (B4).
- **Modify** `apps/api/src/wallet/dto/topup-wallet.dto.ts` — `receiptUrl` validator (B5).
- **Create** `apps/web/components/payment-method-details.tsx` — shared method-picker + details block (C6).
- **Modify** `apps/web/components/consumer-wallet-board.tsx` — top-up modal enum keys (B5) + use the shared block (C6).
- **Modify** `apps/web/app/(consumer)/consumer/tickets/[id]/pay/page.tsx` — use the shared block + wire `paymentMode` (C6, benefits from B5).
- **Tests:** extend API money/ticket specs; web unit test for the new component.

Tasks are ordered to be independently reviewable. Task 1 (C1) and Task 2 (B4) are API/shared and interact through `finalizeRemainderCore`; do them first and together verify the money flow.

---

### Task 1: Tax the base only in `computeTicketTotal` (C1)

**Files:**
- Modify: `packages/shared/src/index.ts` (`computeTicketTotal`, ~793-809)
- Test: `apps/api/src/tickets/walkthrough-fixes.spec.ts` (or the nearest money spec that imports `computeTicketTotal` from `@wusuq/shared`)

**Interfaces:**
- Produces: `computeTicketTotal(input): { chargesSubtotal, discountTotal, taxableBase, taxAmount, totalAmount }` — unchanged signature; `taxableBase` now means the *service* base (serviceCost+additionalServiceCost) minus discount, and `totalAmount` keeps the non-taxed charges.

- [ ] **Step 1: Write the failing tests**

```ts
// apps/api/src/tickets/tax-base-only.spec.ts
import { computeTicketTotal } from '@wusuq/shared';

const base = {
  charges: {
    serviceCost: 500, deliveryCharges: 300, printingCharges: 50,
    attestedCharges: 0, nonAttestedCharges: 0, additionalCharges: 0,
    additionalServiceCost: 0,
  },
  discountPrice: 0, promoDiscount: 0, taxRate: 0.17,
};

describe('computeTicketTotal — tax on base only (C1)', () => {
  it('taxes serviceCost only, keeps other charges untaxed in the total', () => {
    const r = computeTicketTotal(base);
    expect(r.chargesSubtotal).toBe(850);
    expect(r.taxAmount).toBe(85);          // 500 * 0.17, NOT 850 * 0.17
    expect(r.totalAmount).toBe(935);       // 850 + 85
  });

  it('includes additionalServiceCost in the taxable base', () => {
    const r = computeTicketTotal({ ...base, charges: { ...base.charges, additionalServiceCost: 200 } });
    expect(r.taxAmount).toBe(round2((500 + 200) * 0.17));   // 119
    expect(r.totalAmount).toBe(round2(1050 - 0 + 119));     // 850+200 = 1050 subtotal + 119 tax
  });

  it('discount reduces the taxable base and floors at 0', () => {
    const r = computeTicketTotal({ ...base, discountPrice: 600 }); // discount > serviceBase(500)
    expect(r.taxableBase).toBe(0);
    expect(r.taxAmount).toBe(0);
    expect(r.totalAmount).toBe(250);       // max(0, 850 - 600) + 0
  });

  it('USD-style zero rate yields no tax', () => {
    const r = computeTicketTotal({ ...base, taxRate: 0 });
    expect(r.taxAmount).toBe(0);
    expect(r.totalAmount).toBe(850);
  });
});

function round2(n: number) { return Math.round(n * 100) / 100; }
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/api && pnpm test -- --testPathPattern=tax-base-only`
Expected: FAIL — current code taxes 850 → taxAmount 144.5, total 994.5.

- [ ] **Step 3: Implement**

In `packages/shared/src/index.ts`, replace the body of `computeTicketTotal` money math:

```ts
export function computeTicketTotal(input: TicketMoneyInput): TicketMoneyResult {
  const c = input.charges;
  const chargesSubtotal = round2(
    c.serviceCost + c.deliveryCharges + c.printingCharges + c.attestedCharges +
      c.nonAttestedCharges + c.additionalCharges + c.additionalServiceCost,
  );
  const discountTotal = round2((input.discountPrice ?? 0) + (input.promoDiscount ?? 0));
  // C1: tax the service base only (serviceCost + additionalServiceCost).
  // Delivery/printing/attested/non-attested/additionalCharges are NOT taxed.
  const serviceBase = round2(c.serviceCost + c.additionalServiceCost);
  const taxableBase = Math.max(0, round2(serviceBase - discountTotal));
  const taxAmount = round2(taxableBase * (input.taxRate ?? 0));
  const totalAmount = round2(Math.max(0, round2(chargesSubtotal - discountTotal)) + taxAmount);
  return { chargesSubtotal, discountTotal, taxableBase, taxAmount, totalAmount };
}
```

- [ ] **Step 4: Rebuild shared + run tests**

Run: `pnpm --filter @wusuq/shared build && cd apps/api && pnpm test -- --testPathPattern=tax-base-only`
Expected: PASS (4 tests).

- [ ] **Step 5: Run the full API suite to catch any money-total assertions that assumed whole-bill tax**

Run: `cd apps/api && pnpm test`
Expected: PASS. If a pre-existing spec asserted a whole-bill-tax total for a ticket WITH phase-2 charges, update that expected value to the base-only figure (the new behavior is correct per spec). Note any such change in your report.

- [ ] **Step 6: Typecheck + commit**

```bash
pnpm --filter @wusuq/shared build && (cd apps/api && pnpm typecheck)
git add packages/shared/src/index.ts apps/api/src/tickets/tax-base-only.spec.ts
git commit -m "feat(pricing): tax base+additionalServiceCost only, not the whole bill (C1)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Freeze consumer total at clerk-submit (B4)

**Files:**
- Modify: `apps/api/src/tickets/tickets.service.ts` (`submitClerkCosts`, ~2222-2314)
- Test: `apps/api/src/tickets/clerk-submit-no-total.spec.ts`

**Interfaces:**
- Consumes: `computeTicketTotal` (Task 1) indirectly via `finalizeRemainderCore` (unchanged).
- Produces: `submitClerkCosts` persists charge columns + `noOfPages`/`costPerPage` + `clerkApprovalStatus:'SUBMITTED'` + `status:'WAITING_APPROVAL'` and NO LONGER writes `totalAmount`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/tickets/clerk-submit-no-total.spec.ts
// Follows the existing harness pattern in walkthrough-fixes.spec.ts:
// build a TicketsService with a mock prisma whose ticket.updateMany captures `data`,
// and a ticket in IN_PROGRESS with serviceCost 800, totalAmount 800.
import { makeService, submitClerkPrisma } from './__helpers__/ticket-test-harness'; // if a shared harness exists; otherwise inline the mock like walkthrough-fixes.spec.ts

describe('submitClerkCosts — does not move the consumer total (B4)', () => {
  it('persists phase-2 charges + advances to WAITING_APPROVAL but leaves totalAmount unchanged', async () => {
    const prisma = submitClerkPrisma({ status: 'IN_PROGRESS', serviceCost: 800, totalAmount: 800 });
    const service = makeService(prisma);
    await service.submitClerkCosts('ticket-1',
      { deliveryCharges: 300, printingCharges: 50, noOfPages: 10, costPerPage: 5 } as never,
      { actorUserId: 'rep-1', actorRole: 'representative' });
    const data = prisma.tx.ticket.updateMany.mock.calls[0][0].data;
    expect(data.status).toBe('WAITING_APPROVAL');
    expect(data.clerkApprovalStatus).toBe('SUBMITTED');
    expect(data.deliveryCharges).toBe(300);
    expect(data.printingCharges).toBe(50);
    expect(data.noOfPages).toBe(10);
    expect(data.costPerPage).toBe(5);
    expect('totalAmount' in data).toBe(false);   // ← the fix: no total write
  });
});
```

(If no reusable harness exists, inline the prisma mock exactly as `walkthrough-fixes.spec.ts` does — a `tx` object with `ticket.updateMany` (mock returning `{count:1}`), `ticketStatusHistory.create`, a top-level `ticket.findUnique` returning the IN_PROGRESS ticket, and `$transaction` invoking the callback with `tx`. Do NOT create a shared harness file unless one already exists.)

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/api && pnpm test -- --testPathPattern=clerk-submit-no-total`
Expected: FAIL — `data` currently includes `totalAmount`.

- [ ] **Step 3: Implement — remove the hand-rolled total**

In `submitClerkCosts`, delete the `const totalAmount = …` computation (the `Number(ticket.serviceCost) + deliveryCharges + … - Number(ticket.discountPrice)` block, ~2258-2266) and remove the `totalAmount,` line from the `updateMany` `data` (~2296). Leave everything else (charge columns, `noOfPages`, `costPerPage`, `clerkApprovalStatus`, `status`, the conditional `where`, and the history row) intact.

- [ ] **Step 4: Run tests**

Run: `cd apps/api && pnpm test -- --testPathPattern=clerk-submit-no-total`
Expected: PASS.

- [ ] **Step 5: Full API suite**

Run: `cd apps/api && pnpm test`
Expected: PASS. If a pre-existing test asserted a bumped `totalAmount` after `submitClerkCosts`, update it to assert the total is unchanged (the new, correct behavior). Note it in your report.

- [ ] **Step 6: Typecheck + commit**

```bash
cd apps/api && pnpm typecheck
git add apps/api/src/tickets/tickets.service.ts apps/api/src/tickets/clerk-submit-no-total.spec.ts
git commit -m "fix(tickets): consumer total unchanged at clerk-submit; only reviewAndComplete finalizes (B4)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Unblock top-up/pay — DTO + enum keys (B5)

**Files:**
- Modify: `apps/api/src/wallet/dto/topup-wallet.dto.ts` (~25-33)
- Modify: `apps/web/components/consumer-wallet-board.tsx` (~300-304 option keys; ~259-264 submit)
- Test: `apps/api/src/wallet/topup-wallet.dto.spec.ts`

**Interfaces:**
- Produces: `TopupWalletDto.receiptUrl` validated as `@IsString()`; the top-up modal submits `paymentMode ∈ {BANK_TRANSFER, JAZZ_CASH, EASY_PAISA}`.

- [ ] **Step 1: Write the failing DTO test**

```ts
// apps/api/src/wallet/topup-wallet.dto.spec.ts
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { TopupWalletDto } from './dto/topup-wallet.dto';

async function errs(obj: Record<string, unknown>) {
  const dto = plainToInstance(TopupWalletDto, obj);
  return (await validate(dto)).flatMap((e) => Object.values(e.constraints ?? {}));
}

describe('TopupWalletDto (B5)', () => {
  const okBase = { amount: 5000, paymentMode: 'JAZZ_CASH', currency: 'PKR' };
  it('accepts an app-relative receiptUrl', async () => {
    expect(await errs({ ...okBase, receiptUrl: '/wallet/receipt/x.jpg' })).toEqual([]);
  });
  it('accepts JAZZ_CASH / EASY_PAISA / BANK_TRANSFER', async () => {
    for (const paymentMode of ['JAZZ_CASH', 'EASY_PAISA', 'BANK_TRANSFER']) {
      expect(await errs({ ...okBase, paymentMode })).toEqual([]);
    }
  });
  it('rejects an unknown paymentMode', async () => {
    expect((await errs({ ...okBase, paymentMode: 'JAZZCASH' })).join()).toMatch(/paymentMode/);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/api && pnpm test -- --testPathPattern=topup-wallet.dto`
Expected: FAIL on the relative-URL case (`@IsUrl` rejects `/wallet/receipt/x.jpg`).

- [ ] **Step 3: Implement the DTO change**

In `apps/api/src/wallet/dto/topup-wallet.dto.ts`, change the `receiptUrl` decorator from `@IsUrl({ require_tld: false })` to `@IsString()` (keep `@IsOptional()`). Remove the now-unused `IsUrl` import if nothing else uses it.

- [ ] **Step 4: Fix the web enum keys**

In `apps/web/components/consumer-wallet-board.tsx` (~300-304), change the option `key`s to enum values and drop Cash:
```tsx
const PAYMENT_MODE_OPTIONS = [
  { key: 'BANK_TRANSFER', label: 'Bank transfer' },
  { key: 'JAZZ_CASH', label: 'JazzCash' },
  { key: 'EASY_PAISA', label: 'Easypaisa' },
];
```
Confirm the submit (~259-264) sends the selected option's `key` as `paymentMode` (it already sends the clicked key — just verify no separate mapping). If the default `paymentMode` state was `'BANK_TRANSFER'`, leave it.

- [ ] **Step 5: Run DTO test + typecheck both apps**

Run: `cd apps/api && pnpm test -- --testPathPattern=topup-wallet.dto && pnpm typecheck`
Then: `cd apps/web && pnpm typecheck && pnpm lint`
Expected: PASS / clean.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/wallet/dto/topup-wallet.dto.ts apps/api/src/wallet/topup-wallet.dto.spec.ts apps/web/components/consumer-wallet-board.tsx
git commit -m "fix(payments): accept app-relative receiptUrl + align paymentMode enum keys (B5)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Shared payment-method details block (C6) — component

**Files:**
- Create: `apps/web/components/payment-method-details.tsx`
- Test: `apps/web/components/payment-method-details.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  export type PayMethod = 'BANK_TRANSFER' | 'JAZZ_CASH' | 'EASY_PAISA';
  export interface PaymentSettingsView {
    bankName?: string | null; accountTitle?: string | null; accountNumber?: string | null;
    iban?: string | null; jazzCash?: string | null; easyPaisa?: string | null;
    instructions?: string | null;
  }
  // Returns the methods that are configured (non-empty) in settings, in a stable order.
  export function availableMethods(s: PaymentSettingsView | null | undefined): PayMethod[];
  // Controlled picker + details block. Calls onChange when the user switches method.
  export function PaymentMethodDetails(props: {
    settings: PaymentSettingsView | null | undefined;
    method: PayMethod | null;
    onChange: (m: PayMethod) => void;
  }): JSX.Element | null;   // null when no method is configured
  ```

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/components/payment-method-details.test.tsx
import { render, screen } from '@testing-library/react';
import { availableMethods, PaymentMethodDetails } from './payment-method-details';

const settings = { bankName: 'Allied Bank', accountTitle: 'Ali Zain', accountNumber: '0288...', jazzCash: '03004680800', easyPaisa: '' };

describe('availableMethods', () => {
  it('lists only configured methods (bank + jazzcash; not easypaisa)', () => {
    expect(availableMethods(settings)).toEqual(['BANK_TRANSFER', 'JAZZ_CASH']);
  });
  it('empty settings → no methods', () => {
    expect(availableMethods({})).toEqual([]);
  });
});

describe('PaymentMethodDetails', () => {
  it('shows only the selected method details', () => {
    render(<PaymentMethodDetails settings={settings} method="BANK_TRANSFER" onChange={() => {}} />);
    expect(screen.getByText('Allied Bank')).toBeInTheDocument();
    expect(screen.queryByText('03004680800')).not.toBeInTheDocument();
  });
  it('JazzCash selected shows the jazzcash number, not bank', () => {
    render(<PaymentMethodDetails settings={settings} method="JAZZ_CASH" onChange={() => {}} />);
    expect(screen.getByText('03004680800')).toBeInTheDocument();
    expect(screen.queryByText('Allied Bank')).not.toBeInTheDocument();
  });
});
```

(This uses `@testing-library/react`. If it is not already a web devDependency, the web Jest runner added in the previous session supports it — add `@testing-library/react` + `@testing-library/jest-dom` + a `jsdom` testEnvironment for this test file. If adding jsdom is heavier than the task warrants, instead test only `availableMethods` (pure) here and verify the render manually + in the e2e of Task 5; note the choice in your report.)

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/web && pnpm test -- payment-method-details`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the component**

```tsx
// apps/web/components/payment-method-details.tsx
export type PayMethod = 'BANK_TRANSFER' | 'JAZZ_CASH' | 'EASY_PAISA';
export interface PaymentSettingsView {
  bankName?: string | null; accountTitle?: string | null; accountNumber?: string | null;
  iban?: string | null; jazzCash?: string | null; easyPaisa?: string | null;
  instructions?: string | null;
}
const LABELS: Record<PayMethod, string> = {
  BANK_TRANSFER: 'Bank transfer', JAZZ_CASH: 'JazzCash', EASY_PAISA: 'Easypaisa',
};
export function availableMethods(s: PaymentSettingsView | null | undefined): PayMethod[] {
  if (!s) return [];
  const out: PayMethod[] = [];
  if ((s.accountNumber ?? '').trim() || (s.bankName ?? '').trim()) out.push('BANK_TRANSFER');
  if ((s.jazzCash ?? '').trim()) out.push('JAZZ_CASH');
  if ((s.easyPaisa ?? '').trim()) out.push('EASY_PAISA');
  return out;
}
function Row({ label, value }: { label: string; value?: string | null }) {
  if (!(value ?? '').trim()) return null;
  return (
    <div className="flex justify-between gap-3 py-1 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-800">{value}</span>
    </div>
  );
}
export function PaymentMethodDetails({ settings, method, onChange }: {
  settings: PaymentSettingsView | null | undefined; method: PayMethod | null; onChange: (m: PayMethod) => void;
}) {
  const methods = availableMethods(settings);
  if (methods.length === 0) return null;
  const active = method && methods.includes(method) ? method : methods[0];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {methods.map((m) => (
          <button key={m} type="button" onClick={() => onChange(m)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ring-1 ${
              m === active ? 'bg-brand-50 text-brand-700 ring-brand-200' : 'bg-surface text-slate-600 ring-border-soft'}`}>
            {LABELS[m]}
          </button>
        ))}
      </div>
      <div className="rounded-xl ring-1 ring-border-soft bg-surface px-4 py-3">
        {active === 'BANK_TRANSFER' && (<>
          <Row label="Bank" value={settings?.bankName} />
          <Row label="Account title" value={settings?.accountTitle} />
          <Row label="Account number" value={settings?.accountNumber} />
          <Row label="IBAN" value={settings?.iban} />
        </>)}
        {active === 'JAZZ_CASH' && <Row label="JazzCash" value={settings?.jazzCash} />}
        {active === 'EASY_PAISA' && <Row label="Easypaisa" value={settings?.easyPaisa} />}
        <Row label="Instructions" value={settings?.instructions} />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests + typecheck**

Run: `cd apps/web && pnpm test -- payment-method-details && pnpm typecheck && pnpm lint`
Expected: PASS / clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/payment-method-details.tsx apps/web/components/payment-method-details.test.tsx
git commit -m "feat(payments): shared PaymentMethodDetails picker+details block (C6)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Wire the picker into pay page + top-up modal (C6)

**Files:**
- Modify: `apps/web/app/(consumer)/consumer/tickets/[id]/pay/page.tsx` (~331-390 details render; ~163 paymentMode)
- Modify: `apps/web/components/consumer-wallet-board.tsx` (~298-321 modal body)
- Test: `apps/web/tests/e2e/payment-methods.spec.ts` (mock-API pattern, mirror `pricing-tax-promo.spec.ts`)

**Interfaces:**
- Consumes: `PaymentMethodDetails`, `availableMethods`, `PayMethod` (Task 4); `paymentSettingsClient.get()` (existing).

- [ ] **Step 1: Pay page — replace the all-at-once details with the picker**

Add state `const [method, setMethod] = useState<PayMethod | null>(null);`. On settings load, default it: `startTransition(() => setMethod(availableMethods(settings)[0] ?? null))`. Replace the block at ~331-390 that renders bank+iban+jazzcash+easypaisa with:
```tsx
<PaymentMethodDetails settings={bankDetails} method={method} onChange={setMethod} />
```
Wire the POST at ~163 to send `paymentMode: method ?? 'BANK_TRANSFER'` instead of the hardcoded `'BANK_TRANSFER'`. Keep the existing "Bank details are not configured yet" guard when `availableMethods(bankDetails).length === 0`.

- [ ] **Step 2: Top-up modal — render the details for the selected method**

In `consumer-wallet-board.tsx`, the modal already has a `paymentMode` state (now enum-valued from Task 3). Render `<PaymentMethodDetails settings={settings} method={paymentMode as PayMethod} onChange={(m) => setPaymentMode(m)} />` below the amount field, feeding it the loaded `PaymentSettings`. Ensure the picker and the existing mode buttons don't duplicate — prefer the shared `PaymentMethodDetails` picker as the single selector; remove the old inline mode buttons if they become redundant (keep whichever the modal needs to submit `paymentMode`). If both must coexist, keep them in sync off the one `paymentMode` state.

- [ ] **Step 3: Typecheck + lint**

Run: `cd apps/web && pnpm typecheck && pnpm lint`
Expected: clean (respect the set-state-in-effect rule — the settings-load default uses `startTransition`).

- [ ] **Step 4: Write the e2e (mock-API pattern)**

```ts
// apps/web/tests/e2e/payment-methods.spec.ts — mirror pricing-tax-promo.spec.ts helpers
import { test, expect } from '@playwright/test';

test('pay page shows only the selected method details', async ({ page }) => {
  // …seed consumer auth (copy from pricing-tax-promo.spec.ts)…
  await page.route('**/api/payment-settings', (r) => r.fulfill({ json: {
    bankName: 'Allied Bank', accountTitle: 'Ali Zain', accountNumber: '0288', jazzCash: '03004680800', easyPaisa: '' } }));
  await page.route('**/api/tickets/tkt-1', (r) => r.fulfill({ json: {
    id: 'tkt-1', batchNo: 'TKT-1', totalAmount: 750, amountPaid: 0, serviceCost: 750, currency: 'PKR', status: 'UNPAID' } }));
  await page.goto('/consumer/tickets/tkt-1/pay');
  await expect(page.getByText('Allied Bank')).toBeVisible();      // Bank default
  await expect(page.getByText('03004680800')).toHaveCount(0);
  await page.getByRole('button', { name: 'JazzCash' }).click();
  await expect(page.getByText('03004680800')).toBeVisible();      // switched
  await expect(page.getByText('Allied Bank')).toHaveCount(0);
  // EasyPaisa not offered (empty in settings)
  await expect(page.getByRole('button', { name: 'Easypaisa' })).toHaveCount(0);
});
```

- [ ] **Step 5: Run e2e**

Run: `cd apps/web && pnpm playwright test tests/e2e/payment-methods.spec.ts`
Expected: PASS. If the multi-step auth/nav makes the pay route brittle in mock mode, keep the settings+render assertions and `test.fixme` any part that needs a live ticket fetch (same accepted gap as `payment-gating.spec.ts`); document it in your report.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/\(consumer\)/consumer/tickets/\[id\]/pay/page.tsx apps/web/components/consumer-wallet-board.tsx apps/web/tests/e2e/payment-methods.spec.ts
git commit -m "feat(payments): method picker reveals only the chosen account on pay + top-up (C6)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:** B4 → Task 2; B5 → Task 3; C6 → Tasks 4-5; C1 → Task 1. All four spec items mapped. The two confirmed assumptions (methods = Bank/JazzCash/EasyPaisa; taxable base = service+additionalService) are encoded in Global Constraints + Tasks 1/3/4.

**Placeholder scan:** every code step has real code; commands have expected output. The two "if the harness/jsdom is heavier than warranted" notes are explicit fallbacks with a documented decision, not TODOs.

**Type consistency:** `PayMethod`/`PaymentSettingsView`/`availableMethods`/`PaymentMethodDetails` defined in Task 4 and consumed verbatim in Task 5. `computeTicketTotal` return shape unchanged (Task 1). Enum values `BANK_TRANSFER`/`JAZZ_CASH`/`EASY_PAISA` consistent across Tasks 3-5 and Global Constraints.

## Verification (end-to-end)
1. `cd apps/api && pnpm test` — money + DTO specs green.
2. `pnpm --filter @wusuq/shared build && (cd apps/api && pnpm typecheck) && (cd apps/web && pnpm typecheck && pnpm lint)` — clean.
3. Manual: SPLIT ticket base 800 → clerk submits costs → consumer total/dues still 800 → admin Approve & Complete → total updates with base-only tax. Top-up with JazzCash + receipt image succeeds. Pay page method picker reveals only the chosen account.
