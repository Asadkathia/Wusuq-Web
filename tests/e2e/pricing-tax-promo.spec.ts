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
