import { jest } from '@jest/globals';
import { SettingsService } from './settings.service';

function makePrisma(rows: Record<string, string> = {}) {
  return {
    appSetting: {
      findUnique: jest.fn(async ({ where }: { where: { key: string } }) =>
        rows[where.key] != null
          ? { key: where.key, value: rows[where.key] }
          : null,
      ),
      upsert: jest.fn((args: unknown) => args),
    },
    $transaction: jest.fn(async (ops: unknown[]) => Promise.resolve(ops)),
  } as never;
}

describe('SettingsService company settings', () => {
  it('falls back to the template defaults when unset', async () => {
    const s = new SettingsService(makePrisma());
    await expect(s.getCompanySettings()).resolves.toEqual({
      name: 'WUSUQ',
      country: 'Pakistan',
      phone: '0300-1998787',
      email: 'wusuqlq@icloud.com',
    });
  });

  it('reads persisted values', async () => {
    const s = new SettingsService(
      makePrisma({
        'company.name': 'Wusuq Pvt Ltd',
        'company.phone': '0300-0000000',
      }),
    );
    const c = await s.getCompanySettings();
    expect(c.name).toBe('Wusuq Pvt Ltd');
    expect(c.phone).toBe('0300-0000000');
    expect(c.country).toBe('Pakistan'); // still the default
  });

  it('writes all four keys in one transaction', async () => {
    const prisma = makePrisma();
    const s = new SettingsService(prisma);
    await s.setCompanySettings(
      { name: 'A', country: 'B', phone: 'C', email: 'd@e.f' },
      'user-1',
    );
    expect(
      (prisma as { $transaction: jest.Mock }).$transaction,
    ).toHaveBeenCalledTimes(1);
    const ops = (prisma as { $transaction: jest.Mock }).$transaction.mock
      .calls[0][0];
    expect(ops).toHaveLength(4);
  });

  it('trims whitespace', async () => {
    const s = new SettingsService(makePrisma({ 'company.name': '  Spacey  ' }));
    expect((await s.getCompanySettings()).name).toBe('Spacey');
  });
});
