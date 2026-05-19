import { expect, test } from '@playwright/test';

function buildFakeJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(
    JSON.stringify({ alg: 'none', typ: 'JWT' }),
  ).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.signature`;
}

const FAR_FUTURE_EXP = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365;

test.describe('Clerk assignment + document visibility', () => {
  test('clerk rejects an assigned ticket with a reason', async ({ page }) => {
    const accessToken = buildFakeJwt({
      sub: 'clerk-1',
      role: 'clerk',
      exp: FAR_FUTURE_EXP,
    });
    const refreshToken = buildFakeJwt({
      sub: 'clerk-1',
      type: 'refresh',
      exp: FAR_FUTURE_EXP,
    });

    const ticket = {
      id: 'ticket-1',
      batchNo: 'TKT-12345',
      status: 'ASSIGNED',
      assignments: [
        {
          id: 'a-1',
          status: 'ACTIVE',
          representative: { id: 'clerk-1', name: 'Clerk One' },
        },
      ],
      documents: [],
      consumer: { id: 'consumer-1', name: 'Consumer One' },
      service: { id: 's-1', name: 'Case Files', category: 'judicial' },
    };

    await page.route(/\/api\/.*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({}),
      });
    });

    await page.route('**/tickets/ticket-1', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(ticket),
      });
    });

    let rejectBody: { reason?: string } | null = null;
    await page.route(
      '**/tickets/ticket-1/reject-assignment',
      async (route) => {
        rejectBody = JSON.parse(route.request().postData() ?? '{}');
        ticket.status = 'PENDING';
        ticket.assignments[0].status = 'REJECTED';
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ...ticket }),
        });
      },
    );

    await page.addInitScript(
      ({ access, refresh, user }) => {
        window.localStorage.setItem('wusuq_access_token', access);
        window.localStorage.setItem('wusuq_refresh_token', refresh);
        window.localStorage.setItem('wusuq_user', JSON.stringify(user));
      },
      {
        access: accessToken,
        refresh: refreshToken,
        user: { id: 'clerk-1', role: 'clerk', email: 'clerk1@wusuq.com' },
      },
    );

    await page.goto('/tickets/ticket-1');

    await page.getByRole('button', { name: 'Reject' }).click();
    await page
      .getByPlaceholder('Why are you rejecting this assignment?')
      .fill('Cannot reach court this week');
    await page.getByRole('button', { name: 'Confirm reject' }).click();

    await expect.poll(() => rejectBody?.reason).toBe('Cannot reach court this week');
  });

  test('consumer downloads visible doc on completed ticket', async ({ page }) => {
    const accessToken = buildFakeJwt({
      sub: 'consumer-1',
      role: 'consumer',
      exp: FAR_FUTURE_EXP,
    });
    const refreshToken = buildFakeJwt({
      sub: 'consumer-1',
      type: 'refresh',
      exp: FAR_FUTURE_EXP,
    });

    const visibleDoc = {
      id: 'doc-vis',
      name: 'court-record.pdf',
      type: 'application/pdf',
      fileUrl: '/uploads/court-record.pdf',
      visibleToConsumer: true,
    };

    const ticket = {
      id: 'ticket-c',
      batchNo: 'TKT-99',
      status: 'COMPLETED',
      assignments: [],
      // BE filters out hidden docs for CONSUMER role; spec mirrors that here.
      documents: [visibleDoc],
      consumer: { id: 'consumer-1', name: 'Consumer One' },
      service: { id: 's-1', name: 'Case Information', category: 'judicial' },
    };

    await page.route(/\/api\/.*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({}),
      });
    });

    await page.route('**/tickets/ticket-c', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(ticket),
      });
    });

    let downloadHits = 0;
    await page.route(
      '**/tickets/ticket-c/documents/doc-vis/download',
      async (route) => {
        downloadHits += 1;
        await route.fulfill({
          status: 200,
          contentType: 'application/pdf',
          headers: {
            'Content-Disposition': 'attachment; filename="court-record.pdf"',
          },
          body: Buffer.from('%PDF-1.4 stub'),
        });
      },
    );

    await page.addInitScript(
      ({ access, refresh, user }) => {
        window.localStorage.setItem('wusuq_access_token', access);
        window.localStorage.setItem('wusuq_refresh_token', refresh);
        window.localStorage.setItem('wusuq_user', JSON.stringify(user));
      },
      {
        access: accessToken,
        refresh: refreshToken,
        user: {
          id: 'consumer-1',
          role: 'consumer',
          email: 'consumer1@wusuq.com',
        },
      },
    );

    await page.goto('/consumer/tickets/ticket-c');

    // Click the document download button (added by Task 9 — renders the doc
    // name as a <button> that streams the authed file blob).
    await page.getByRole('button', { name: 'court-record.pdf' }).click();

    await expect.poll(() => downloadHits).toBeGreaterThan(0);
  });
});
