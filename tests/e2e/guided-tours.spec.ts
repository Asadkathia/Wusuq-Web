import { expect, test } from '@playwright/test';

// Mock-API pattern mirrors tests/e2e/consumer-ticket-actions.spec.ts: a fake
// (unsigned) JWT seeded into localStorage before navigation, plus
// page.route interceptors for the specific endpoints under test. No real API
// server is required.
//
// Exercises the guided-tour engine end-to-end in a real browser:
// apps/web/components/tours/{tour-provider,run-tour,tour-menu}.tsx +
// apps/web/lib/tours/{progress,auto-play}.ts, against the consumer
// getting-started + My Tickets tours (apps/web/lib/tours/consumer/*.ts).

function buildFakeJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.signature`;
}

const FAR_FUTURE_EXP = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365;

async function seedAuth(
  page: import('@playwright/test').Page,
  user: { id: string; role: string; email: string },
  opts: { impersonating?: boolean } = {},
) {
  const accessToken = buildFakeJwt({ sub: user.id, role: user.role, exp: FAR_FUTURE_EXP });
  const refreshToken = buildFakeJwt({ sub: user.id, type: 'refresh', exp: FAR_FUTURE_EXP });
  await page.addInitScript(
    ({ access, refresh, u, impersonating }) => {
      window.localStorage.setItem('wusuq_access_token', access);
      window.localStorage.setItem('wusuq_refresh_token', refresh);
      window.localStorage.setItem('wusuq_user', JSON.stringify(u));
      if (impersonating) {
        // Any truthy value marks the session as impersonating — the tour
        // engine only checks presence (browser-state.ts isImpersonating()).
        window.localStorage.setItem('wusuq_impersonator_access_token', access);
      }
    },
    { access: accessToken, refresh: refreshToken, u: user, impersonating: opts.impersonating ?? false },
  );
}

// Mirrors TOUR_IDS in packages/shared/src/tours.ts. Kept as a literal list —
// no spec in tests/e2e cross-imports a workspace package (Playwright
// resolves this directory from the repo root, where only apps/web/apps/api
// declare @wusuq/shared as a dependency, not the root package.json), so
// every other spec in this directory duplicates the small bits of shared
// shape it needs rather than reaching across the workspace boundary. If a
// 13th consumer tour is registered, add its id here too — it only widens
// the "every tour already seen" seed in the replay-from-menu test below.
const ALL_CONSUMER_TOUR_IDS = [
  'consumer.getting-started',
  'consumer.dashboard',
  'consumer.services',
  'consumer.intake',
  'consumer.my-tickets',
  'consumer.pay',
  'consumer.wallet',
  'consumer.drafts',
  'consumer.case-files',
  'consumer.documents',
  'consumer.invoices',
  'consumer.profile',
];

type ProgressRow = { tourId: string; version: number; status: 'COMPLETED' | 'DISMISSED' };
type PutCall = { tourId: string; body: unknown };

/**
 * Lowest-priority catch-all so unrelated shell calls (wallet chip, nav
 * counts, notifications…) resolve with `{}` instead of erroring the page.
 * Playwright runs matching routes in the REVERSE of registration order until
 * one calls fulfill/abort, so routes registered after this one (progress,
 * tickets) take priority over it — same convention as
 * tests/e2e/consumer-ticket-actions.spec.ts.
 */
async function mockAllApiCalls(page: import('@playwright/test').Page) {
  await page.route(/\/api\/.*/, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
  });
}

async function mockEmptyTicketsList(page: import('@playwright/test').Page) {
  await page.route('**/api/tickets?*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [] }),
    });
  });
}

/**
 * Routes `GET /tours/progress`. `provider` is re-read on every request so a
 * test can mutate its own closure variable and reload the page to exercise
 * a changed server state (the "skip persists" test below).
 */
async function mockToursProgress(
  page: import('@playwright/test').Page,
  provider: () => { status: number; body: unknown },
) {
  await page.route('**/api/tours/progress', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      return;
    }
    const { status, body } = provider();
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
}

/**
 * Routes `PUT /tours/progress/:tourId` and records every call so a test can
 * assert exactly what was persisted (or that nothing was, for the
 * impersonation case).
 */
async function recordToursProgressPuts(page: import('@playwright/test').Page): Promise<PutCall[]> {
  const calls: PutCall[] = [];
  await page.route('**/api/tours/progress/*', async (route) => {
    if (route.request().method() !== 'PUT') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      return;
    }
    const url = new URL(route.request().url());
    const tourId = decodeURIComponent(url.pathname.split('/').pop() ?? '');
    calls.push({ tourId, body: route.request().postDataJSON() });
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  return calls;
}

function popoverTitle(page: import('@playwright/test').Page) {
  return page.locator('.driver-popover-title');
}

/**
 * Clicks through a running driver.js tour: "Next" on every step, then the
 * final button (whose text is "Done" for getting-started, or a tour's own
 * `next.label`) on the last. Detected by the `driver-popover-done-btn` class
 * driver.js adds to that final button — never by counting clicks, because an
 * optional step (e.g. the wallet chip, which depends on a mocked fetch
 * resolving before the tour's 400ms auto-play timer fires) can legitimately
 * drop out of the resolved step list.
 */
async function clickThroughTour(page: import('@playwright/test').Page) {
  for (let i = 0; i < 12; i += 1) {
    const btn = page.locator('.driver-popover-next-btn');
    await expect(btn).toBeVisible();
    const isLastStep = await btn.evaluate((el) => el.classList.contains('driver-popover-done-btn'));
    await btn.click();
    if (isLastStep) return;
  }
  throw new Error('Tour did not reach its Done step within 12 "Next" clicks');
}

test.describe('Guided tours (consumer)', () => {
  test('fresh consumer sees getting-started, then the page tour', async ({ page }) => {
    await seedAuth(page, { id: 'consumer-1', role: 'consumer', email: 'consumer1@wusuq.com' });
    await mockAllApiCalls(page);
    await mockEmptyTicketsList(page);
    await mockToursProgress(page, () => ({ status: 200, body: [] }));
    const puts = await recordToursProgressPuts(page);

    await page.goto('/consumer/my-tickets');

    // getting-started auto-plays first (400ms settle timer after load).
    await expect(popoverTitle(page)).toHaveText('Welcome to Wusuq', { timeout: 10000 });
    await clickThroughTour(page);

    await expect
      .poll(() => puts.find((c) => c.tourId === 'consumer.getting-started')?.body, { timeout: 5000 })
      .toEqual({ version: 1, status: 'COMPLETED' });

    // The chain to the page's own tour is driven by the auto-play effect
    // re-evaluating once getting-started shows as seen — not by
    // TourDefinition.next (getting-started has none).
    await expect(popoverTitle(page)).toHaveText('Filter by stage', { timeout: 8000 });
  });

  test('skip persists: Escape writes DISMISSED, and a seen tour never replays', async ({ page }) => {
    await seedAuth(page, { id: 'consumer-1', role: 'consumer', email: 'consumer1@wusuq.com' });
    await mockAllApiCalls(page);
    await mockEmptyTicketsList(page);
    let progress: ProgressRow[] = [];
    await mockToursProgress(page, () => ({ status: 200, body: progress }));
    const puts = await recordToursProgressPuts(page);

    await page.goto('/consumer/my-tickets');

    await expect(popoverTitle(page)).toHaveText('Welcome to Wusuq', { timeout: 10000 });
    await page.keyboard.press('Escape');
    await expect(page.locator('.driver-popover')).toHaveCount(0);

    await expect
      .poll(() => puts.find((c) => c.tourId === 'consumer.getting-started')?.body, { timeout: 5000 })
      .toEqual({ version: 1, status: 'DISMISSED' });

    // Reload as if the server now has both tours recorded at the live
    // version — neither should auto-play a second time.
    progress = [
      { tourId: 'consumer.getting-started', version: 1, status: 'DISMISSED' },
      { tourId: 'consumer.my-tickets', version: 1, status: 'DISMISSED' },
    ];
    await page.reload();
    await page.waitForTimeout(2000);
    await expect(page.locator('.driver-popover')).toHaveCount(0);
  });

  test('replay from the ? menu', async ({ page }) => {
    await seedAuth(page, { id: 'consumer-1', role: 'consumer', email: 'consumer1@wusuq.com' });
    await mockAllApiCalls(page);
    await mockEmptyTicketsList(page);
    const seenProgress: ProgressRow[] = ALL_CONSUMER_TOUR_IDS.map((tourId) => ({
      tourId,
      version: 1,
      status: 'COMPLETED',
    }));
    await mockToursProgress(page, () => ({ status: 200, body: seenProgress }));

    await page.goto('/consumer/my-tickets');
    await page.waitForTimeout(2000);
    await expect(page.locator('.driver-popover')).toHaveCount(0);

    await page.locator('[aria-label="Guided tours"]').click();
    await page.getByRole('menuitem', { name: 'Tour this page' }).click();

    await expect(popoverTitle(page)).toHaveText('Filter by stage', { timeout: 5000 });
  });

  test('impersonation never auto-plays and manual replay never persists', async ({ page }) => {
    await seedAuth(
      page,
      { id: 'consumer-1', role: 'consumer', email: 'consumer1@wusuq.com' },
      { impersonating: true },
    );
    await mockAllApiCalls(page);
    await mockEmptyTicketsList(page);
    await mockToursProgress(page, () => ({ status: 200, body: [] }));
    const puts = await recordToursProgressPuts(page);

    await page.goto('/consumer/my-tickets');
    await page.waitForTimeout(2000);
    await expect(page.locator('.driver-popover')).toHaveCount(0);

    // A tour can still be started manually from the ? menu while
    // impersonating (start() has no impersonation gate) — only auto-play and
    // persistence are suppressed.
    await page.locator('[aria-label="Guided tours"]').click();
    await page.getByRole('menuitem', { name: 'Getting started' }).click();
    await expect(popoverTitle(page)).toHaveText('Welcome to Wusuq', { timeout: 5000 });

    await page.keyboard.press('Escape');
    await expect(page.locator('.driver-popover')).toHaveCount(0);
    await page.waitForTimeout(500);
    expect(puts).toHaveLength(0);
  });

  test('unloadable progress never auto-plays (fail closed)', async ({ page }) => {
    await seedAuth(page, { id: 'consumer-1', role: 'consumer', email: 'consumer1@wusuq.com' });
    await mockAllApiCalls(page);
    await mockEmptyTicketsList(page);
    await mockToursProgress(page, () => ({ status: 500, body: { message: 'boom' } }));

    await page.goto('/consumer/my-tickets');
    await page.waitForTimeout(2000);
    await expect(page.locator('.driver-popover')).toHaveCount(0);
  });
});
