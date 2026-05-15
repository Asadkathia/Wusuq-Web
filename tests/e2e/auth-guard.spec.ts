import { expect, test } from '@playwright/test';

// PortalAuthGuard base64-decodes the JWT payload to check `exp`. It does not
// verify the signature client-side, so any well-formed JWT with a future
// `exp` is accepted.
function buildFakeJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.signature`;
}

const FAR_FUTURE_EXP = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365;

test.describe('Portal auth guard', () => {
  test('redirects unauthenticated users to login', async ({ page }) => {
    await page.goto('/dashboard');

    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard$/);
    await expect(
      page.getByRole('heading', { name: 'Sign in to staff portal' }),
    ).toBeVisible();
  });

  test('allows navigation to dashboard when token exists', async ({ page }) => {
    const token = buildFakeJwt({ sub: 'u-1', role: 'super-admin', exp: FAR_FUTURE_EXP });

    // Catch-all: stub every /api/* request with a 200 response so portal pages
    // can render without a real backend. Any 401 here would fire
    // `auth:unauthorized` and bounce us back to /login.
    await page.route(/\/api\/.*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({}),
      });
    });

    // The dashboard render path destructures specific fields from the summary,
    // so return a shape it can consume.
    await page.route(/\/api\/dashboard\/.*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          kpis: {
            totalTickets: 0,
            completedTickets: 0,
            totalRevenue: 0,
            outstandingAmount: 0,
          },
          kpisDelta: {},
          kpiSparks: {},
          ticketTrend: [],
          ticketsByStatus: [],
          serviceMix: [],
          cityMix: [],
          pendingActions: {},
          todaysHearings: [],
          topParalegals: [],
        }),
      });
    });

    await page.addInitScript((t) => {
      window.localStorage.setItem('wusuq_access_token', t);
      window.localStorage.setItem(
        'wusuq_user',
        JSON.stringify({ id: 'u-1', role: 'super-admin' }),
      );
    }, token);

    await page.goto('/dashboard');

    await expect(page).toHaveURL('/dashboard');
    await expect(
      page.getByRole('heading', { name: 'Dashboard Overview' }),
    ).toBeVisible();
  });
});
