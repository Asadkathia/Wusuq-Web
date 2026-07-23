// K1 guard: on SPLIT (physical-document) flows the checkout must NOT label
// the phase-1 base "Total" — it must relabel it "Base amount" and disclose
// that photocopy/delivery/attestation are added later by the clerk. ONE_TIME
// (digital) and USD flows must keep the plain "Total" label with no note.
// Source-level guard (Jest runs testEnvironment:'node', no jsdom/Testing
// Library) — mirrors the pattern in consumer-ticket-board.test.ts /
// users-board.test.ts.
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

// Jest treats this suite as ESM (see jest.config.js extensionsToTreatAsEsm),
// so __dirname is undefined here — derive it from import.meta.url instead.
const currentDir = dirname(fileURLToPath(import.meta.url));
const panelSource = readFileSync(join(currentDir, 'checkout-panel.tsx'), 'utf8');
const wizardSource = readFileSync(join(currentDir, '..', 'intake-wizard.tsx'), 'utf8');

// Isolate the footer JSX block (label + disclosure note) so assertions can't
// be satisfied by unrelated code elsewhere in the file (e.g. the type
// comment for `isSplit`, which also contains the words "Base amount").
function footerBlock(src: string): string {
  const start = src.indexOf('<footer');
  if (start === -1) throw new Error('footer not found in checkout-panel.tsx');
  const end = src.indexOf('</footer>', start);
  if (end === -1) throw new Error('could not bound footer block');
  return src.slice(start, end);
}

describe('CheckoutPanel isSplit prop and label (K1)', () => {
  it('declares an isSplit prop on CheckoutPanelProps', () => {
    expect(panelSource).toMatch(/isSplit\?:\s*boolean/);
  });

  it('destructures isSplit in the component signature', () => {
    expect(panelSource).toMatch(/export function CheckoutPanel\(\{[^)]*\bisSplit\b[^)]*\}: CheckoutPanelProps\)/);
  });

  describe('footer block', () => {
    const footer = footerBlock(panelSource);

    it('branches the total-line label on isSplit (ternary), not a hardcoded "Total"', () => {
      // The pre-fix bug: a bare `<span>Total</span>` with no conditional.
      expect(footer).toMatch(/\{isSplit\s*\?\s*'Base amount'\s*:\s*'Total'\}/);
    });

    it('does not render a hardcoded, unconditional "Total" label', () => {
      expect(footer).not.toMatch(/<span>Total<\/span>/);
    });

    it('renders a disclosure note gated on isSplit && total !== null', () => {
      expect(footer).toMatch(/\{isSplit\s*&&\s*total\s*!==\s*null\s*\?/);
      expect(footer).toMatch(/photocopy/i);
      expect(footer).toMatch(/delivery/i);
      expect(footer).toMatch(/attestation/i);
    });
  });
});

describe('IntakeWizard passes isSplit to CheckoutPanel (K1 wiring)', () => {
  // Isolate the <CheckoutPanel ... /> invocation so the assertion can't be
  // satisfied by the unrelated `isSplitFlow` declaration or the `isSplit`
  // memo inside `checkoutSummary` (a different, internally-scoped variable).
  function checkoutPanelInvocation(src: string): string {
    const start = src.indexOf('<CheckoutPanel');
    if (start === -1) throw new Error('<CheckoutPanel invocation not found in intake-wizard.tsx');
    const end = src.indexOf('/>', src.indexOf('promoSlot=', start));
    if (end === -1) throw new Error('could not bound <CheckoutPanel /> invocation');
    return src.slice(start, end);
  }

  it('computes isSplitFlow via paymentModelFor(draft.flow, currency) === \'SPLIT\'', () => {
    expect(wizardSource).toMatch(/const isSplitFlow = paymentModelFor\(draft\.flow, currency\) === 'SPLIT';/);
  });

  it('passes isSplit={isSplitFlow} on the <CheckoutPanel> element', () => {
    const invocation = checkoutPanelInvocation(wizardSource);
    expect(invocation).toMatch(/isSplit=\{isSplitFlow\}/);
  });
});
