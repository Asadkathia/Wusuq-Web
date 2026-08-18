import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Batch-6 D4 second-round follow-ups. Removing the city picker had four more
 * downstream consequences that the pre-push review caught — the same lesson as
 * the first round: deleting an input means auditing everything that read it.
 *
 * Source-level guards (web tests are ESM, node env, no DOM). Each was
 * mutation-proven by reverting the fix and watching it fail.
 */
const here = dirname(fileURLToPath(import.meta.url));
const wizard = readFileSync(join(here, '../components/intake-wizard.tsx'), 'utf8');

describe('FIR flow follow-ups (batch-6 D4, round 2)', () => {
  it('autosaves on district for FIR flows, not city', () => {
    // canAutosaveDraft gated on geoIds.cityId, which these flows can no longer
    // set — so autosave, the server draft row, the "Saved" pill and the
    // resumed-draft banner were all silently dead and a closed tab lost the
    // whole intake.
    expect(wizard).toMatch(
      /\(isFirFlow \? geoIds\.districtId : geoIds\.cityId\) &&/,
    );
    expect(wizard).not.toMatch(/\n      geoIds\.cityId &&\n      draft\.serviceId/);
  });

  it('stamps the district name into payload.city for FIR flows', () => {
    // payload.city is read well beyond the wizard — the invoice line resolves
    // its location from `select_court_city ?? city ?? select_city` and would
    // render no location at all.
    expect(wizard).toMatch(/setPayloadField\('city', isFirFlow \? name : ''\)/);
  });

  it('persists a delivery-city fallback rather than only displaying one', () => {
    // The renderer shows `addr.city ?? payload.city` but
    // isStructuredAddressComplete reads only the stored JSON — so for a
    // consumer with no profile city the box looked filled and Continue still
    // failed. Seed the fallback so shown and validated agree.
    expect(wizard).toMatch(/r\.city\?\.trim\(\) \|\| draft\.payload\.city\?\.trim\(\)/);
  });

  it('hydrates provinceId by name on the prefill paths', () => {
    // Only district_id/city_id were hydrated, and the payload carries the
    // province NAME only. After D4 province is the sole geo the FIR flows have,
    // so Regenerate/Edit dead-ended on "Please select a province".
    expect(wizard).toMatch(/if \(!name \|\| geoIds\.provinceId \|\| geo\.provinces\.length === 0\) return;/);
    expect(wizard).toMatch(/geo\.loadDistricts\(match\.id\)/);
  });
});
