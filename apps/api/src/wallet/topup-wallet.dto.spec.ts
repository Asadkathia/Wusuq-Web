import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { TopupWalletDto } from './dto/topup-wallet.dto';

async function errs(obj: Record<string, unknown>) {
  const dto = plainToInstance(TopupWalletDto, obj);
  return (await validate(dto)).flatMap((e) =>
    Object.values(e.constraints ?? {}),
  );
}

describe('TopupWalletDto (B5)', () => {
  const okBase = { amount: 5000, paymentMode: 'JAZZ_CASH', currency: 'PKR' };
  it('accepts an app-relative receiptUrl', async () => {
    expect(
      await errs({ ...okBase, receiptUrl: '/wallet/receipt/x.jpg' }),
    ).toEqual([]);
  });
  it('accepts JAZZ_CASH / EASY_PAISA / BANK_TRANSFER', async () => {
    for (const paymentMode of ['JAZZ_CASH', 'EASY_PAISA', 'BANK_TRANSFER']) {
      expect(await errs({ ...okBase, paymentMode })).toEqual([]);
    }
  });
  it('rejects an unknown paymentMode', async () => {
    expect((await errs({ ...okBase, paymentMode: 'JAZZCASH' })).join()).toMatch(
      /paymentMode/,
    );
  });
});
