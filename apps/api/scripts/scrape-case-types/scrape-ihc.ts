/**
 * Scrape Islamabad High Court case types from
 * https://mis.ihc.gov.pk/frmCseSrch
 *
 * The page is an ASP.NET case-search form. The case-type dropdown is
 * `#ddlCategory` (name="ddlCategory"), confirmed by a `data-placeholder`
 * of "Select Case Category". It is populated dynamically via a POST to
 * `/ihc.asmx/GetCseCatGI` with `{ PCIRCUITCODE: <institution> }` (the
 * institution defaults to `1` = Islamabad High Court).
 *
 * Selector strategy:
 *   1. Primary: `#ddlCategory` (verified via curl probe of the source HTML).
 *   2. Fallback A: `select[name="ddlCategory"]`.
 *   3. Fallback B: locate any <select> whose `data-placeholder` matches
 *      /case ?(type|category)/i.
 *
 * Because the options are loaded by AJAX after page load, we drive the page
 * in two stages:
 *   a) Navigate, find the select element (selector strategy above).
 *   b) Fetch the JSON endpoint from the page's own origin (so cookies/CSRF
 *      headers carry naturally) and extract { CASENAMECODE, CASENAME,
 *      CASENAME_ALIAS } rows.
 *
 * Do NOT just take "the largest select" — IHC has 7+ selects on the page
 * (years, police stations, diary types, etc.) and several can grow large
 * after AJAX hydration.
 *
 * Each row carries `highCourtCode: 'IHC'` to distinguish from sibling High
 * Courts (SHC, LHC, BHC, PHC) which all share courtLevel = 'High Court'.
 *
 * Run: cd apps/api && pnpm exec ts-node scripts/scrape-case-types/scrape-ihc.ts
 */
import { withBrowser, writeOutput, type ScrapedRow } from './shared';

const URL = 'https://mis.ihc.gov.pk/frmCseSrch';
const SOURCE = 'mis.ihc.gov.pk';
const COURT_LEVEL = 'High Court';
const HIGH_COURT_CODE = 'IHC';
const MIN_ROWS = 20;

type IhcCategory = {
  CASENAMECODE: number | string;
  CASENAME: string;
  CASENAME_ALIAS?: string;
};

async function main() {
  const rows = await withBrowser(async (_, page) => {
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });

    // Confirm the case-type select element exists on the page using the
    // documented selector strategy. We don't read options from it (it is
    // populated by AJAX after init); we just verify the element so that if
    // the source ever renames `ddlCategory` we fail loudly.
    await page.waitForSelector(
      '#ddlCategory, select[name="ddlCategory"], select[data-placeholder*="Category" i], select[data-placeholder*="Case Type" i]',
      { state: 'attached', timeout: 30_000 },
    );

    const selectorOk: boolean = await page.evaluate(() => {
      let sel = document.querySelector('#ddlCategory') as HTMLSelectElement | null;
      if (!sel) {
        sel = document.querySelector(
          'select[name="ddlCategory"]',
        ) as HTMLSelectElement | null;
      }
      if (!sel) {
        const selects = Array.from(document.querySelectorAll('select')) as HTMLSelectElement[];
        sel =
          selects.find((s) =>
            /case\s*(type|category)/i.test(s.getAttribute('data-placeholder') ?? ''),
          ) ?? null;
      }
      return !!sel;
    });

    if (!selectorOk) {
      throw new Error(
        'IHC: could not locate case-type <select> via id (#ddlCategory), ' +
          'name (ddlCategory), or data-placeholder. Source page may have changed.',
      );
    }

    // Fetch the AJAX endpoint from within the browser so cookies / same-origin
    // policy match exactly what the page would do.
    const raw: string = await page.evaluate(async () => {
      const resp = await fetch('/ihc.asmx/GetCseCatGI', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          Accept: 'application/json',
        },
        body: JSON.stringify({ PCIRCUITCODE: '1' }),
      });
      if (!resp.ok) throw new Error(`GetCseCatGI HTTP ${resp.status}`);
      const json = (await resp.json()) as { d: string };
      return json.d;
    });

    const cats = JSON.parse(raw) as IhcCategory[];

    return cats
      .map((c) => {
        const label = (c.CASENAME ?? '').trim();
        const aliasRaw = (c.CASENAME_ALIAS ?? '').trim();
        // Prefer the short alias as the code; fall back to the long name if
        // alias is empty or duplicates the name verbatim with no shortening.
        const code = aliasRaw && aliasRaw !== label ? aliasRaw : label;
        return { label, code };
      })
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

  writeOutput('ihc.json', rows, MIN_ROWS);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
