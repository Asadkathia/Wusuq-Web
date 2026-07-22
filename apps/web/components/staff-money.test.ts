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

describe('finance and dashboard rows use the shared converter', () => {
  it('finance-board calls formatStaffMoney', () => {
    expect(read('finance-board.tsx')).toMatch(/formatStaffMoney\(/);
  });

  it('operational-queue labels its amounts', () => {
    expect(read('dashboard/operational-queue.tsx')).toMatch(/formatStaffMoney\(/);
  });

  it('dashboard page no longer defines the hand-rolled rs() helper', () => {
    const dashboardPage = readFileSync(
      join(here, '..', 'app', '(portal)', 'dashboard', 'page.tsx'),
      'utf8',
    );
    expect(dashboardPage).not.toMatch(/const rs = \(n: number\)/);
  });
});
