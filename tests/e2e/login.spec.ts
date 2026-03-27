import { expect, test } from '@playwright/test';

test.describe('Login flow', () => {
  test('submits credentials and redirects to next route', async ({ page }) => {
    await page.route('**/auth/login', async (route) => {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          accessToken: 'mock-access-token',
          refreshToken: 'mock-refresh-token',
          user: {
            id: 'u-1',
            email: 'superadmin@wusuq.com',
            role: 'super-admin',
          },
        }),
      });
    });

    await page.goto('/login?next=%2Freports');
    await page.getByLabel('Email or phone').fill('superadmin@wusuq.com');
    await page.getByLabel('Password').fill('password');
    await page.getByRole('button', { name: 'Sign In' }).click();

    await expect(page).toHaveURL('/reports');
    await expect(page.getByRole('heading', { name: 'Reports' })).toBeVisible();

    const accessToken = await page.evaluate(() => window.localStorage.getItem('wusuq_access_token'));
    const refreshToken = await page.evaluate(() =>
      window.localStorage.getItem('wusuq_refresh_token'),
    );
    expect(accessToken).toBe('mock-access-token');
    expect(refreshToken).toBe('mock-refresh-token');
  });
});
