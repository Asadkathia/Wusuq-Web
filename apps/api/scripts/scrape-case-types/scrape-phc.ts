/**
 * Scrape Peshawar High Court case types from
 * https://www.peshawarhighcourt.gov.pk/app/site/15/p/Search_For_Case.html
 *
 * PHC's Case Status page is a server-rendered PHP page. The case-type
 * dropdown is `#search_casename` (name="search_casename") with every option
 * inlined in the initial HTML — no AJAX hydration. Each option's value and
 * visible text are identical (the canonical short PHC case-type label, e.g.
 * "Writ Petition", "Cr.M Transit Bail App: Extension").
 *
 * Selector strategy:
 *   1. Primary: `#search_casename` (id confirmed via curl probe of source).
 *   2. Fallback A: `select[name="search_casename"]`.
 *   3. Fallback B: any <select> whose preceding/associated label text
 *      matches /case\s*(type|name|category)/i.
 *
 * Each row carries `highCourtCode: 'PHC'` to distinguish from sibling High
 * Courts (IHC, SHC, LHC, BHC).
 *
 * Run: cd apps/api && pnpm exec ts-node scripts/scrape-case-types/scrape-phc.ts
 */
import { withBrowser, writeOutput, type ScrapedRow } from './shared';

const URL = 'https://www.peshawarhighcourt.gov.pk/app/site/15/p/Search_For_Case.html';
const SOURCE = 'peshawarhighcourt.gov.pk';
const COURT_LEVEL = 'High Court';
const HIGH_COURT_CODE = 'PHC';
const MIN_ROWS = 15;

async function main() {
  const rows = await withBrowser(async (_, page) => {
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });

    await page.waitForSelector(
      '#search_casename, select[name="search_casename"]',
      { state: 'attached', timeout: 30_000 },
    );

    const opts: Array<{ value: string; label: string }> = await page.evaluate(() => {
      let sel = document.querySelector('#search_casename') as HTMLSelectElement | null;
      if (!sel) {
        sel = document.querySelector(
          'select[name="search_casename"]',
        ) as HTMLSelectElement | null;
      }
      if (!sel) {
        // Fallback: locate any <select> whose associated label text mentions
        // "case type/name/category". Don't blindly pick the largest select.
        const labels = Array.from(document.querySelectorAll('label')) as HTMLLabelElement[];
        for (const lab of labels) {
          if (!/case\s*(type|name|category)/i.test(lab.textContent ?? '')) continue;
          const id = lab.htmlFor;
          if (id) {
            const cand = document.getElementById(id) as HTMLSelectElement | null;
            if (cand && cand.tagName === 'SELECT') {
              sel = cand;
              break;
            }
          }
        }
      }
      if (!sel) return [];
      return Array.from(sel.options).map((o) => ({
        value: (o.value ?? '').trim(),
        label: (o.textContent ?? '').trim(),
      }));
    });

    if (opts.length === 0) {
      throw new Error(
        'PHC: could not locate case-type <select> (#search_casename / name=search_casename / label-anchored). ' +
          'Source page may have changed.',
      );
    }

    return opts
      .filter(
        (o) =>
          o.label &&
          o.label.length < 120 &&
          !/^select(\s|$|\.\.\.|all)/i.test(o.label) &&
          o.label !== '-' &&
          // Skip the empty "Select All" placeholder (value="")
          o.value !== '',
      )
      .map<ScrapedRow>((o, i) => {
        // PHC uses the full label as both value and visible text, so use it
        // for both code and label. No separate short alias is exposed.
        const label = o.label;
        const code = o.value || o.label;
        return {
          courtLevel: COURT_LEVEL,
          highCourtCode: HIGH_COURT_CODE,
          code,
          label,
          source: SOURCE,
          priority: 1000 - i,
        };
      });
  });

  writeOutput('phc.json', rows, MIN_ROWS);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
