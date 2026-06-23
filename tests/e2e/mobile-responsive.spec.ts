import { test, expect } from '@playwright/test';
import { authAsConsumer, mockConsumerApis, setMobile, expectNoHorizontalOverflow } from './_mobile-helpers';

test.describe('Mobile — no horizontal overflow', () => {
  test('consumer dashboard fits a 390px viewport', async ({ page }) => {
    await setMobile(page);
    await authAsConsumer(page);
    await mockConsumerApis(page);
    await page.goto('/consumer/dashboard');
    // Wait for an actual ticket row (batchNo rendered by the mock) — this
    // guarantees the async /dashboard/my-summary fetch has completed and
    // the overflow-causing right-hand cluster (amount + StatusPill + Pay now)
    // is present in the DOM before we measure scrollWidth.
    await page.getByText('TKT-3601').waitFor({ timeout: 10000 });
    await expectNoHorizontalOverflow(page);
  });
});

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
