import { expect, test } from '@playwright/test';

// Mock-API pattern mirrors tests/e2e/pricing-tax-promo.spec.ts and
// tests/e2e/clerk-assignment-and-docs.spec.ts: a fake (unsigned) JWT seeded
// into localStorage before navigation, plus page.route interceptors for the
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

// Tiny valid-enough PDF payloads — DocumentPreview / the invoice download
// only care that they can be turned into a Blob and rendered in an <iframe>;
// they don't parse the PDF structure.
const FAKE_PDF_BASE64 = Buffer.from('%PDF-1.4 fake invoice content').toString('base64');
const FAKE_PDF_BYTES = Buffer.from('%PDF-1.4 fake document content');

test.describe('Document viewer + invoice download (B1, C14)', () => {
  test('consumer downloads the invoice from ticket detail', async ({ page }) => {
    await seedAuth(page, { id: 'consumer-1', role: 'consumer', email: 'consumer1@wusuq.com' });

    const ticket = {
      id: 'tkt-1',
      batchNo: 'TKT-1001',
      status: 'DELIVERED',
      intakeFlow: 'judicial_case_files',
      currency: 'PKR',
      serviceCost: 5000,
      taxRate: 0.17,
      taxAmount: 850,
      totalAmount: 5850,
      amountPaid: 5850,
      discountPrice: 0,
      createdBy: 'CONSUMER',
      documents: [],
      history: [],
      consumer: { id: 'consumer-1', name: 'Consumer One' },
      service: { id: 's-1', name: 'Case Files', category: 'judicial' },
    };

    await page.route(/\/api\/.*/, async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
    });

    await page.route('**/api/tickets/tkt-1', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ticket) });
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

    await page.goto('/consumer/tickets/tkt-1');

    await page.getByRole('button', { name: 'Download invoice' }).click();

    await expect.poll(() => invoiceHits).toBeGreaterThan(0);
  });

  test('consumer previews a deliverable document from ticket detail', async ({ page }) => {
    await seedAuth(page, { id: 'consumer-1', role: 'consumer', email: 'consumer1@wusuq.com' });

    const doc = {
      id: 'doc-1',
      name: 'final-report.pdf',
      category: 'DELIVERABLE_PDF',
      caption: 'Final report',
    };

    const ticket = {
      id: 'tkt-2',
      batchNo: 'TKT-1002',
      status: 'DELIVERED',
      intakeFlow: 'judicial_case_files',
      currency: 'PKR',
      serviceCost: 0,
      taxAmount: 0,
      totalAmount: 0,
      amountPaid: 0,
      createdBy: 'CONSUMER',
      documents: [doc],
      history: [],
      consumer: { id: 'consumer-1', name: 'Consumer One' },
      service: { id: 's-1', name: 'Case Files', category: 'judicial' },
    };

    await page.route(/\/api\/.*/, async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
    });

    await page.route('**/api/tickets/tkt-2', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ticket) });
    });

    let downloadHits = 0;
    await page.route('**/api/tickets/tkt-2/documents/doc-1/download', async (route) => {
      downloadHits += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/pdf',
        headers: { 'Content-Disposition': 'attachment; filename="final-report.pdf"' },
        body: FAKE_PDF_BYTES,
      });
    });

    await page.goto('/consumer/tickets/tkt-2');

    // Icon-only Preview button — identified by its (deliberately doc-name-free,
    // see consumer-ticket-board.tsx) aria-label so it can't collide with the
    // Download button's `Download ${docName}` label.
    await page.getByRole('button', { name: 'Preview document' }).click();

    await expect.poll(() => downloadHits).toBeGreaterThan(0);
    await expect(page.locator('iframe[title="Final report"]')).toBeVisible();
  });

  test('consumer previews a document from My Documents', async ({ page }) => {
    await seedAuth(page, { id: 'consumer-1', role: 'consumer', email: 'consumer1@wusuq.com' });

    const doc = {
      id: 'doc-9',
      name: 'court-record.pdf',
      type: 'application/pdf',
      category: 'DELIVERABLE_PDF',
      caption: null,
      fileUrl: '/uploads/court-record.pdf',
      createdAt: new Date().toISOString(),
      ticket: { id: 'tkt-3', batchNo: 'TKT-1003', consumer: { id: 'consumer-1', name: 'Consumer One' } },
    };

    await page.route(/\/api\/.*/, async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
    });

    await page.route('**/api/documents**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [doc] }),
      });
    });

    let downloadHits = 0;
    await page.route('**/api/tickets/tkt-3/documents/doc-9/download', async (route) => {
      downloadHits += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/pdf',
        headers: { 'Content-Disposition': 'attachment; filename="court-record.pdf"' },
        body: FAKE_PDF_BYTES,
      });
    });

    await page.goto('/consumer/documents');

    await page.getByRole('button', { name: 'Preview' }).first().click();

    await expect.poll(() => downloadHits).toBeGreaterThan(0);
    await expect(page.locator('iframe[title="court-record.pdf"]')).toBeVisible();
  });

  test('staff previews a document in the admin ticket panel', async ({ page }) => {
    await seedAuth(page, { id: 'admin-1', role: 'super-admin', email: 'superadmin@wusuq.com' });

    const doc = { id: 'doc-5', name: 'work-doc.pdf', category: 'WORK_DOCUMENT', visibleToConsumer: true };

    const ticket = {
      id: 'ticket-admin-1',
      batchNo: 'TKT-2001',
      status: 'IN_PROGRESS',
      assignments: [],
      documents: [doc],
      consumer: { id: 'consumer-1', name: 'Consumer One' },
      service: { id: 's-1', name: 'Case Files', category: 'judicial' },
    };

    await page.route(/\/api\/.*/, async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
    });

    await page.route('**/api/tickets/ticket-admin-1', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ticket) });
    });

    let downloadHits = 0;
    await page.route('**/api/tickets/ticket-admin-1/documents/doc-5/download', async (route) => {
      downloadHits += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/pdf',
        headers: { 'Content-Disposition': 'attachment; filename="work-doc.pdf"' },
        body: FAKE_PDF_BYTES,
      });
    });

    await page.goto('/tickets/ticket-admin-1');

    // Same doc-name-free aria-label as the consumer surface (avoids colliding
    // with the adjacent `Download work-doc.pdf` button).
    await page.getByRole('button', { name: 'Preview document' }).click();

    await expect.poll(() => downloadHits).toBeGreaterThan(0);
    await expect(page.locator('iframe[title="work-doc.pdf"]')).toBeVisible();
  });
});
