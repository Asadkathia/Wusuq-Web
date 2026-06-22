import { paymentModelFor } from '@wusuq/shared';

describe('paymentModelFor (currency-aware)', () => {
  it('keeps Case Files SPLIT for PKR', () => {
    expect(paymentModelFor('judicial_case_files', 'PKR')).toBe('SPLIT');
  });
  it('forces ONE_TIME for any USD flow', () => {
    expect(paymentModelFor('judicial_case_files', 'USD')).toBe('ONE_TIME');
    expect(paymentModelFor('non_judicial_copy_of_fir', 'USD')).toBe('ONE_TIME');
  });
  it('preserves existing behaviour when currency omitted', () => {
    expect(paymentModelFor('judicial_case_files')).toBe('SPLIT');
    expect(paymentModelFor('judicial_case_search')).toBe('ONE_TIME');
  });
});
