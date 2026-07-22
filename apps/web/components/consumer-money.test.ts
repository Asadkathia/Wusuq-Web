import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

it('consumer wallet top-up label is currency-aware, not hardcoded PKR', () => {
  const src = readFileSync(join(here, 'consumer-wallet-board.tsx'), 'utf8');
  expect(src).not.toMatch(/label="Amount \(PKR\)"/);
  expect(src).toMatch(/Amount \(\$\{currency\}\)|Amount \(\{currency\}\)/);
});

it('consumer surfaces never use the staff formatter', () => {
  for (const f of ['consumer-wallet-board.tsx', 'consumer-ticket-board.tsx']) {
    expect(readFileSync(join(here, f), 'utf8')).not.toMatch(/formatStaffMoney/);
  }
});
