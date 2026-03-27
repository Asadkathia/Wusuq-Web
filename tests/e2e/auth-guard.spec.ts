import { expect, test } from '@playwright/test';

test.describe('Portal auth guard', () => {
  test('redirects unauthenticated users to login', async ({ page }) => {
    await page.goto('/dashboard');

    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard$/);
    await expect(page.getByRole('heading', { name: 'Wusuq Login' })).toBeVisible();
  });

  test('allows navigation to dashboard when token exists', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('wusuq_access_token', 'e2e-token');
    });

    await page.goto('/dashboard');

    await expect(page).toHaveURL('/dashboard');
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  });
});
