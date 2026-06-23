import { test } from '@playwright/test';
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
