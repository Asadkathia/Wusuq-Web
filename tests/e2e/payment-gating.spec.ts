import { test, expect } from '@playwright/test';

// Pre-reqs documented in CLAUDE.md "Local Dev Seed":
//   consumer: testconsumer@wusuq.com / password123
//   staff:    superadmin@wusuq.com  / password
// NEXT_PUBLIC_PAYMENT_PROVIDER must be 'mock' for the dev mock-resolve UI to render.

test.describe('payment gating', () => {
  test.fixme(
    'consumer pays via mock gateway and ticket becomes assignable',
    async ({ page }) => {
      // 1. log in as consumer
      await page.goto('/consumer/login/email');
      await page.getByLabel(/email/i).fill('testconsumer@wusuq.com');
      await page.getByLabel(/password/i).fill('password123');
      await page.getByRole('button', { name: /log in/i }).click();
      await page.waitForURL(/\/consumer\/dashboard/);

      // 2. submit an intake flow
      // TODO: factor the existing intake-submission helper out of
      // tests/e2e/* (the Cases/Tickets specs already drive the wizard);
      // wire it up here and remove this fixme.
      throw new Error('intake submission helper not yet shared with this spec');

      // 3. expect redirect to /consumer/tickets/<id>/pay
      // await expect(page).toHaveURL(/\/consumer\/tickets\/.+\/pay/);

      // 4. Pay Now → mock checkout
      // await page.getByRole('button', { name: /pay now/i }).click();
      // await expect(page).toHaveURL(/\/consumer\/payments\/mock\//);

      // 5. Success → return page → confirm "Payment received"
      // await page.getByRole('button', { name: /^success$/i }).click();
      // await expect(page.getByText(/payment received/i)).toBeVisible({ timeout: 15_000 });
    },
  );

  test.fixme(
    'pay later parks the ticket in Unpaid tab and admin assignment is blocked',
    async ({ page, request }) => {
      // Same setup, choose "Pay Later" on the pay page.
      // Verify dashboard?tab=unpaid shows the ticket.
      // Then, as an admin (separate token via request.newContext with Authorization),
      // PATCH /api/tickets/:id with { status: 'ASSIGNED' } and assert 403.
      throw new Error('admin-assignment-blocked path requires intake submission helper');
    },
  );
});
