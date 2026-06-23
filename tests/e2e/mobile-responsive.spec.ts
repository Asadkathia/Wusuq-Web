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
