import { jest } from '@jest/globals';
import { SettingsService } from './settings.service';

function build(rows: Record<string, string> = {}) {
  const store: Record<string, string> = { ...rows };
  const prisma = {
    appSetting: {
      findUnique: jest.fn(async ({ where }: { where: { key: string } }) =>
        store[where.key] != null
          ? { key: where.key, value: store[where.key] }
          : null,
      ),
      upsert: jest.fn(async ({ where, create, update }: any) => {
        store[where.key] = (update.value ?? create.value) as string;
        return { key: where.key, value: store[where.key] };
      }),
    },
    $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  return { service: new SettingsService(prisma as never), store };
}

describe('SettingsService tax config', () => {
  const OLD = process.env.TAX_RATE;
  afterEach(() => {
    process.env.TAX_RATE = OLD;
  });

  it('falls back to 0 when unset and no env', async () => {
    delete process.env.TAX_RATE;
    const { service } = build();
    expect(await service.getTaxRate()).toBe(0);
  });

  it('uses the env fallback when no DB row', async () => {
    process.env.TAX_RATE = '0.17';
    const { service } = build();
    expect(await service.getTaxRate()).toBe(0.17);
  });

  it('prefers the DB row over env and clamps to [0,1]', async () => {
    process.env.TAX_RATE = '0.17';
    const { service } = build({ 'tax.rate': '0.05' });
    expect(await service.getTaxRate()).toBe(0.05);
  });

  it('persists rate + enabled via setTaxConfig', async () => {
    const { service } = build();
    await service.setTaxConfig(0.13, true, 'admin-1');
    expect(await service.getTaxConfig()).toEqual({ rate: 0.13, enabled: true });
  });

  it('returns rate 0 effectively when disabled', async () => {
    const { service } = build({ 'tax.rate': '0.17', 'tax.enabled': 'false' });
    expect(await service.getTaxRate()).toBe(0);
  });

  it('clamps a DB rate above 1 down to 1', async () => {
    const { service } = build({ 'tax.rate': '1.5' });
    expect(await service.getTaxRate()).toBe(1);
  });

  it('clamps a DB rate below 0 up to 0', async () => {
    const { service } = build({ 'tax.rate': '-0.1' });
    expect(await service.getTaxRate()).toBe(0);
  });
});
