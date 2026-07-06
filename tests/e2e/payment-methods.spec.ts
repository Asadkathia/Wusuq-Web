import { expect, test } from '@playwright/test';

// ── JWT helper (same pattern as pricing-tax-promo.spec.ts / clerk-assignment-and-docs.spec.ts) ──

function buildFakeJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.signature`;
}

const FAR_FUTURE_EXP = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365;

async function seedConsumerAuth(page: import('@playwright/test').Page) {
  const accessToken = buildFakeJwt({ sub: 'consumer-1', role: 'consumer', exp: FAR_FUTURE_EXP });
  const refreshToken = buildFakeJwt({ sub: 'consumer-1', type: 'refresh', exp: FAR_FUTURE_EXP });
  await page.addInitScript(
    ({ access, refresh, user }) => {
      window.localStorage.setItem('wusuq_access_token', access);
      window.localStorage.setItem('wusuq_refresh_token', refresh);
      window.localStorage.setItem('wusuq_user', JSON.stringify(user));
    },
    {
      access: accessToken,
      refresh: refreshToken,
      user: { id: 'consumer-1', role: 'consumer', email: 'testconsumer@wusuq.com' },
    },
  );
}

// ── Specs ─────────────────────────────────────────────────────────────────────

test.describe('Workstream-A money UI: payment method picker (C6)', () => {
  test('pay page shows only the selected method details', async ({ page }) => {
    await seedConsumerAuth(page);

    // Catch-all first (registered first = lowest priority in Playwright) so
    // every other consumer-shell call (notifications, /wallet/me, etc.)
    // resolves without erroring.
    await page.route(/\/api\/.*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({}),
      });
    });

    await page.route('**/api/payment-settings', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'settings-1',
          bankName: 'Allied Bank',
          accountTitle: 'Ali Zain',
          accountNumber: '0288',
          jazzCash: '03004680800',
          easyPaisa: '',
          updatedAt: new Date().toISOString(),
        }),
      });
    });

    await page.route('**/api/tickets/tkt-1', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'tkt-1',
          batchNo: 'TKT-1',
          totalAmount: 750,
          amountPaid: 0,
          serviceCost: 750,
          currency: 'PKR',
          status: 'UNPAID',
        }),
      });
    });

    await page.goto('/consumer/tickets/tkt-1/pay');

    // Bank details are the default (first available method).
    await expect(page.getByText('Allied Bank')).toBeVisible();
    await expect(page.getByText('03004680800')).toHaveCount(0);

    // Switching to JazzCash reveals its number and hides the bank fields.
    await page.getByRole('button', { name: 'JazzCash' }).click();
    await expect(page.getByText('03004680800')).toBeVisible();
    await expect(page.getByText('Allied Bank')).toHaveCount(0);

    // EasyPaisa is not offered — empty in settings.
    await expect(page.getByRole('button', { name: 'Easypaisa' })).toHaveCount(0);
  });

  // ── Consumer top-up modal — documented fixme ────────────────────────────────
  test.fixme('top-up modal reveals only the selected method details', async (_page) => {
    // This needs the wallet page (/consumer/my-wallet) to open the top-up
    // dialog and drive its "Top up" button before the modal's settings fetch
    // and picker can be asserted — the dialog is not routed/hydrated by a
    // direct page.goto the way the standalone /pay route is. Mirrors the
    // same "no shared intake/dialog driver yet" gap documented in
    // tests/e2e/payment-gating.spec.ts and
    // tests/e2e/pricing-tax-promo.spec.ts. When a shared dialog-driving
    // helper exists:
    //   1. Seed consumer auth (as above).
    //   2. Mock GET /api/payment-settings and /api/wallet/me.
    //   3. Navigate to /consumer/my-wallet, click "Top up".
    //   4. Assert the modal's PaymentMethodDetails picker defaults to Bank
    //      transfer and switches methods the same way as the /pay assertions
    //      above.
  });
});
