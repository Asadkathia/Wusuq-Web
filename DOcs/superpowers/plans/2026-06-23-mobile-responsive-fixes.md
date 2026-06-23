# Mobile Responsive Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the mobile horizontal-overflow bug and the two systemic mobile defects (sub-16px input fonts, sub-44px tap targets) across both the consumer and staff shells, with no change to the desktop appearance.

**Architecture:** Three focused changes, each proven during the audit (`DOcs/superpowers/specs/2026-06-23-mobile-audit-and-redesign-design.md`, §6): (1) add `min-w-0` to the flex content column in both shell layouts so it can shrink below its content's intrinsic width (the flexbox `min-width:auto` trap — root cause of the reported scroll), plus let the dashboard ticket row wrap; (2) raise the shared input/select font to ≥16px on mobile to stop iOS auto-zoom; (3) give shared icon buttons a ≥44px touch target on mobile. Each task is verified by a Playwright spec at a 390px viewport that asserts the real symptom (no horizontal overflow / computed font-size / element box size).

**Tech Stack:** Next.js 16 App Router, Tailwind CSS v4 (mobile-first; `sm:`=640px, `lg:`=1024px), Playwright (`tests/e2e`, Chromium, mocked `/api/*` + fake JWT in `localStorage`).

## Global Constraints

- Desktop layout/appearance MUST be unchanged. All new mobile rules apply at the base breakpoint and are reset at `sm:` (≥640px) where the prior desktop value must continue to render. Verify by eye at ≥1024px after each task.
- Tailwind is mobile-first: base utility = mobile; layer `sm:`/`lg:` for larger. Primary mobile target widths: 360 / 390 / 430px.
- Do NOT change any business logic, data redaction, payment gating, or component props/exports — these are presentational class changes only (repo invariants in `apps/web/CLAUDE.md` must hold).
- Run all commands from the repo root unless noted. Web package filter: `pnpm --filter @wusuq/web`.
- Playwright baseURL defaults to `http://127.0.0.1:3000` and (without `E2E_BASE_URL`) builds + starts the web app itself; run E2E with `pnpm e2e`.
- Commit after each task. Per repo rule, the human runs `git commit` — the implementer stages files and proposes the message; do not commit autonomously.

---

## File Structure

- `tests/e2e/_mobile-helpers.ts` — **Create.** Shared Playwright helpers: fake-JWT builder, `authAsConsumer(page)` (seeds `localStorage`), `mockConsumerApis(page)` (stubs `/api/*` incl. a dashboard summary with ticket rows), `setMobile(page)`, and `expectNoHorizontalOverflow(page)`. One responsibility: mobile test scaffolding reused by every spec below.
- `tests/e2e/mobile-responsive.spec.ts` — **Create.** All mobile assertions (overflow, font-size, tap-target). Grows one `test.describe` per task.
- `app/(consumer)/layout.tsx` — **Modify.** Add `min-w-0` to the content column.
- `app/(portal)/layout.tsx` — **Modify.** Add `min-w-0` to the content column.
- `app/(consumer)/consumer/dashboard/page.tsx` — **Modify.** Let the Recent-activity ticket row wrap; segmented tab pills get a ≥44px mobile height.
- `components/ui/input.tsx` — **Modify.** Base font `text-base sm:text-sm`.
- `components/ui/select.tsx` — **Modify.** Trigger + search-input font `text-base sm:text-sm`.
- `components/ui/icon-button.tsx` — **Modify.** ≥44px touch target on mobile, reset at `sm:`.

**Deferred to a follow-up plan (not in scope here):** portal table→card below `lg` (rep ticket lists + finance — the `min-w-0` fix in Task 1 already downgrades these from a page-breaking P0 to a contained table-scroll), per-site list-row action-button sizing (Files Download/Delete), and P2 legibility (sub-11px labels). These are tracked in spec §6.7/§6.8 items 4–5.

---

### Task 1: Mobile test harness + P0 overflow fix (both shells + dashboard row)

**Files:**
- Create: `tests/e2e/_mobile-helpers.ts`
- Create: `tests/e2e/mobile-responsive.spec.ts`
- Modify: `app/(consumer)/layout.tsx`
- Modify: `app/(portal)/layout.tsx`
- Modify: `app/(consumer)/consumer/dashboard/page.tsx`

**Interfaces:**
- Produces (from `_mobile-helpers.ts`, consumed by later tasks):
  - `buildFakeJwt(payload: Record<string, unknown>): string`
  - `authAsConsumer(page: Page): Promise<void>` — seeds `wusuq_access_token` (future-exp JWT) + `wusuq_user` `{name, role:'consumer', email}` via `addInitScript`.
  - `mockConsumerApis(page: Page): Promise<void>` — fulfils `/api/*` with 200; dashboard summary includes 2 UNPAID `myRecentTickets`.
  - `setMobile(page: Page): Promise<void>` — sets viewport `{width:390,height:844}`.
  - `expectNoHorizontalOverflow(page: Page): Promise<void>` — asserts `documentElement.scrollWidth <= clientWidth + 1`.

- [ ] **Step 1: Write the harness helpers**

Create `tests/e2e/_mobile-helpers.ts`:

```ts
import { expect, type Page } from '@playwright/test';

export function buildFakeJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.sig`;
}

const FAR_FUTURE_EXP = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365;

export async function authAsConsumer(page: Page): Promise<void> {
  const token = buildFakeJwt({ sub: 'c-1', role: 'consumer', exp: FAR_FUTURE_EXP });
  const user = JSON.stringify({ name: 'Test Consumer', role: 'consumer', email: 'test@wusuq.com' });
  await page.addInitScript(
    ([t, u]) => {
      localStorage.setItem('wusuq_access_token', t);
      localStorage.setItem('wusuq_user', u);
    },
    [token, user],
  );
}

export async function mockConsumerApis(page: Page): Promise<void> {
  const nowIso = new Date().toISOString();
  await page.route(/\/api\/dashboard\/my-summary$/, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        myTickets: { total: 2, pending: 2, inProgress: 0, completed: 0 },
        myWalletBalance: -1900,
        myOutstanding: 1900,
        myActiveCases: 0,
        myRecentTickets: [
          { id: 't1', batchNo: 'TKT-3601', status: 'UNPAID', totalAmount: 800, createdAt: nowIso, service: { name: 'Lower Court Paralegal Service' } },
          { id: 't2', batchNo: 'TKT-3642', status: 'UNPAID', totalAmount: 1100, createdAt: nowIso, service: { name: 'Case Information Retrieval' } },
        ],
        myNextHearing: null,
      }),
    }),
  );
  await page.route(/\/api\/wallet\/me$/, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ balance: -1900, currency: 'PKR' }) }),
  );
  await page.route(/\/api\/notifications\/unread-count$/, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ count: 0 }) }),
  );
  // Catch-all for anything else (notifications list, profile, SSE handshake, etc.)
  await page.route(/\/api\/.*/, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) }),
  );
}

export async function setMobile(page: Page): Promise<void> {
  await page.setViewportSize({ width: 390, height: 844 });
}

export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const { scrollW, clientW } = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
  }));
  expect(scrollW, `horizontal overflow: scrollWidth ${scrollW} > clientWidth ${clientW}`).toBeLessThanOrEqual(clientW + 1);
}
```

- [ ] **Step 2: Write the failing overflow test**

Create `tests/e2e/mobile-responsive.spec.ts`:

```ts
import { test } from '@playwright/test';
import { authAsConsumer, mockConsumerApis, setMobile, expectNoHorizontalOverflow } from './_mobile-helpers';

test.describe('Mobile — no horizontal overflow', () => {
  test('consumer dashboard fits a 390px viewport', async ({ page }) => {
    await setMobile(page);
    await authAsConsumer(page);
    await mockConsumerApis(page);
    await page.goto('/consumer/dashboard');
    await page.getByText('Recent activity').waitFor();
    await expectNoHorizontalOverflow(page);
  });
});
```

- [ ] **Step 3: Run the test and confirm it FAILS**

Run: `pnpm e2e -- mobile-responsive.spec.ts`
Expected: FAIL on the overflow assertion (`scrollWidth ~581 > clientWidth ~390`) — this reproduces the reported bug. (First run builds the web app; allow up to 2 min.)

- [ ] **Step 4: Add `min-w-0` to the consumer content column**

In `app/(consumer)/layout.tsx`, change the content-column div:

```tsx
        <div className="flex flex-1 flex-col min-w-0">
```

(Previously `className="flex flex-1 flex-col"`.)

- [ ] **Step 5: Add `min-w-0` to the portal content column**

In `app/(portal)/layout.tsx`, change the content-column div identically:

```tsx
        <div className="flex flex-1 flex-col min-w-0">
```

- [ ] **Step 6: Let the dashboard Recent-activity row wrap**

In `app/(consumer)/consumer/dashboard/page.tsx`, in the `visibleTickets.map` row, change the row container and its right-hand cluster so the amount·status·pay group drops to its own full-width line on mobile:

Row container — was `className="group flex items-center gap-4 rounded-xl px-3 py-3 transition-colors duration-150 hover:bg-surface-muted"`:

```tsx
                <div
                  key={t.id}
                  className="group flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl px-3 py-3 transition-colors duration-150 hover:bg-surface-muted"
                >
```

Right-hand cluster — was `<div className="flex items-center gap-3 shrink-0">`:

```tsx
                  <div className="flex w-full items-center justify-end gap-3 sm:w-auto sm:shrink-0">
```

- [ ] **Step 7: Run the test and confirm it PASSES**

Run: `pnpm e2e -- mobile-responsive.spec.ts`
Expected: PASS (no horizontal overflow at 390px).

- [ ] **Step 8: Confirm desktop is unchanged**

Run: `pnpm --filter @wusuq/web dev`, open `http://localhost:3001/consumer/dashboard` (port 3001 if 3000 is taken) at a ≥1024px window. Confirm the Recent-activity rows still render on a single line with amount·status·Pay-now right-aligned (the `sm:` resets keep desktop identical). Stop the dev server.

- [ ] **Step 9: Stage and propose commit**

```bash
git add tests/e2e/_mobile-helpers.ts tests/e2e/mobile-responsive.spec.ts \
  "apps/web/app/(consumer)/layout.tsx" "apps/web/app/(portal)/layout.tsx" \
  "apps/web/app/(consumer)/consumer/dashboard/page.tsx"
```
Propose message: `fix(web): stop mobile horizontal overflow (min-w-0 shell columns + dashboard row wrap)`

---

### Task 2: Input & Select fonts ≥16px on mobile (stop iOS auto-zoom)

**Files:**
- Modify: `components/ui/input.tsx`
- Modify: `components/ui/select.tsx`
- Modify: `tests/e2e/mobile-responsive.spec.ts`

**Interfaces:**
- Consumes: `setMobile` from `_mobile-helpers.ts`.
- Produces: none (presentational).

- [ ] **Step 1: Write the failing font-size test**

Append to `tests/e2e/mobile-responsive.spec.ts` (the `/consumer/login/email` page is public — no auth/mocks needed; its email field uses the shared `Input`):

```ts
import { expect } from '@playwright/test';

test.describe('Mobile — inputs are ≥16px (no iOS zoom)', () => {
  test('login email input renders at 16px on mobile', async ({ page }) => {
    await setMobile(page);
    await page.goto('/consumer/login/email');
    const input = page.getByPlaceholder('you@example.com');
    await input.waitFor();
    const fontPx = await input.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(fontPx).toBeGreaterThanOrEqual(16);
  });
});
```

- [ ] **Step 2: Run the test and confirm it FAILS**

Run: `pnpm e2e -- mobile-responsive.spec.ts -g "16px"`
Expected: FAIL — computed font-size is `14` (`text-sm`).

- [ ] **Step 3: Raise the Input base font**

In `components/ui/input.tsx`, in the `base` array first entry, change `text-sm` to `text-base sm:text-sm`:

```ts
  const base = [
    'h-11 w-full rounded-xl bg-surface text-base sm:text-sm text-slate-900 placeholder:text-slate-400',
    'border transition-[box-shadow,border-color] duration-200 ease-silk',
    'focus:outline-none',
    'disabled:bg-surface-muted disabled:cursor-not-allowed',
    error
      ? 'border-rose-400 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/25'
      : 'border-border-soft focus:border-primary-500 focus:ring-2 focus:ring-primary-500/25',
  ].join(' ');
```

- [ ] **Step 4: Raise the Select trigger + search font**

In `components/ui/select.tsx`:

In `triggerBase`, change `text-sm` to `text-base sm:text-sm`:

```ts
const triggerBase = [
  'group flex h-11 w-full items-center gap-2 rounded-xl border bg-surface px-3.5 text-left text-base sm:text-sm',
  'transition-[box-shadow,border-color] duration-200 ease-silk',
  'focus-visible:outline-none',
  'disabled:bg-surface-muted disabled:cursor-not-allowed',
].join(' ');
```

And on the in-popover search `<input data-select-search>` className, change `text-sm` to `text-base sm:text-sm`:

```tsx
                  className="h-9 w-full rounded-lg bg-surface-muted pl-9 pr-3 text-base sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500/30"
```

- [ ] **Step 5: Run the test and confirm it PASSES**

Run: `pnpm e2e -- mobile-responsive.spec.ts -g "16px"`
Expected: PASS (font-size 16 at 390px).

- [ ] **Step 6: Typecheck + confirm desktop unchanged**

Run: `pnpm --filter @wusuq/web typecheck`
Expected: no errors. Then eyeball any form at ≥1024px — inputs still render at 14px (`sm:text-sm`).

- [ ] **Step 7: Stage and propose commit**

```bash
git add apps/web/components/ui/input.tsx apps/web/components/ui/select.tsx tests/e2e/mobile-responsive.spec.ts
```
Propose message: `fix(web): inputs render at 16px on mobile to prevent iOS focus-zoom`

---

### Task 3: Icon buttons get a ≥44px touch target on mobile

**Files:**
- Modify: `components/ui/icon-button.tsx`
- Modify: `app/(consumer)/consumer/dashboard/page.tsx` (segmented tab pills)
- Modify: `tests/e2e/mobile-responsive.spec.ts`

**Interfaces:**
- Consumes: `authAsConsumer`, `mockConsumerApis`, `setMobile` from `_mobile-helpers.ts`.
- Produces: none (presentational).

- [ ] **Step 1: Write the failing tap-target test**

Append to `tests/e2e/mobile-responsive.spec.ts` (the dashboard topbar renders a Notifications `IconButton`; the seeded unread-count is 0 so the label has no count suffix):

```ts
test.describe('Mobile — tap targets ≥44px', () => {
  test('topbar notification button is ≥44px on mobile', async ({ page }) => {
    await setMobile(page);
    await authAsConsumer(page);
    await mockConsumerApis(page);
    await page.goto('/consumer/dashboard');
    const btn = page.getByRole('button', { name: /Notifications/ });
    await btn.waitFor();
    const box = await btn.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThanOrEqual(44);
  });
});
```

- [ ] **Step 2: Run the test and confirm it FAILS**

Run: `pnpm e2e -- mobile-responsive.spec.ts -g "tap targets"`
Expected: FAIL — button box is 36×36 (`size="md"` → `h-9 w-9`).

- [ ] **Step 3: Add a mobile minimum hit area to IconButton**

In `components/ui/icon-button.tsx`, add a mobile-only minimum size to the shared class list (it enlarges the touch target on mobile via `min-h`/`min-w`, then resets at `sm:` so desktop keeps the exact `sizeClass` dimensions). Change the class array to include `'min-h-11 min-w-11 sm:min-h-0 sm:min-w-0'`:

```tsx
      className={[
        'inline-flex items-center justify-center',
        'min-h-11 min-w-11 sm:min-h-0 sm:min-w-0',
        'transition-[background-color,color,box-shadow,transform] duration-200 ease-silk',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40',
        'disabled:opacity-60 disabled:cursor-not-allowed',
        'active:scale-95',
        variantClass[variant],
        sizeClass[size],
        className,
      ].join(' ')}
```

- [ ] **Step 4: Run the test and confirm it PASSES**

Run: `pnpm e2e -- mobile-responsive.spec.ts -g "tap targets"`
Expected: PASS (≥44×44 at 390px).

- [ ] **Step 5: Enlarge the dashboard segmented tab pills on mobile**

In `app/(consumer)/consumer/dashboard/page.tsx`, the "All" / "Unpaid" segmented links are `px-3 py-1` (~24px tall). Bump vertical padding on mobile and reset at `sm:`. For BOTH links change `px-3 py-1` to `px-3 py-2.5 sm:py-1`:

```tsx
                'rounded-md px-3 py-2.5 sm:py-1 text-xs font-semibold transition-colors',
```

(Apply to both the "All" link and the "Unpaid" link class arrays.)

- [ ] **Step 6: Typecheck + full mobile spec + desktop check**

Run: `pnpm --filter @wusuq/web typecheck` → no errors.
Run: `pnpm e2e -- mobile-responsive.spec.ts` → all tests PASS.
Eyeball the dashboard + topbar at ≥1024px: icon buttons are back to their `sizeClass` size (36px for `md`) and the tab pills are compact again.

- [ ] **Step 7: Stage and propose commit**

```bash
git add apps/web/components/ui/icon-button.tsx "apps/web/app/(consumer)/consumer/dashboard/page.tsx" tests/e2e/mobile-responsive.spec.ts
```
Propose message: `fix(web): ≥44px mobile touch targets for icon buttons and dashboard tabs`

---

## Self-Review

- **Spec coverage:** §6.8 item 1 (P0 `min-w-0` both shells + dashboard row) → Task 1. Item 2 (16px inputs in shared primitives) → Task 2. Item 3 (44px tap targets in IconButton + segmented tabs) → Task 3. Items 4 (portal table→card) and 5 (per-site list-row buttons, P2 legibility) → explicitly deferred to a follow-up plan (documented under File Structure), consistent with the "portal light" scope and because Task 1 already removes the page-breaking portal overflow.
- **Placeholder scan:** none — every step shows the exact class string or test code.
- **Type consistency:** helper names (`buildFakeJwt`, `authAsConsumer`, `mockConsumerApis`, `setMobile`, `expectNoHorizontalOverflow`) are defined in Task 1 and used verbatim in Tasks 1–3. No props/exports change, so no signature drift in app code.
- **Verification reality:** each fix has a Playwright assertion that fails before and passes after (overflow scrollWidth; computed font-size; bounding box) plus an explicit desktop-unchanged check, satisfying the Global Constraint.
