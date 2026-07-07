import { computeWusuqMargin } from '@wusuq/shared';

describe('computeWusuqMargin', () => {
  it('is total minus clerk earnings', () => {
    expect(computeWusuqMargin(1000, 300)).toBe(700);
  });

  it('rounds to 2 decimals', () => {
    expect(computeWusuqMargin(100.005, 0)).toBe(100.01);
  });

  it('can be negative when clerk earnings exceed total', () => {
    expect(computeWusuqMargin(200, 500)).toBe(-300);
  });
});
