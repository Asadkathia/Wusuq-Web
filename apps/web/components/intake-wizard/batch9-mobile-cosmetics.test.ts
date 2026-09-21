// Source-level guards for batch-9 Task 7 (§7.1-§7.4 mobile/cosmetic fixes
// from the first real iPhone recordings of the consumer intake wizard).
// Jest runs `testEnvironment: 'node'` with no jsdom/Testing Library, so
// these assert on the JSX/TS source text itself — mirrors the pattern in
// checkout-panel.test.ts / consumer-ticket-board.test.ts. Every assertion
// here was mutation-tested (break the source, confirm the test fails,
// restore) — see task-7-report.md for the evidence.
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

// Jest treats this suite as ESM (jest.config.js extensionsToTreatAsEsm), so
// __dirname is undefined here — derive it from import.meta.url instead.
const currentDir = dirname(fileURLToPath(import.meta.url));
const wizardSource = readFileSync(join(currentDir, '..', 'intake-wizard.tsx'), 'utf8');
const fieldRendererSource = readFileSync(join(currentDir, 'field-renderer.tsx'), 'utf8');
const geoBlocksSource = readFileSync(join(currentDir, 'service-geo-blocks.tsx'), 'utf8');
const caseViewSource = readFileSync(join(currentDir, '..', '..', 'lib', 'case-view.ts'), 'utf8');

// ── §7.1 — focus-zoom: every wizard input class needs a base <16px size ────
describe('§7.1 iOS focus-zoom — base text-base on every wizard input class', () => {
  it('intake-wizard.tsx inputClass has a base text-base with sm:text-sm above it', () => {
    const line = wizardSource
      .split('\n')
      .find((l) => l.includes('const inputClass ='));
    expect(line).toBeDefined();
    expect(line).toMatch(/text-base/);
    expect(line).toMatch(/sm:text-sm/);
  });

  it('intake-wizard.tsx selectClass has a base text-base with sm:text-sm above it', () => {
    const line = wizardSource
      .split('\n')
      .find((l) => l.includes('const selectClass ='));
    expect(line).toBeDefined();
    expect(line).toMatch(/text-base/);
    expect(line).toMatch(/sm:text-sm/);
  });

  it('the promo-code input is not pinned to a bare sub-16px text-sm', () => {
    // Pre-fix: `text-sm` with NO breakpoint at all (14px at every width,
    // worse than the sm:-gated instances above). Isolate the promo input's
    // own className so this can't pass by matching some other input.
    const start = wizardSource.indexOf('aria-label="Promo code"');
    expect(start).toBeGreaterThan(-1);
    const classNameStart = wizardSource.indexOf('className=', start);
    const classNameEnd = wizardSource.indexOf('"', wizardSource.indexOf('"', classNameStart) + 1);
    const promoClassName = wizardSource.slice(classNameStart, classNameEnd);
    expect(promoClassName).toMatch(/text-base/);
    expect(promoClassName).toMatch(/sm:text-sm/);
    // Must not regress to a bare, non-breakpointed text-sm (with no
    // preceding text-base) — that was the actual bug.
    expect(promoClassName).not.toMatch(/(?<!sm:)\btext-sm\b(?!.*text-base)/);
  });

  it('field-renderer.tsx BASE_CLASS has a base text-base with sm:text-sm above it', () => {
    const start = fieldRendererSource.indexOf('const BASE_CLASS =');
    expect(start).toBeGreaterThan(-1);
    const end = fieldRendererSource.indexOf(';', start);
    const block = fieldRendererSource.slice(start, end);
    expect(block).toMatch(/text-base/);
    expect(block).toMatch(/sm:text-sm/);
  });
});

// ── §7.2 — empty date inputs need a visible affordance ─────────────────────
describe('§7.2 empty date inputs are visible on mobile', () => {
  it('service-geo-blocks.tsx defines a DateInput wrapper that flags an empty value', () => {
    expect(geoBlocksSource).toMatch(/function DateInput\(/);
    expect(geoBlocksSource).toMatch(/const isEmpty = !value;/);
  });

  it('DateInput adds a visible outline (independent of the shared ring/shadow classes) only when empty', () => {
    const start = geoBlocksSource.indexOf('function DateInput(');
    const end = geoBlocksSource.indexOf('\n}\n', start);
    const block = geoBlocksSource.slice(start, end);
    expect(block).toMatch(/isEmpty \? 'outline outline-2[^']*'/);
  });

  it('DateInput renders a visible hint when empty', () => {
    const start = geoBlocksSource.indexOf('function DateInput(');
    const end = geoBlocksSource.indexOf('\n}\n', start);
    const block = geoBlocksSource.slice(start, end);
    expect(block).toMatch(/isEmpty \? \(/);
    expect(block).toMatch(/Tap to select a date/);
  });

  it('CaseDateBlock routes every date field through DateInput, not a raw <input type="date">', () => {
    const start = geoBlocksSource.indexOf('export function CaseDateBlock(');
    expect(start).toBeGreaterThan(-1);
    const end = geoBlocksSource.indexOf('\n}\n', start);
    const block = geoBlocksSource.slice(start, end);
    // The old bug: 5 bare `<input type="date" className={inputClass} .../>`
    // elements with no empty-state affordance. None should remain in the
    // CaseDateBlock body itself (DateInput's own <input> is defined outside
    // this slice).
    expect(block).not.toMatch(/<input\s/);
    const dateInputUses = block.match(/<DateInput\b/g) ?? [];
    expect(dateInputUses.length).toBe(5);
  });
});

// ── §7.3 — set-type chip must be title-cased, via the shared humanizer ─────
describe('§7.3 set-type chip uses the shared case-view.ts humanizer, not a second one', () => {
  it('case-view.ts exports humanizeValue', () => {
    expect(caseViewSource).toMatch(/export function humanizeValue\(/);
  });

  it('field-renderer.tsx imports humanizeValue from @/lib/case-view', () => {
    expect(fieldRendererSource).toMatch(
      /import\s*\{\s*humanizeValue\s*\}\s*from\s*'@\/lib\/case-view'/,
    );
  });

  it('RadioField\'s default label fallback calls humanizeValue, not a raw underscore replace', () => {
    const start = fieldRendererSource.indexOf('function RadioField(');
    expect(start).toBeGreaterThan(-1);
    const end = fieldRendererSource.indexOf('\n}\n', start);
    const block = fieldRendererSource.slice(start, end);
    expect(block).toMatch(/const labelFor = \(o: string\) => customLabel\(o\) \?\? humanizeValue\(o\);/);
    // Pre-fix bug: labelFor fell back to a raw underscore-to-space swap,
    // which left the chip's underlying value lowercase — only the button
    // grid's separate `capitalize` CSS class masked it, and the collapsed
    // SelectionChip has no such class.
    expect(block).not.toMatch(/o\.replace\(\/_\/g/);
  });
});

// ── §7.4 — "No pricing rule matched" must not alarm an incomplete form ─────
describe('§7.4 pricing-notice readiness gate', () => {
  it('defines readiness checks for court type, city, Set Type and Required Documents', () => {
    expect(wizardSource).toMatch(/const hasCityForPricing = Boolean\(/);
    expect(wizardSource).toMatch(/const hasCourtTypeForPricing =/);
    expect(wizardSource).toMatch(
      /const caseFilesAwaitingSetType =\s*\n?\s*draft\.flow === 'judicial_case_files' && !draft\.payload\.set_type;/,
    );
    expect(wizardSource).toMatch(
      /const caseInfoAwaitingBundle =\s*\n?\s*draft\.flow === 'judicial_case_information' && !draft\.payload\.required_documentations;/,
    );
  });

  it('combines all readiness checks into pricingNoticeReady', () => {
    const start = wizardSource.indexOf('const pricingNoticeReady =');
    expect(start).toBeGreaterThan(-1);
    const end = wizardSource.indexOf(';', start);
    const block = wizardSource.slice(start, end);
    expect(block).toMatch(/Boolean\(draft\.flow\)/);
    expect(block).toMatch(/hasCourtTypeForPricing/);
    expect(block).toMatch(/hasCityForPricing/);
    expect(block).toMatch(/!caseFilesAwaitingSetType/);
    expect(block).toMatch(/!caseInfoAwaitingBundle/);
  });

  it('CheckoutPanel receives hasFlow={pricingNoticeReady}, not a bare Boolean(draft.flow)', () => {
    const start = wizardSource.indexOf('<CheckoutPanel');
    expect(start).toBeGreaterThan(-1);
    const end = wizardSource.indexOf('/>', wizardSource.indexOf('promoSlot=', start));
    const invocation = wizardSource.slice(start, end);
    expect(invocation).toMatch(/hasFlow=\{pricingNoticeReady\}/);
    expect(invocation).not.toMatch(/hasFlow=\{Boolean\(draft\.flow\)\}/);
  });
});
