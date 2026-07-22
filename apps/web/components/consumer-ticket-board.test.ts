// Node-env unit test (see jest.config.js testEnvironment: 'node'). Rendering
// <ConsumerTicketDetail> to assert on output would need jsdom +
// @testing-library/react, which aren't web devDependencies (same call as
// payment-method-details.test.tsx). Wusuq's internal margin (C15,
// computeWusuqMargin) must never reach the consumer surface — clerk cost /
// earnings are already internal-only (see CLAUDE.md "Clerk cost is
// internal-only"). Guard against a regression with a source-level assertion:
// the consumer ticket board must not import computeWusuqMargin or render a
// "Wusuq earnings" line, mirroring how the codebase treats clerk-earnings
// redaction on this same file.
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

// Jest runs this suite as an ESM module (see jest.config.js
// extensionsToTreatAsEsm), so __dirname isn't defined — derive it from
// import.meta.url instead.
const currentDir = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(currentDir, 'consumer-ticket-board.tsx'), 'utf8');

describe('consumer-ticket-board (Wusuq-earnings absence guard)', () => {
  it('does not render a "Wusuq earnings" line', () => {
    expect(source).not.toContain('Wusuq earnings');
  });

  it('does not import or call computeWusuqMargin', () => {
    expect(source).not.toContain('computeWusuqMargin');
  });

  it('consumer detail never renders clerk earnings or the clerk set', () => {
    // Clerk earnings (computeClerkEarnings/computeClerkEarningsBreakdown) and
    // the clerk's submitted phase-2 charges (all four clerk* snapshot
    // columns: clerkAttestedCharges, clerkNonAttestedCharges,
    // clerkPrintingCharges, clerkDeliveryCharges) are internal-only (Task 8)
    // — a consumer-facing view must not import any of them. One regex covers
    // all four so a leak of any single column (not just
    // clerkNonAttestedCharges) fails this test. `toMatch` against a regex
    // (not `toContain`) so this also catches a differently-spelled call
    // site, not just an exact substring.
    expect(source).not.toMatch(/computeClerkEarnings/);
    expect(source).not.toMatch(/clerk(Attested|NonAttested|Printing|Delivery)Charges/);
  });
});
