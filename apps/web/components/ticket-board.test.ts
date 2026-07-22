// Node-env unit test (see jest.config.js testEnvironment: 'node'). Rendering
// <TicketBoard> would need jsdom + @testing-library/react, which aren't web
// devDependencies — so these are SOURCE-LEVEL guard tests (read the file,
// assert on its contents), the established convention in this repo
// (consumer-ticket-board.test.ts).
//
// Background this guards against: when a clerk submits phase-2 charges and
// an admin later marks the rate up in the finalize dialog, the admin's edit
// overwrites the SAME ticket columns the clerk wrote. The "Clerk submitted"
// comparison line and the clerk-earnings total must read the frozen
// clerk-submitted SNAPSHOT columns (clerkAttestedCharges etc.), never the
// working columns those edits overwrite — otherwise the line only looks
// correct because it renders a stale pre-edit read, and is wrong on any
// later re-open of the dialog.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const src = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'ticket-board.tsx'),
  'utf8',
);

it('uses the shared breakdown, never a hand-rolled clerk sum', () => {
  // Matches a CALL (trailing paren), not the import line — `toContain` on
  // the bare identifier would be satisfied by the import alone even if the
  // symbol were never invoked.
  expect(src).toMatch(/computeClerkEarningsBreakdown\(/);
});

it('clerkSubmitted reads the clerk set, not just the working column', () => {
  // The brief's original construction (`clerk${field[0].toUpperCase()}...`)
  // fails typecheck under this repo's `noUncheckedIndexedAccess` (`field[0]`
  // types as `string | undefined`) — an explicit literal map replaced it, so
  // guard on that map actually being consulted inside the helper, not merely
  // the presence of the `clerkSubmitted` identifier (which the old, wrong
  // implementation also had).
  expect(src).toMatch(/const clerkKey = CLERK_CHARGE_SNAPSHOT_KEYS\[field\];/);
  // And the map itself must point every phase-2 field at its real column —
  // this is the literal check that a silently-wrong derived key would fail.
  expect(src).toMatch(/attestedCharges: 'clerkAttestedCharges'/);
  expect(src).toMatch(/nonAttestedCharges: 'clerkNonAttestedCharges'/);
  expect(src).toMatch(/printingCharges: 'clerkPrintingCharges'/);
  expect(src).toMatch(/deliveryCharges: 'clerkDeliveryCharges'/);
});

it('clerkSubmitted no longer accepts additionalCharges (no clerk column for it)', () => {
  const helperMatch = src.match(
    /const clerkSubmitted = \(\s*field: ([^)]+)\)/,
  );
  expect(helperMatch).not.toBeNull();
  expect(helperMatch![1]).not.toMatch(/additionalCharges/);
});

it('renders the itemized clerk-earnings breakdown beneath the total', () => {
  // Asserts on the actual itemization array literal, not just that the
  // breakdown fields exist somewhere in the file.
  expect(src).toMatch(/\['Clerk cost', b\.base\]/);
  expect(src).toMatch(/\['Attested', b\.attested\]/);
  expect(src).toMatch(/\['Non-attested', b\.nonAttested\]/);
  expect(src).toMatch(/\['Printing', b\.printing\]/);
  expect(src).toMatch(/\['Delivery', b\.delivery\]/);
  expect(src).toMatch(/\['PDF', b\.pdfFee\]/);
});

it('skips zero lines in the itemized breakdown', () => {
  expect(src).toMatch(/\.filter\(\(\[, v\]\) => Number\(v\) > 0\)/);
});
