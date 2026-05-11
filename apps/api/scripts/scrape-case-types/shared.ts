/**
 * Shared utilities for the case-type scrapers.
 *
 * Each scraper produces a JSON file at apps/api/data/case-types/<source>.json
 * containing rows of { courtLevel, subCourt?, district?, region?, highCourtCode?, code, label, source, priority? }.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';

export type ScrapedRow = {
  courtLevel: string;
  subCourt?: string | null;
  district?: string | null;
  region?: string | null;
  highCourtCode?: string | null;
  code: string;
  label: string;
  source: string;
  priority?: number;
};

const DATA_DIR = join(__dirname, '..', '..', 'data', 'case-types');

export async function withBrowser<T>(fn: (browser: Browser, page: Page) => Promise<T>): Promise<T> {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    return await fn(browser, page);
  } finally {
    await browser.close();
  }
}

/**
 * Refuses to overwrite the JSON file if the scraped row count is below the
 * supplied floor. Catches "site redesign broke our selectors" failure mode.
 */
export function writeOutput(filename: string, rows: ScrapedRow[], minRows: number): void {
  if (rows.length < minRows) {
    throw new Error(
      `Scraper produced ${rows.length} rows; floor is ${minRows}. ` +
        `Refusing to overwrite ${filename}. The source site may have changed.`,
    );
  }
  const outPath = join(DATA_DIR, filename);
  writeFileSync(outPath, JSON.stringify(rows, null, 2));
  console.log(`Wrote ${rows.length} rows → ${outPath}`);
}
