// Node-env unit test (see jest.config.js testEnvironment: 'node'). Rendering
// <TicketDetailPanel> to assert on output would need jsdom +
// @testing-library/react, which aren't web devDependencies (same call as
// payment-method-details.test.tsx, consumer-ticket-board.test.ts). Cover the
// staff clerk-earnings itemization with source-level assertions instead: the
// panel must call the shared computeClerkEarningsBreakdown (not just import
// it) and render each non-zero payout line beneath the earnings total, so an
// admin can see how a clerk's payout was composed/capped.
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

// Jest runs this suite as an ESM module (see jest.config.js
// extensionsToTreatAsEsm), so __dirname isn't defined — derive it from
// import.meta.url instead.
const currentDir = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(currentDir, 'ticket-detail-panel.tsx'), 'utf8');

describe('ticket-detail-panel (clerk-earnings itemization)', () => {
  it('imports computeClerkEarningsBreakdown from @wusuq/shared', () => {
    expect(source).toMatch(/computeClerkEarningsBreakdown/);
  });

  it('actually calls the breakdown (not just imports the symbol)', () => {
    // A bare identifier check is satisfied by the import line alone; require
    // an invocation with the ticket + wantPdf shape it needs.
    expect(source).toMatch(/computeClerkEarningsBreakdown\(\{\s*\.\.\.ticket,\s*wantPdf\s*\}\)/);
  });

  it('derives the earnings total from the breakdown, not a separate call', () => {
    expect(source).toMatch(/const clerkEarnings = clerkBreakdown\.total;/);
  });

  it('renders the itemized line with all six payout components', () => {
    expect(source).toMatch(/\['Clerk cost', clerkBreakdown\.base\]/);
    expect(source).toMatch(/\['Attested', clerkBreakdown\.attested\]/);
    expect(source).toMatch(/\['Non-attested', clerkBreakdown\.nonAttested\]/);
    expect(source).toMatch(/\['Printing', clerkBreakdown\.printing\]/);
    expect(source).toMatch(/\['Delivery', clerkBreakdown\.delivery\]/);
    expect(source).toMatch(/\['PDF', clerkBreakdown\.pdfFee\]/);
  });

  it('filters zero lines and joins the rendered ones with a separator', () => {
    expect(source).toMatch(/\.filter\(\(\[, v\]\) => Number\(v\) > 0\)/);
    expect(source).toMatch(/\.join\('  \+  '\)/);
  });
});
