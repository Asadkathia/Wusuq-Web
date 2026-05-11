/**
 * Scrape District Judiciary Punjab (DSJ Lahore portal) case categories from
 * https://dsjlahore.punjab.gov.pk/
 *
 * The DSJ Lahore home page hosts the unified case-search form used by every
 * Punjab district court. It exposes three cascading selects:
 *
 *   #district_id   — 36 Punjab districts (static, embedded server-side)
 *   #court_id      — Court Name, AJAX-populated via `getjudges/<dID>/0` on
 *                    district change
 *   #casecate_id   — Case Category, STATIC and embedded server-side; the
 *                    page's JS (`js/pagescript/home.js`) wires the district
 *                    `change` event to repopulate police stations and courts
 *                    but never touches the case-category select.
 *
 * Selector strategy:
 *   1. Primary: `#casecate_id` (id confirmed against live HTML).
 *   2. Fallback A: `select[name="casecate_id"]`.
 *   3. Same for the district select: `#district_id`, fallback
 *      `select[name="district_id"]`.
 *
 * Because the case-category options are server-rendered into the initial HTML
 * and the page's own JS never mutates them on district change, the catalog is
 * a single shared vocabulary across all 36 districts. We empirically verify
 * this in the scraper by:
 *   a) Capturing the case-category options on the unmodified page.
 *   b) For each district, dispatching `change` (and waiting briefly for any
 *      AJAX that *might* alter the case-cate select), then re-capturing and
 *      asserting the option set is byte-identical to the baseline. If a
 *      district ever produced a different list we'd want to know — fail
 *      loudly so the snapshot doesn't silently lose vocabulary.
 *
 * The task spec says each emitted row should include `district` and
 * `region: 'Punjab'`. Because the underlying vocabulary is truly shared, the
 * faithful representation is one row per (district × case-type) — every
 * district keeps its complete catalog and downstream consumers can resolve
 * (district, code) → row deterministically without special-casing "global"
 * rows.
 *
 * Run: cd apps/api && pnpm exec ts-node scripts/scrape-case-types/scrape-dsj-lahore.ts
 */
import { withBrowser, writeOutput, type ScrapedRow } from './shared';

const URL = 'https://dsjlahore.punjab.gov.pk/';
const SOURCE = 'dsjlahore.punjab.gov.pk';
const COURT_LEVEL = 'Lower Court';
const REGION = 'Punjab';
const MIN_TOTAL_ROWS = 50; // floor across ALL districts combined

type OptionPair = { value: string; text: string };

async function main() {
  const rows = await withBrowser(async (_, page) => {
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });

    // Confirm both selects exist using documented selectors.
    await page.waitForSelector(
      '#district_id, select[name="district_id"]',
      { state: 'attached', timeout: 30_000 },
    );
    await page.waitForSelector(
      '#casecate_id, select[name="casecate_id"]',
      { state: 'attached', timeout: 30_000 },
    );

    // Read district options (skip placeholder with empty value).
    const districts: OptionPair[] = await page.evaluate(() => {
      const sel = (document.querySelector('#district_id') ??
        document.querySelector('select[name="district_id"]')) as
        | HTMLSelectElement
        | null;
      if (!sel) return [];
      return Array.from(sel.options)
        .map((o) => ({ value: o.value, text: (o.textContent ?? '').trim() }))
        .filter((o) => o.value && o.value !== '0');
    });

    if (districts.length === 0) {
      throw new Error(
        'DSJ Lahore: could not read districts from #district_id. Source page may have changed.',
      );
    }

    // Capture the baseline case-category options.
    const readCaseCats = async (): Promise<OptionPair[]> =>
      page.evaluate(() => {
        const sel = (document.querySelector('#casecate_id') ??
          document.querySelector('select[name="casecate_id"]')) as
          | HTMLSelectElement
          | null;
        if (!sel) return [];
        return Array.from(sel.options).map((o) => ({
          value: o.value,
          text: (o.textContent ?? '').trim(),
        }));
      });

    const baseline = await readCaseCats();
    const baselineReal = baseline.filter((o) => o.value && o.value !== '0');
    if (baselineReal.length === 0) {
      throw new Error(
        'DSJ Lahore: case-category select is empty. Source page may have changed.',
      );
    }

    const baselineKey = baselineReal
      .map((o) => `${o.value}::${o.text}`)
      .sort()
      .join('|');

    // For each district, select it, give any AJAX 1.5s, then re-read the
    // case-category options and assert the set is unchanged. Build per-
    // district rows from the (verified-stable) baseline.
    const all: ScrapedRow[] = [];

    for (const d of districts) {
      await page.evaluate((val: string) => {
        const sel = (document.querySelector('#district_id') ??
          document.querySelector('select[name="district_id"]')) as
          | HTMLSelectElement
          | null;
        if (!sel) return;
        sel.value = val;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      }, d.value);

      // Wait for any AJAX (courts / police stations) to settle. The case-cat
      // select is static but we want to give it every chance to mutate.
      await page.waitForTimeout(1500);

      const after = await readCaseCats();
      const afterReal = after.filter((o) => o.value && o.value !== '0');
      const afterKey = afterReal
        .map((o) => `${o.value}::${o.text}`)
        .sort()
        .join('|');
      if (afterKey !== baselineKey) {
        // Surprise: case categories DID change for this district. Fail loudly
        // so a human can decide how to model this rather than silently emit
        // a partial catalog.
        throw new Error(
          `DSJ Lahore: case-category options changed after selecting district ` +
            `${d.text} (id=${d.value}). Expected static catalog. Aborting so ` +
            `the data model can be revisited.`,
        );
      }

      afterReal.forEach((o, i) => {
        const label = o.text.replace(/\s+/g, ' ').trim();
        if (!label || /^select/i.test(label) || label === '-') return;
        if (label.length >= 120) return;
        all.push({
          courtLevel: COURT_LEVEL,
          district: d.text,
          region: REGION,
          code: label,
          label,
          source: SOURCE,
          priority: 1000 - i,
        });
      });
    }

    console.log(
      `DSJ Lahore: ${districts.length} districts × ${baselineReal.length} case categories = ${all.length} rows`,
    );
    return all;
  });

  writeOutput('dsj-lahore.json', rows, MIN_TOTAL_ROWS);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
