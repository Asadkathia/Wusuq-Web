import { buildPricingResolveInput } from '@wusuq/shared';

describe('buildPricingResolveInput currency', () => {
  it('defaults to PKR', () => {
    expect(buildPricingResolveInput('judicial_case_files', {}).currency).toBe(
      'PKR',
    );
  });
  it('passes USD through', () => {
    expect(
      buildPricingResolveInput('judicial_case_files', {}, 'USD').currency,
    ).toBe('USD');
  });
});
