import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Batch-6 D4 follow-ups — caught by the pre-push review, and both were real
 * dead-ends rather than cosmetic slips.
 *
 * Removing the city picker from the FIR / criminal-record flows left two
 * things behind that still assumed a city existed. Web tests run as ESM with
 * no DOM, so these are source-level guards (the established pattern here) —
 * each one was mutation-proven by reverting the fix and watching it fail.
 */
const here = dirname(fileURLToPath(import.meta.url));
const wizard = readFileSync(join(here, '../components/intake-wizard.tsx'), 'utf8');
const geoBlocks = readFileSync(
  join(here, '../components/intake-wizard/service-geo-blocks.tsx'),
  'utf8',
);

describe('FIR location step (batch-6 D4 review fixes)', () => {
  it('does not demand a city the FIR flows no longer show', () => {
    // Was: `if (!geoIds.cityId)` unconditionally. With the picker removed that
    // dead-ended step 1 — "Please select a city" with no city control on
    // screen, and validateAllSteps blocked submit for the same reason.
    expect(wizard).toMatch(/if \(!isFirFlow && !geoIds\.cityId\) \{/);
    expect(wizard).not.toMatch(/\n    if \(!geoIds\.cityId\) \{/);
  });

  it('falls back to the district name for serviceCity using ||, not ??', () => {
    // handleDistrictChange writes `city: ''`. An empty string is NOT nullish,
    // so `??` short-circuited and every FIR ticket persisted serviceCity ''
    // — silently disabling the clerk city gate in assign() and blanking the
    // City column on the ticket + finance boards.
    expect(wizard).toMatch(/serviceCity:\s*\n\s*p\.city \|\|/);
    expect(wizard).not.toMatch(/serviceCity:\s*\n\s*p\.city \?\?/);
  });

  it('no longer keys the FIR geo block off city_type', () => {
    // After D4 the only flow still declaring city_type is Registry/Deed, so
    // matching on it rendered a FIR police-station panel inside Registry/Deed
    // — the same cross-contamination D3 fixed in the other direction.
    const line = wizard
      .split('\n')
      .find((l) => l.includes('stepHasFirGeo = Boolean'))!;
    expect(line).toBeDefined();
    expect(line).not.toMatch(/city_type/);
    expect(line).toMatch(/station_id/);
  });

  it('LocationBlock stops at district — no city tier', () => {
    const block = geoBlocks.slice(geoBlocks.indexOf('export function LocationBlock'));
    const body = block.slice(0, block.indexOf('// ─── Judicial Service Block'));
    expect(body).toMatch(/FieldLabel required>District</);
    expect(body).not.toMatch(/FieldLabel required>City</);
  });

  it('marks the police station required only on the explicit FIR branch', () => {
    // The standalone criminal-record flow has no fir_mode field, so firMode is
    // '' — it must not be told a thana is mandatory when neither the flow
    // definition nor the backend requires one.
    expect(geoBlocks).toMatch(/const stationRequired = firMode === 'have_fir_number';/);
    expect(geoBlocks).not.toMatch(/<FieldLabel required>Police station</);
  });

  it('renders a visible label for the hoisted branching question', () => {
    // RadioField's own <legend> is sr-only, so without this wrapper the
    // consumer saw only the collapsed chip and never the question.
    expect(wizard).toMatch(/\{firModeField\.label\}/);
  });
});
