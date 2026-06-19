import { expect, test } from '@playwright/test';

// ── JWT helper (same pattern as clerk-assignment-and-docs.spec.ts) ────────────

function buildFakeJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.signature`;
}

const FAR_FUTURE_EXP = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365;

async function seedSuperAdminAuth(page: import('@playwright/test').Page) {
  const accessToken = buildFakeJwt({ sub: 'admin-1', role: 'super-admin', exp: FAR_FUTURE_EXP });
  const refreshToken = buildFakeJwt({ sub: 'admin-1', type: 'refresh', exp: FAR_FUTURE_EXP });
  await page.addInitScript(
    ({ access, refresh, user }) => {
      window.localStorage.setItem('wusuq_access_token', access);
      window.localStorage.setItem('wusuq_refresh_token', refresh);
      window.localStorage.setItem('wusuq_user', JSON.stringify(user));
    },
    {
      access: accessToken,
      refresh: refreshToken,
      user: { id: 'admin-1', role: 'super-admin', email: 'superadmin@wusuq.com' },
    },
  );
}

// ── Specs ─────────────────────────────────────────────────────────────────────

test.describe('Workstream-A money UI: tax, promos, reprice', () => {
  // ── 1. Tax settings ─────────────────────────────────────────────────────────
  test('admin sets the tax rate', async ({ page }) => {
    await seedSuperAdminAuth(page);

    // Catch-all first (registered first = lowest priority in Playwright).
    // Returns empty success so all other API calls from PricingRulesBoard etc.
    // resolve without errors.
    await page.route(/\/api\/.*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({}),
      });
    });

    // Tax-specific override — registered after catch-all, so it takes precedence.
    let taxPutBody: Record<string, unknown> | null = null;
    await page.route('**/api/settings/tax', async (route) => {
      const method = route.request().method();
      if (method === 'PUT') {
        taxPutBody = JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ rate: 0.17, enabled: true }),
        });
      } else {
        // GET — return initial state: 0%, disabled
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ rate: 0, enabled: false }),
        });
      }
    });

    await page.goto('/settings/pricing');

    // Wait for TaxSettingsForm to finish loading (spinner disappears; rate input
    // appears with placeholder "e.g. 17" as defined in tax-settings-form.tsx).
    const rateInput = page.getByPlaceholder('e.g. 17');
    await rateInput.waitFor({ timeout: 10_000 });

    // Set the rate to 17 % and enable the toggle.
    // The toggle has role="switch" aria-label="Tax enabled" (tax-settings-form.tsx:132).
    await rateInput.fill('17');
    await page.getByRole('switch', { name: 'Tax enabled' }).click();

    // Submit — button text is "Save Tax Settings" (tax-settings-form.tsx:159).
    await page.getByRole('button', { name: 'Save Tax Settings' }).click();

    // The component converts the entered percentage to a fraction before PUT-ing.
    // Assert the captured body has rate: 0.17 and enabled: true.
    await expect.poll(() => taxPutBody, { timeout: 5_000 }).toMatchObject({
      rate: 0.17,
      enabled: true,
    });
  });

  // ── 2. Promo code creation ───────────────────────────────────────────────────
  test('admin creates a promo code', async ({ page }) => {
    await seedSuperAdminAuth(page);

    await page.route(/\/api\/.*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({}),
      });
    });

    // Promo-specific override: GET returns [], POST captures + returns stub.
    let promoPostBody: Record<string, unknown> | null = null;
    await page.route('**/api/promos', async (route) => {
      const method = route.request().method();
      if (method === 'POST') {
        promoPostBody = JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>;
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'promo-e2e',
            code: 'E2E10',
            type: 'PERCENT',
            value: 10,
            maxDiscount: null,
            startsAt: null,
            endsAt: null,
            totalUsageLimit: null,
            perUserLimit: null,
            serviceScope: [],
            active: true,
            createdAt: new Date().toISOString(),
          }),
        });
      } else {
        // GET — empty list initially
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      }
    });

    await page.goto('/promos');

    // Show the create form — button text is "New Code" (promo-codes-board.tsx:195).
    await page.getByRole('button', { name: 'New Code' }).click();

    // Fill: Code, Type (already PERCENT by default), Value.
    // Inputs use implicit label wrapping; placeholders are the most reliable
    // selector: "e.g. SAVE10" for code (promo-codes-board.tsx:234).
    await page.getByPlaceholder('e.g. SAVE10').fill('E2E10');

    // Type dropdown: default is PERCENT. The select has options
    // "Percent (%)" / "Fixed Amount (PKR)". Leave as PERCENT.

    // Value: placeholder is "e.g. 10" when type === PERCENT (promo-codes-board.tsx:264).
    await page.getByPlaceholder('e.g. 10').fill('10');

    // Submit — button text is "Create Code" (promo-codes-board.tsx:355).
    await page.getByRole('button', { name: 'Create Code' }).click();

    // The component calls .toUpperCase() on the code before POSTing.
    await expect.poll(() => promoPostBody, { timeout: 5_000 }).toMatchObject({
      code: 'E2E10',
      type: 'PERCENT',
      value: 10,
    });
  });

  // ── 3. Reprice dialog shows tax + saves ─────────────────────────────────────
  test('reprice dialog shows tax and saves', async ({ page }) => {
    await seedSuperAdminAuth(page);

    // Minimal ticket fixture sufficient for TicketDetailPanel to render fully
    // and show the "Edit ticket" button (requires !isClerkView && ticket).
    const ticket = {
      id: 't-e2e',
      batchNo: 'TKT-E2E',
      status: 'PAID',
      intakeFlow: 'judicial_case_information',
      totalAmount: 500,
      serviceCost: 500,
      deliveryCharges: 0,
      printingCharges: 0,
      attestedCharges: 0,
      nonAttestedCharges: 0,
      additionalCharges: 0,
      additionalServiceCost: 0,
      clerkCost: 0,
      discountPrice: 0,
      amountPaid: 0,
      formPayload: { case_status: 'Pending Case', year: '2024' },
      assignments: [],
      documents: [],
      consumer: {
        id: 'consumer-1',
        name: 'Test Consumer',
        email: 'consumer@test.com',
        phone: '+923001234567',
        cnic: '12345-1234567-1',
        province: 'Punjab',
        city: 'Lahore',
      },
      service: { id: 's-1', name: 'Case Information', category: 'judicial' },
    };

    await page.route(/\/api\/.*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({}),
      });
    });

    // Ticket GET — must be registered AFTER catch-all to take precedence.
    // Use a URL-string glob that matches the exact ticket path only — NOT the
    // sub-paths /reprice/preview or /reprice (confirmed by clerk spec pattern).
    await page.route('**/api/tickets/t-e2e', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(ticket),
      });
    });

    // Preview POST (ticket-reprice-dialog.tsx fires this 400 ms after mount).
    await page.route('**/api/tickets/t-e2e/reprice/preview', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          resolver: { matched: true },
          charges: { serviceCost: 500 },
          money: {
            chargesSubtotal: 500,
            discountTotal: 0,
            taxableBase: 500,
            taxAmount: 85,
            totalAmount: 585,
          },
        }),
      });
    });

    // PATCH save — capture body.
    let repricePatchBody: Record<string, unknown> | null = null;
    await page.route('**/api/tickets/t-e2e/reprice', async (route) => {
      repricePatchBody = JSON.parse(route.request().postData() ?? '{}') as Record<
        string,
        unknown
      >;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...ticket, totalAmount: 585 }),
      });
    });

    await page.goto('/tickets/t-e2e');

    // TicketDetailPanel renders "Edit ticket" for non-clerk roles with a loaded
    // ticket (ticket-detail-panel.tsx:193-200).
    // User role is 'super-admin' so isClerkView stays false.
    await page.getByRole('button', { name: 'Edit ticket' }).waitFor({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Edit ticket' }).click();

    // Dialog opens (ticket-reprice-dialog.tsx renders a <Dialog open>).
    await expect(page.getByRole('dialog')).toBeVisible();

    // Wait for the preview to resolve (debounce 400 ms + mock API).
    // The dialog renders "New Total" then "PKR <formatted totalAmount>".
    // formatPKR(585) = "585.00" in en-PK locale.
    await expect(page.getByText('New Total')).toBeVisible({ timeout: 5_000 });
    // Tax line: ticket-reprice-dialog.tsx:319 — only renders when taxAmount > 0.
    await expect(page.getByText('Tax')).toBeVisible({ timeout: 5_000 });
    // The formatted values (585.00 and 85.00) appear in the preview section.
    await expect(page.locator('text=PKR').filter({ hasText: '585' }).first()).toBeVisible();
    await expect(page.locator('text=PKR').filter({ hasText: '85' }).first()).toBeVisible();

    // Save is enabled once previewLoading=false.
    // Button text is "Save" (ticket-reprice-dialog.tsx:371).
    await page.getByRole('button', { name: 'Save' }).click();

    // Assert the PATCH was called and the body has the correct shape.
    // discountPrice is a TOP-LEVEL field on RepriceTicketDto, not inside overrides.
    await expect.poll(() => repricePatchBody, { timeout: 5_000 }).toBeTruthy();
    // payload key is always present (extracted from formPayload fields).
    expect(repricePatchBody).toHaveProperty('payload');
    // With no override fields filled, there is no 'overrides' key in the body.
    expect(repricePatchBody).not.toHaveProperty('overrides');
    // discountPrice, when set, appears at the top level — not nested in overrides.
    // (We didn't set it here, so it should be absent; the important thing is it
    // is NOT inside overrides if it were set — see ticket-reprice-dialog.tsx:163.)
    expect(
      (repricePatchBody as { overrides?: { discountPrice?: unknown } })?.overrides
        ?.discountPrice,
    ).toBeUndefined();
  });

  // ── 4. Consumer checkout — documented fixme ──────────────────────────────────
  test.fixme('consumer checkout shows tax + promo lines', async (_page) => {
    // This spec needs a shared intake-wizard driver that takes a consumer
    // through the full multi-step intake wizard (flow-specific steps, court
    // picker, case details, etc.) and lands on the checkout step where the
    // pricing preview — including tax and promo-discount lines — is rendered.
    //
    // The driver does not exist yet. See tests/e2e/payment-gating.spec.ts for
    // the same blocker documented with identical reasoning. Both specs are
    // marked fixme so the gap is visible in the test run rather than silently
    // absent.
    //
    // When the driver is available:
    //   1. Seed a consumer token (role: 'consumer').
    //   2. Navigate to /consumer/intake/<flow> and drive all required fields.
    //   3. Mock /api/pricing-rules/resolve to return a response with
    //      taxAmount > 0 and a non-zero discountTotal.
    //   4. Assert the checkout preview renders the tax line and promo line
    //      with correct formatted amounts.
  });
});
