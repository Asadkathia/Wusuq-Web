/**
 * Scrape Federal Constitutional Court of Pakistan case types from
 * https://www.fccp.gov.pk/online-case-information
 *
 * The page exposes three <select> elements: case_type, registry, case_year.
 * We target the case-type select by its id (`#case_type`) which is also
 * confirmed by an adjacent <label> reading "Case Type". Option text values
 * are short canonical codes (e.g. "C.A.", "C.M.A.", "C.P.L.A."), so we use
 * them as both `code` and `label`.
 *
 * Selector strategy:
 *   1. Primary: `#case_type` (verified via probe).
 *   2. Fallback: locate <label> whose text matches /case ?type/i and use
 *      `label.htmlFor` to find the related select.
 *
 * Do NOT just take "the largest select" — registries/years can be larger
 * on similar court portals (see SCP, where the Advocates dropdown had
 * 4,639 entries).
 *
 * Run: cd apps/api && pnpm exec ts-node scripts/scrape-case-types/scrape-fcc.ts
 */
import { withBrowser, writeOutput, type ScrapedRow } from './shared';

const URL = 'https://www.fccp.gov.pk/online-case-information';
const SOURCE = 'fccp.gov.pk';
const COURT_LEVEL = 'Federal Constitutional Court';
const MIN_ROWS = 15;

async function main() {
  const rows = await withBrowser(async (_, page) => {
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForSelector('#case_type, select[name="case_type"]', {
      state: 'attached',
      timeout: 30_000,
    });

    const options: { value: string; text: string }[] = await page.evaluate(() => {
      // Primary: id-based lookup.
      let sel = document.querySelector('#case_type') as HTMLSelectElement | null;
      // Fallback 1: name-based.
      if (!sel) {
        sel = document.querySelector(
          'select[name="case_type"]',
        ) as HTMLSelectElement | null;
      }
      // Fallback 2: <label for=...> with text matching /case ?type/i.
      if (!sel) {
        const labels = Array.from(document.querySelectorAll('label'));
        const match = labels.find((l) =>
          /case\s*type/i.test(l.textContent ?? ''),
        );
        if (match && (match as HTMLLabelElement).htmlFor) {
          sel = document.getElementById(
            (match as HTMLLabelElement).htmlFor,
          ) as HTMLSelectElement | null;
        }
      }
      if (!sel) return [];
      return Array.from(sel.options)
        .map((o) => ({ value: o.value, text: o.textContent?.trim() ?? '' }))
        .filter(
          (o) =>
            o.text &&
            o.text !== '-- Select --' &&
            o.text !== '-' &&
            o.text !== 'Select' &&
            o.text.length < 80,
        );
    });

    return options.map<ScrapedRow>((o, i) => ({
      courtLevel: COURT_LEVEL,
      code: o.text,
      label: o.text,
      source: SOURCE,
      priority: 1000 - i,
    }));
  });

  writeOutput('fcc.json', rows, MIN_ROWS);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
