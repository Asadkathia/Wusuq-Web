// Node-env unit test (see jest.config.js testEnvironment: 'node'). Render
// verification for <PaymentMethodDetails> requires jsdom + @testing-library/react,
// which are not yet web devDependencies; adding them (plus a jsdom testEnvironment)
// was judged heavier than this task warrants. That render coverage is deferred to
// the Task 5 Playwright e2e (tests/e2e/payment-methods.spec.ts), which exercises
// the real DOM in a browser. Here we cover the pure, environment-agnostic logic.
import { availableMethods } from './payment-method-details';

const settings = {
  bankName: 'Allied Bank',
  accountTitle: 'Ali Zain',
  accountNumber: '0288...',
  jazzCash: '03004680800',
  easyPaisa: '',
};

describe('availableMethods', () => {
  it('lists only configured methods (bank + jazzcash; not easypaisa)', () => {
    expect(availableMethods(settings)).toEqual(['BANK_TRANSFER', 'JAZZ_CASH']);
  });

  it('empty settings → no methods', () => {
    expect(availableMethods({})).toEqual([]);
  });

  it('null/undefined settings → no methods', () => {
    expect(availableMethods(null)).toEqual([]);
    expect(availableMethods(undefined)).toEqual([]);
  });

  it('bankName alone (no accountNumber) still surfaces BANK_TRANSFER', () => {
    expect(availableMethods({ bankName: 'Allied Bank' })).toEqual(['BANK_TRANSFER']);
  });

  it('all three configured → stable Bank, JazzCash, Easypaisa order', () => {
    expect(
      availableMethods({
        accountNumber: '123',
        jazzCash: '0300...',
        easyPaisa: '0300...',
      }),
    ).toEqual(['BANK_TRANSFER', 'JAZZ_CASH', 'EASY_PAISA']);
  });

  it('whitespace-only values are treated as not configured', () => {
    expect(availableMethods({ bankName: '   ', jazzCash: '  ', easyPaisa: '' })).toEqual([]);
  });
});
