/**
 * Scrape Balochistan High Court case types from
 * https://portal.bhc.gov.pk/case-status (Vuetify SPA — Nuxt).
 *
 * The case-status form has two modes: "Search By Case Id" (default) and
 * "Advanced Search". Only Advanced Search renders the Category dropdown. The
 * SPA loads categories by calling its REST API:
 *
 *   POST https://api.bhc.gov.pk/login
 *     body: { "email": "guest@bhc.gov.pk", "password": "<public guest pw>" }
 *     → { token: "Bearer 48879|..." }
 *
 *   POST https://api.bhc.gov.pk/v2/categories
 *     header: Authorization: Bearer <token>
 *     → [{ CATEGORY_ID: "Admt Appeal", CATEGORY_NAME: "Admt Appeal" }, ...]
 *
 * Both credentials are baked into the public SPA bundle (`guest@bhc.gov.pk`
 * is BHC's published anonymous portal account). They are observable in the
 * browser DevTools and shipped to every visitor — they're not secrets.
 *
 * Selector strategy:
 *   1. Navigate the SPA to /case-status and click "Advanced Search". Wait for
 *      the API call we care about (api.bhc.gov.pk/v2/categories) to land —
 *      this also verifies that BHC hasn't moved the endpoint.
 *   2. Read the captured response body. If we miss it (e.g. cache), fall back
 *      to re-issuing the request from inside the page so the Bearer token in
 *      localStorage and same-origin headers apply.
 *
 * Each row carries `highCourtCode: 'BHC'` to distinguish from sibling High
 * Courts (IHC, SHC, LHC, PHC).
 *
 * Run: cd apps/api && pnpm exec ts-node scripts/scrape-case-types/scrape-bhc.ts
 */
import { withBrowser, writeOutput, type ScrapedRow } from './shared';

const PAGE_URL = 'https://portal.bhc.gov.pk/case-status';
const CATEGORIES_URL = 'https://api.bhc.gov.pk/v2/categories';
const SOURCE = 'portal.bhc.gov.pk';
const COURT_LEVEL = 'High Court';
const HIGH_COURT_CODE = 'BHC';
const MIN_ROWS = 10;

type BhcCategory = {
  CATEGORY_ID: string;
  CATEGORY_NAME: string;
};

async function main() {
  const rows = await withBrowser(async (_, page) => {
    // Capture the categories response while the SPA fetches it after we
    // toggle Advanced Search.
    const responsePromise = page
      .waitForResponse(
        (resp) => resp.url() === CATEGORIES_URL && resp.status() === 200,
        { timeout: 45_000 },
      )
      .catch(() => null);

    await page.goto(PAGE_URL, { waitUntil: 'networkidle', timeout: 60_000 });
    await page.waitForTimeout(2000);

    // Toggle into Advanced Search so the SPA loads the Category list.
    try {
      await page.getByText('Advanced Search', { exact: true }).click({ timeout: 10_000 });
    } catch {
      // If the label moves, fall back to a more permissive locator.
      await page.locator('label:has-text("Advanced Search")').first().click({ timeout: 10_000 });
    }

    const captured = await responsePromise;
    let cats: BhcCategory[] = [];

    if (captured) {
      cats = (await captured.json()) as BhcCategory[];
    } else {
      // Fallback: replay the request from inside the page with the bearer
      // token the SPA stashed in localStorage.
      cats = await page.evaluate(async (catUrl: string) => {
        const tok = localStorage.getItem('auth._token.local') ?? '';
        const resp = await fetch(catUrl, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            Authorization: tok,
            'Content-Type': 'application/json',
          },
        });
        if (!resp.ok) throw new Error(`categories HTTP ${resp.status}`);
        return (await resp.json()) as Array<{
          CATEGORY_ID: string;
          CATEGORY_NAME: string;
        }>;
      }, CATEGORIES_URL);
    }

    if (!Array.isArray(cats) || cats.length === 0) {
      throw new Error(
        'BHC: /v2/categories returned no rows. The BHC portal may have changed ' +
          'its public guest auth flow or endpoint path.',
      );
    }

    return cats
      .map((c) => ({
        label: (c.CATEGORY_NAME ?? '').trim(),
        code: (c.CATEGORY_ID ?? '').trim() || (c.CATEGORY_NAME ?? '').trim(),
      }))
      .filter(
        (r) =>
          r.label &&
          r.code &&
          r.label.length < 120 &&
          r.code.length < 60 &&
          r.label !== '-' &&
          r.label.toLowerCase() !== 'select',
      )
      .map<ScrapedRow>((r, i) => ({
        courtLevel: COURT_LEVEL,
        highCourtCode: HIGH_COURT_CODE,
        code: r.code,
        label: r.label,
        source: SOURCE,
        priority: 1000 - i,
      }));
  });

  writeOutput('bhc.json', rows, MIN_ROWS);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
