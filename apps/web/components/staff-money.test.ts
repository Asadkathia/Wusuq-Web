import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = (f: string) => readFileSync(join(here, f), 'utf8');

describe('staff surfaces use the shared converter', () => {
  for (const f of ['ticket-board.tsx', 'ticket-detail-panel.tsx', 'ticket-charges-board.tsx']) {
    it(`${f} calls formatStaffMoney`, () => {
      expect(read(f)).toMatch(/formatStaffMoney\(/);
    });
  }

  it('ticket-board no longer defines the hand-rolled rs() helper', () => {
    expect(read('ticket-board.tsx')).not.toMatch(/const rs = \(n: number\)/);
  });
});

describe('PKR-denominated config boards keep their literal PKR', () => {
  for (const f of [
    'cost-rules-board.tsx',
    'pricing-rules-board.tsx',
    'promo-codes-board.tsx',
    'exchange-rate-board.tsx',
  ]) {
    it(`${f} is not converted`, () => {
      expect(read(f)).not.toMatch(/formatStaffMoney\(/);
    });
  }
});
