/**
 * Scrape Sindh High Court case types from
 * https://cases.shc.gov.pk/khi/web/index.php?r=cases%2Fsearch
 *
 * The SHC case-search page is a Yii2 application using the Krajee Select2
 * widget. The case-type dropdown is `#casessearch-casenamecode`
 * (name="CasesSearch[CASENAMECODE]"). Its options are not embedded in the
 * page HTML — the Select2 widget hydrates them on demand via a JSON AJAX
 * endpoint declared inline as:
 *
 *   window.select2_3db9e58c = {"ajax":{
 *     "placeholder":"Select a category ...",
 *     "url":"/khi/web/index.php?r=settings%2Fsearch-case-name",
 *     "dataType":"json",
 *     "data": function(params) { return { q: params.term }; }
 *   }, ...}
 *
 * Calling the endpoint with an empty `q` returns the full set (verified
 * against the live source: 74 rows of {id, text}).
 *
 * Selector strategy:
 *   1. Primary: `#casessearch-casenamecode` (id confirmed via curl probe).
 *   2. Fallback A: `select[name="CasesSearch[CASENAMECODE]"]`.
 *
 * Because Select2 loads via AJAX, we don't try to scrape <option> tags from
 * the rendered DOM (they don't exist until the user types). Instead we:
 *   a) Navigate the page, verify the select element exists with our
 *      documented selectors (fail-fast if SHC renames it).
 *   b) Fetch the JSON endpoint from inside the page so cookies / same-origin
 *      policy match what the page itself would do.
 *
 * Each row carries `highCourtCode: 'SHC'` to distinguish from sibling High
 * Courts (IHC, LHC, BHC, PHC) which all share courtLevel = 'High Court'.
 *
 * Run: cd apps/api && pnpm exec ts-node scripts/scrape-case-types/scrape-shc.ts
 */
import { withBrowser, writeOutput, type ScrapedRow } from './shared';

const URL = 'https://cases.shc.gov.pk/khi/web/index.php?r=cases%2Fsearch';
const SOURCE = 'cases.shc.gov.pk';
const COURT_LEVEL = 'High Court';
const HIGH_COURT_CODE = 'SHC';
const MIN_ROWS = 20;
const AJAX_PATH = '/khi/web/index.php?r=settings%2Fsearch-case-name';

type ShcCaseName = {
  id: number | string;
  text: string;
};

async function main() {
  const rows = await withBrowser(async (_, page) => {
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });

    // Confirm the case-type select element exists on the page via our
    // documented selector strategy. We don't read options from it (Select2
    // populates via AJAX on demand); we just verify the element so that if
    // SHC ever renames `casessearch-casenamecode` we fail loudly.
    await page.waitForSelector(
      '#casessearch-casenamecode, select[name="CasesSearch[CASENAMECODE]"]',
      { state: 'attached', timeout: 30_000 },
    );

    const selectorOk: boolean = await page.evaluate(() => {
      let sel = document.querySelector(
        '#casessearch-casenamecode',
      ) as HTMLSelectElement | null;
      if (!sel) {
        sel = document.querySelector(
          'select[name="CasesSearch[CASENAMECODE]"]',
        ) as HTMLSelectElement | null;
      }
      return !!sel;
    });

    if (!selectorOk) {
      throw new Error(
        'SHC: could not locate case-type <select> via id ' +
          '(#casessearch-casenamecode) or name (CasesSearch[CASENAMECODE]). ' +
          'Source page may have changed.',
      );
    }

    // Hit the Select2 AJAX endpoint from within the browser. Empty `q`
    // returns the complete dataset (verified live).
    const payload: { results: ShcCaseName[] } = await page.evaluate(
      async (ajaxPath: string) => {
        const resp = await fetch(ajaxPath + '&q=', {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
          },
        });
        if (!resp.ok) throw new Error(`search-case-name HTTP ${resp.status}`);
        return (await resp.json()) as { results: ShcCaseName[] };
      },
      AJAX_PATH,
    );

    const results = payload.results ?? [];

    return results
      .map((c) => {
        const label = (c.text ?? '').trim();
        // SHC returns no separate short alias — the `text` field is already
        // the canonical short form used on cause lists (e.g. "Const. P.",
        // "Cr.Appeal"). Use it as both label and code.
        return { label, code: label };
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

  writeOutput('shc.json', rows, MIN_ROWS);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
