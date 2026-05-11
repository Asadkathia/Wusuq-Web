/**
 * Scrape Lahore High Court case types.
 *
 * STATUS: BLOCKED at time of writing (May 2026). The script is checked in so
 * we can re-probe quickly when LHC ships a public case-type catalogue.
 *
 * Investigation log (run the probes again before declaring this fixed):
 *
 *   - https://data.lhc.gov.pk/cases/case_status            → 404
 *   - https://data.lhc.gov.pk/case_information             → 404
 *   - https://data.lhc.gov.pk/case_search                  → 404
 *   - https://lhc.gov.pk/case-information                  → 500 (URL blocked)
 *   - http://data.lhc.gov.pk/case_management/*             → no case-type
 *     <select>. Cause-list pages (regular / urgent / supplementary) and
 *     last_hearing_status only expose CourtName, color, bench, weekDay, and
 *     location selects. The caseNumber input expects a typed string like
 *     "Writ.123-2024" — the case-type prefix is hand-entered, never picked
 *     from a list.
 *   - https://api.lhc.gov.pk/api/{CaseType,CaseTypes,Case/Types,...} → 404 on
 *     every plausible path. api.lhc.gov.pk exists (the mobile app uses it)
 *     but its routing table is not publicly documented and our brute-force
 *     probes found nothing.
 *   - LHC sibling subdomains (pcsc/cases/search/cms/portal.lhc.gov.pk) → DNS
 *     does not resolve.
 *
 * Conclusion: the LHC web portal does not enumerate case types anywhere
 * scrapable. Until that changes, the seed pipeline falls back to the
 * hardcoded LHC snapshot for the `courtLevel=High Court, highCourtCode=LHC`
 * cohort.
 *
 * When LHC ships a case-type select or its API team publishes a categories
 * endpoint, point `URL` at it and follow the IHC/SHC/BHC playbook:
 *   1. Locate the select by id or by label association — never by "largest
 *      select" (LHC's roster_of_sittings page has 248 judge options).
 *   2. If the options are AJAX-hydrated, replay the fetch from within the
 *      page so cookies + same-origin policy match.
 *   3. Keep MIN_ROWS at 20 (LHC has a large catalogue; a smaller payload
 *      means the source broke).
 *
 * Run: cd apps/api && pnpm exec ts-node scripts/scrape-case-types/scrape-lhc.ts
 */
import { withBrowser, writeOutput, type ScrapedRow } from './shared';

// Best-guess entry point. Update when LHC publishes a real case-search form.
const URL = 'https://data.lhc.gov.pk/cases/case_status';
const SOURCE = 'data.lhc.gov.pk';
const COURT_LEVEL = 'High Court';
const HIGH_COURT_CODE = 'LHC';
const MIN_ROWS = 20;

async function main() {
  const rows = await withBrowser(async (_, page) => {
    const resp = await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    const status = resp?.status() ?? 0;
    if (status >= 400) {
      throw new Error(
        `LHC: ${URL} returned HTTP ${status}. ` +
          'No public case-type catalogue is currently exposed by LHC. ' +
          'Falling back to hardcoded snapshot for the LHC cohort. ' +
          'See header comment for re-probe instructions.',
      );
    }

    // Probe documented selector strategy. We deliberately do NOT take the
    // largest select — LHC's roster page has 248 judge options that would
    // pollute the catalogue.
    const opts: Array<{ value: string; label: string }> = await page.evaluate(() => {
      // Try common LHC naming conventions.
      const ids = ['caseType', 'case_type', 'caseName', 'case_name', 'casecategory', 'caseCategory'];
      let sel: HTMLSelectElement | null = null;
      for (const id of ids) {
        const cand = document.getElementById(id);
        if (cand && cand.tagName === 'SELECT') {
          sel = cand as HTMLSelectElement;
          break;
        }
      }
      if (!sel) {
        // Try label-anchored lookup.
        const labels = Array.from(document.querySelectorAll('label')) as HTMLLabelElement[];
        for (const lab of labels) {
          if (!/case\s*(type|name|category)/i.test(lab.textContent ?? '')) continue;
          const id = lab.htmlFor;
          if (id) {
            const cand = document.getElementById(id);
            if (cand && cand.tagName === 'SELECT') {
              sel = cand as HTMLSelectElement;
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
        'LHC: no case-type <select> found via id (caseType/caseName/case_category/...) ' +
          'or label association. The LHC portal does not currently expose a public ' +
          'case-type catalogue. See header comment for re-probe instructions.',
      );
    }

    return opts
      .filter(
        (o) =>
          o.label &&
          o.label.length < 120 &&
          !/^select(\s|$|\.\.\.|all)/i.test(o.label) &&
          o.label !== '-' &&
          o.value !== '',
      )
      .map<ScrapedRow>((o, i) => ({
        courtLevel: COURT_LEVEL,
        highCourtCode: HIGH_COURT_CODE,
        code: o.value || o.label,
        label: o.label,
        source: SOURCE,
        priority: 1000 - i,
      }));
  });

  writeOutput('lhc.json', rows, MIN_ROWS);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
