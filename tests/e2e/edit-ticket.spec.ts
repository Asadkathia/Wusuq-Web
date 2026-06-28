import { test, expect } from '@playwright/test';

// ── JWT helper (same pattern as pricing-tax-promo.spec.ts) ────────────────────

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

test.describe('Edit-ticket wizard: pre-fill + reprice flow', () => {
  // ── 1. Edit mode banner + GET ticket fetch ────────────────────────────────
  test('wizard recognises editTicketId, shows edit-mode banner, and fetches the ticket', async ({ page }) => {
    await seedSuperAdminAuth(page);

    // Catch-all first (registered first = lowest priority in Playwright).
    // Returns empty object so unrelated scalar-endpoint API calls resolve.
    await page.route(/\/api\/.*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({}),
      });
    });

    // The intake wizard calls several endpoints that expect arrays on mount.
    // Returning {} for those crashes when the component tries .find()/.map().
    // Override each with an empty array — registered after catch-all so they
    // take precedence (Playwright LIFO route priority).
    await page.route(/\/api\/geo\/provinces$/, async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });
    await page.route(/\/api\/geo\/cities$/, async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });
    await page.route(/\/api\/services\?/, async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });
    await page.route('**/api/settings/tax/rate', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ rate: 0 }) });
    });

    // Track whether the prefill effect fetched the ticket.
    let ticketFetchCount = 0;
    const ticketFixture = {
      id: 'tkt-1',
      consumerId: 'c1',
      intakeFlow: 'judicial_case_files',
      formPayload: {
        case_title: 'A vs B',
        city_id: 'city-1',
        select_court_type: 'Lower Court',
        case_status: 'Pending Case',
        required_documentations: 'doc_only_petition',
      },
    };

    // Specific ticket GET override — registered after catch-all → takes precedence.
    // Method-guarded so any unexpected non-GET to this path falls through.
    await page.route('**/api/tickets/tkt-1', async (route) => {
      if (route.request().method() === 'GET') {
        ticketFetchCount++;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(ticketFixture),
        });
      } else {
        await route.fallback();
      }
    });

    // Courts for the pre-filled city — returns an empty group list so the
    // cityCourtsLoaded flag resolves to true without blocking the render.
    await page.route('**/api/geo/cities/city-1/courts', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    // PATCH /reprice infrastructure — in place so the route resolves if the
    // submit path is ever reached (see fixme test 3 below).
    await page.route('**/api/tickets/tkt-1/reprice', async (route) => {
      if (route.request().method() !== 'PATCH') { await route.fallback(); return; }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'tkt-1', totalAmount: 9999 }),
      });
    });

    await page.goto('/paralegal-services/judicial/case-files?editTicketId=tkt-1');

    // ── Pre-fill assertions ──────────────────────────────────────────────────

    // The edit-mode banner (intake-wizard.tsx ~line 2088) renders as soon as
    // editMode = Boolean(editTicketId) = true, which is derived synchronously
    // from useSearchParams() — no network round-trip is required.  This is the
    // primary observable proof that the URL param was correctly parsed and the
    // wizard entered edit mode.
    await expect(
      page.getByText('Editing this ticket — your changes update it and re-price the total. No new ticket is created.'),
    ).toBeVisible({ timeout: 10_000 });

    // The edit prefill effect fires an async GET /tickets/:id after mount.
    // Polling the intercept counter confirms the effect ran and the route mock
    // returned the ticket fixture.
    await expect.poll(() => ticketFetchCount, { timeout: 5_000 }).toBe(1);

    // Step 1 heading confirms the wizard rendered and positioned itself on the
    // first display step.  edit prefill sets draft.step = 1 (intake-wizard.tsx
    // ~line 1004) and displaySteps[0].title is "City, Court & Service" for all
    // judicial flows.
    await expect(
      page.locator('h3').filter({ hasText: 'City, Court & Service' }).first(),
    ).toBeVisible();
  });

  // ── 2. case_title pre-fill — fixme ────────────────────────────────────────
  test.fixme('case-title input shows prefilled value "A vs B" on step 2', async (_page) => {
    // The case_title field lives on step 2 ("Case Details").  Advancing from
    // step 1 → step 2 requires validateCurrentStep() to pass, which checks:
    //   (a) draft.serviceId — NOT restored by the edit prefill (it only
    //       restores formPayload fields + consumerId; serviceId is a separate
    //       TicketDraft field); and
    //   (b) draft.payload.select_court — the formPayload supplies
    //       select_court_type but the validator checks select_court (the court
    //       name string set by clicking a court tile in the UI).
    //
    // In a mock-API environment there is no reliable way to satisfy (a)/(b)
    // without a full step-1 interaction driver that:
    //   1. Mocks GET /api/services?type=judicial&limit=50 to return at least one
    //      Lower Court service tile.
    //   2. Mocks GET /api/geo/cities/city-1/courts to return a non-empty court
    //      group with a single court (triggering the auto-select path in the
    //      wizard, intake-wizard.tsx ~line 662).
    //   3. Clicks the service tile so setField('serviceId', ...) fires.
    //   4. Waits for the court auto-select to set select_court in the payload.
    //   5. Clicks "Continue" to advance to step 2.
    //   6. Asserts:  await expect(page.getByLabel('Case Title')).toHaveValue('A vs B');
    //
    // This shared step-1 driver does not exist yet — same gap documented for
    // payment-gating.spec.ts in CLAUDE.md.  Marking fixme so the gap is
    // visible in the test run rather than silently absent.
  });

  // ── 3. Submit sends PATCH /reprice — fixme ────────────────────────────────
  test.fixme('submitting the wizard in edit mode fires PATCH /tickets/tkt-1/reprice with the edited payload', async (_page) => {
    // Full submission requires navigating all four display steps of the
    // judicial_case_files wizard:
    //   step 1 (City, Court & Service) — blocked by missing serviceId +
    //     select_court (same driver gap as test 2 above)
    //   step 2 (Case Details) — prefill data is loaded, but required fields
    //     like case_type (fetched from /api/case-types) and judge_designation
    //     must pass per-step validation
    //   step 3 (Documents Required) — set_type / required_documentations /
    //     delivery mode must be filled
    //   step 4 (Documents & Delivery) — "Submit ticket" button is present here
    //
    // The PATCH /tickets/tkt-1/reprice route mock is already wired in test 1
    // (returns { id:'tkt-1', totalAmount:9999 }).  Once the driver exists,
    // assert:
    //
    //   const repriceBody = <captured from the PATCH route mock>;
    //   expect(repriceBody).toMatchObject({
    //     payload: expect.objectContaining({ case_title: 'A vs B' }),
    //   });
    //   await expect(page).toHaveURL(/\/tickets\/tkt-1/);
    //
    // And verify no extra 'overrides' key is accidentally added (same shape
    // check as the reprice dialog test in pricing-tax-promo.spec.ts).
  });
});
