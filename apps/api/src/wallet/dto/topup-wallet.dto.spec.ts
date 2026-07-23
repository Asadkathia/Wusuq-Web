import { jest } from '@jest/globals';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { TopupWalletDto } from './topup-wallet.dto';

jest.mock('@wusuq/shared', () => ({
  PAYMENT_MODES: ['BANK_TRANSFER', 'EASY_PAISA', 'JAZZ_CASH'],
}));

describe('TopupWalletDto', () => {
  it('rejects zero and negative amounts', () => {
    const dto = plainToInstance(TopupWalletDto, {
      userId: 'user-1',
      amount: -5,
      paymentMode: 'BANK_TRANSFER',
    });

    const errors = validateSync(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('accepts positive amount strings after transform', () => {
    const dto = plainToInstance(TopupWalletDto, {
      userId: 'user-1',
      amount: '10.5',
      paymentMode: 'BANK_TRANSFER',
    });

    const errors = validateSync(dto);
    expect(errors).toHaveLength(0);
    expect(dto.amount).toBe(10.5);
  });
});
