import { expect, type Page } from '@playwright/test';

export function buildFakeJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.sig`;
}

const FAR_FUTURE_EXP = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365;

export async function authAsConsumer(page: Page): Promise<void> {
  const token = buildFakeJwt({ sub: 'c-1', role: 'consumer', exp: FAR_FUTURE_EXP });
  const user = JSON.stringify({ name: 'Test Consumer', role: 'consumer', email: 'test@wusuq.com' });
  await page.addInitScript(
    ([t, u]) => {
      localStorage.setItem('wusuq_access_token', t);
      localStorage.setItem('wusuq_user', u);
    },
    [token, user],
  );
}

export async function mockConsumerApis(page: Page): Promise<void> {
  const nowIso = new Date().toISOString();
  // Playwright matches routes in LIFO order — register the catch-all FIRST so
  // that specific routes registered below take precedence over it.
  await page.route(/\/api\/.*/, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) }),
  );
  await page.route(/\/api\/notifications\/unread-count$/, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ count: 0 }) }),
  );
  await page.route(/\/api\/wallet\/me$/, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ balance: -1900, currency: 'PKR' }) }),
  );
  await page.route(/\/api\/dashboard\/my-summary$/, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        myTickets: { total: 2, pending: 2, inProgress: 0, completed: 0 },
        myWalletBalance: -1900,
        myOutstanding: 1900,
        myActiveCases: 0,
        myRecentTickets: [
          { id: 't1', batchNo: 'TKT-3601', status: 'UNPAID', totalAmount: 800, createdAt: nowIso, service: { name: 'Lower Court Paralegal Service' } },
          { id: 't2', batchNo: 'TKT-3642', status: 'UNPAID', totalAmount: 1100, createdAt: nowIso, service: { name: 'Case Information Retrieval' } },
        ],
        myNextHearing: null,
      }),
    }),
  );
}

export async function setMobile(page: Page): Promise<void> {
  await page.setViewportSize({ width: 390, height: 844 });
}

export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const { scrollW, clientW } = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
  }));
  expect(scrollW, `horizontal overflow: scrollWidth ${scrollW} > clientWidth ${clientW}`).toBeLessThanOrEqual(clientW + 1);
}
