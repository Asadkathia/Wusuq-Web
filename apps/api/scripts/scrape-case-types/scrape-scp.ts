/**
 * Scrape Supreme Court of Pakistan case types from
 * https://scp.gov.pk/OnlineCaseInformation
 *
 * The page renders a "Case Type" <select> with ~30 options. We capture each
 * option's text and use it as both `code` and `label` (SCP values are
 * already short canonical codes like "C.A.", "C.M.A.", etc.).
 *
 * Run: cd apps/api && pnpm tsx scripts/scrape-case-types/scrape-scp.ts
 */
import { withBrowser, writeOutput, type ScrapedRow } from './shared';

const URL = 'https://scp.gov.pk/OnlineCaseInformation';
const SOURCE = 'scp.gov.pk';
const COURT_LEVEL = 'Supreme Court';
const MIN_ROWS = 20;

async function main() {
  const rows = await withBrowser(async (_, page) => {
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForSelector('#ContentPlaceHolder1_ddlCaseType', {
      state: 'attached',
      timeout: 30_000,
    });
    const options: { value: string; text: string }[] = await page.evaluate(() => {
      const sel = document.querySelector(
        '#ContentPlaceHolder1_ddlCaseType',
      ) as HTMLSelectElement | null;
      if (!sel) return [];
      return Array.from(sel.options)
        .map((o) => ({ value: o.value, text: o.textContent?.trim() ?? '' }))
        .filter(
          (o) =>
            o.text &&
            o.text !== '-- Select --' &&
            o.text !== '-' &&
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

  writeOutput('scp.json', rows, MIN_ROWS);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
