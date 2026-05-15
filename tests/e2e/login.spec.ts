import { expect, test } from '@playwright/test';

function buildFakeJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.signature`;
}

const FAR_FUTURE_EXP = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365;

test.describe('Login flow', () => {
  test('submits credentials and redirects to next route', async ({ page }) => {
    const accessToken = buildFakeJwt({ sub: 'u-1', role: 'super-admin', exp: FAR_FUTURE_EXP });
    const refreshToken = buildFakeJwt({ sub: 'u-1', type: 'refresh', exp: FAR_FUTURE_EXP });

    // Order matters: register the catch-all FIRST, then override with specific
    // routes. Playwright matches the most-recently-added route first.
    await page.route(/\/api\/.*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({}),
      });
    });

    await page.route('**/auth/login', async (route) => {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          accessToken,
          refreshToken,
          user: {
            id: 'u-1',
            email: 'superadmin@wusuq.com',
            role: 'super-admin',
          },
        }),
      });
    });

    await page.route(/\/api\/reports.*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.goto('/login?next=%2Freports');
    await page.getByLabel('Email or phone').fill('superadmin@wusuq.com');
    await page.getByLabel('Password').fill('password');
    await page.getByRole('button', { name: 'Sign In' }).click();

    await expect(page).toHaveURL('/reports');
    await expect(page.getByRole('heading', { name: 'Reports' })).toBeVisible();

    const storedAccess = await page.evaluate(() => window.localStorage.getItem('wusuq_access_token'));
    const storedRefresh = await page.evaluate(() =>
      window.localStorage.getItem('wusuq_refresh_token'),
    );
    expect(storedAccess).toBe(accessToken);
    expect(storedRefresh).toBe(refreshToken);
  });
});
