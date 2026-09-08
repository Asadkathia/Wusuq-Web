import {
  normalizeTransactionHistory,
  transactionAmountLabel,
  transactionDateLabel,
  transactionTypeLabel,
} from './wallet-transactions';

describe('normalizeTransactionHistory', () => {
  // THE BUG THIS EXISTS TO PREVENT (batch-7 item 11.1):
  // GET /wallet/:userId/transactions returns `{ userId, items }`, but the
  // wallet board called `apiClient.get<any[]>(...)` and put the whole object
  // into state. `({userId, items}).length` is undefined, `undefined === 0` is
  // false, so the empty-state branch was skipped and render reached
  // `.map(...)` on a non-array -> TypeError -> Next.js client-side exception
  // -> the ENTIRE staff /wallet board white-screened. Clicking any row in
  // Consumer Wallets reproduced it 100% of the time.
  it('unwraps the { userId, items } envelope the API actually returns', () => {
    const payload = {
      userId: 'cmsn1frvs0005if2i2zm70hmk',
      items: [
        { id: 't1', type: 'TOPUP', amount: 2000, currency: 'PKR', status: 'VERIFIED', createdAt: '2026-09-05T15:41:07.000Z' },
        { id: 't2', type: 'TOPUP', amount: 1100, currency: 'PKR', status: 'VERIFIED', createdAt: '2026-09-05T15:40:32.000Z' },
      ],
    };
    expect(normalizeTransactionHistory(payload).map((t) => t.id)).toEqual(['t1', 't2']);
  });

  it('still accepts a bare array, so a future API shape change cannot crash the page', () => {
    const rows = [{ id: 't1', type: 'TOPUP', amount: 5, currency: 'PKR', status: 'VERIFIED', createdAt: '' }];
    expect(normalizeTransactionHistory(rows)).toHaveLength(1);
  });

  it('returns [] — never throws — for every shape that is not a list', () => {
    for (const junk of [null, undefined, {}, { items: null }, { items: 'nope' }, 'string', 42, true]) {
      expect(normalizeTransactionHistory(junk)).toEqual([]);
    }
  });
});

describe('transactionAmountLabel', () => {
  // Prisma Decimal columns serialize to JSON as STRINGS, so the raw
  // `t.amount.toLocaleString()` in the old markup was formatting-by-accident
  // (String inherits toLocaleString from Object.prototype and returns itself
  // ungrouped). A null column threw outright.
  it('groups a numeric amount', () => {
    expect(transactionAmountLabel({ amount: 2000, currency: 'PKR', type: 'TOPUP' })).toBe('+2,000 PKR');
  });

  it('groups a Decimal-as-string amount rather than echoing it raw', () => {
    expect(transactionAmountLabel({ amount: '2000', currency: 'PKR', type: 'TOPUP' })).toBe('+2,000 PKR');
    expect(transactionAmountLabel({ amount: '1234.5', currency: 'USD', type: 'TOPUP' })).toBe('+1,234.5 USD');
  });

  it('signs non-topups as a deduction', () => {
    expect(transactionAmountLabel({ amount: 500, currency: 'PKR', type: 'DEDUCTION' })).toBe('-500 PKR');
  });

  it('does not throw on a null/absent amount or currency', () => {
    expect(transactionAmountLabel({ amount: null, currency: null, type: 'TOPUP' })).toBe('+0');
    expect(transactionAmountLabel({})).toBe('-0');
  });
});

describe('transactionTypeLabel', () => {
  it('humanises the enum', () => {
    expect(transactionTypeLabel('ADMIN_ADJUSTMENT')).toBe('Admin adjustment');
    expect(transactionTypeLabel('TOPUP')).toBe('Topup');
  });

  it('replaces EVERY underscore, not just the first', () => {
    // `.replace('_', ' ')` (string arg) swaps only the first occurrence.
    expect(transactionTypeLabel('A_B_C')).toBe('A b c');
  });

  it('does not throw on a null/absent type', () => {
    expect(transactionTypeLabel(null)).toBe('—');
    expect(transactionTypeLabel(undefined)).toBe('—');
  });
});

describe('transactionDateLabel', () => {
  it('renders a real timestamp', () => {
    expect(transactionDateLabel('2026-09-05T15:41:07.000Z')).not.toBe('—');
  });

  it('shows a dash rather than "Invalid Date" for missing or junk input', () => {
    for (const bad of [null, undefined, '', 'not-a-date']) {
      expect(transactionDateLabel(bad)).toBe('—');
    }
  });
});
