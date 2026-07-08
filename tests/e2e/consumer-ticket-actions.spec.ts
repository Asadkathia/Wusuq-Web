import { expect, test } from '@playwright/test';

// Mock-API pattern mirrors tests/e2e/pricing-tax-promo.spec.ts and
// tests/e2e/documents-invoice.spec.ts: a fake (unsigned) JWT seeded into
// localStorage before navigation, plus page.route interceptors for the
// specific endpoints under test. No real API server is required.

function buildFakeJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.signature`;
}

const FAR_FUTURE_EXP = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365;

async function seedAuth(
  page: import('@playwright/test').Page,
  user: { id: string; role: string; email: string },
) {
  const accessToken = buildFakeJwt({ sub: user.id, role: user.role, exp: FAR_FUTURE_EXP });
  const refreshToken = buildFakeJwt({ sub: user.id, type: 'refresh', exp: FAR_FUTURE_EXP });
  await page.addInitScript(
    ({ access, refresh, u }) => {
      window.localStorage.setItem('wusuq_access_token', access);
      window.localStorage.setItem('wusuq_refresh_token', refresh);
      window.localStorage.setItem('wusuq_user', JSON.stringify(u));
    },
    { access: accessToken, refresh: refreshToken, u: user },
  );
}

const FAKE_PDF_BASE64 = Buffer.from('%PDF-1.4 fake invoice content').toString('base64');

const UNPAID_TICKET = {
  id: 'tkt-1',
  batchNo: 'TKT-1001',
  serviceCity: 'Lahore',
  caseType: 'Civil',
  status: 'UNPAID',
  createdAt: new Date().toISOString(),
  totalAmount: 500,
  amountPaid: 0,
  serviceCost: 500,
  currency: 'PKR',
  createdBy: 'CONSUMER',
  remainderFinalizedAt: null,
  consumer: { id: 'consumer-1', name: 'Consumer One' },
  service: { id: 's-1', name: 'Case Files', category: 'judicial', type: 'PHYSICAL' },
  intakeFlow: 'judicial_case_files',
};

test.describe('Consumer ticket card actions: Regenerate / Download invoice / Pay later (C7/C8)', () => {
  test('the ticket card renders all three actions', async ({ page }) => {
    await seedAuth(page, { id: 'consumer-1', role: 'consumer', email: 'consumer1@wusuq.com' });

    // Catch-all first (lowest priority in Playwright's routing) so unrelated
    // calls made by the consumer shell (wallet chip, nav counts, …) resolve.
    await page.route(/\/api\/.*/, async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
    });

    await page.route('**/api/tickets?*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [UNPAID_TICKET] }),
      });
    });

    let invoiceHits = 0;
    await page.route('**/api/tickets/tkt-1/invoice', async (route) => {
      invoiceHits += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          filename: 'invoice-TKT-1001.pdf',
          contentType: 'application/pdf',
          content: FAKE_PDF_BASE64,
        }),
      });
    });

    await page.goto('/consumer/my-tickets');

    // ── Regenerate: a link into the pre-filled intake wizard ────────────────
    const regenerateLink = page.getByRole('link', { name: 'Regenerate' });
    await expect(regenerateLink).toBeVisible();
    const href = await regenerateLink.getAttribute('href');
    expect(href).toContain('/consumer/paralegal-services/judicial/case-files');
    expect(href).toContain('regenerateFromTicketId=tkt-1');

    // ── Download invoice: fires the invoice endpoint on click ───────────────
    // The card + detail can both render a "Download invoice" button; scope to
    // the first (the card action) to avoid a strict-mode multi-match.
    await page.getByRole('button', { name: /Download invoice/ }).first().click();
    await expect.poll(() => invoiceHits).toBeGreaterThan(0);

    // ── Pay later: toasts, no navigation, no backend call ───────────────────
    await page.getByRole('button', { name: 'Pay later' }).first().click();
    await expect(page.getByText('PKR 500 added to your wallet as due')).toBeVisible();
    await expect(page).toHaveURL(/\/consumer\/my-tickets/);
  });

  // Deep-nav through the Regenerate link into the live intake wizard route
  // (asserting the wizard actually hydrates from `regenerateFromTicketId`)
  // needs the shared intake-wizard mock driver that doesn't exist yet — same
  // accepted gap as tests/e2e/payment-gating.spec.ts's consumer-checkout fixme.
  test.fixme(
    'regenerate navigates into a pre-filled wizard that submits as a new ticket',
    async () => {},
  );
});
