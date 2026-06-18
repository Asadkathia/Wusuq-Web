import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const TAX_RATE_KEY = 'tax.rate';
const TAX_ENABLED_KEY = 'tax.enabled';

function clampRate(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0;
  return n > 1 ? 1 : n;
}

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  private async readKey(key: string): Promise<string | null> {
    const row = await this.prisma.appSetting.findUnique({ where: { key } });
    return row?.value ?? null;
  }

  async getTaxConfig(): Promise<{ rate: number; enabled: boolean }> {
    const rawRate = await this.readKey(TAX_RATE_KEY);
    const rawEnabled = await this.readKey(TAX_ENABLED_KEY);
    const rate = clampRate(
      Number(rawRate ?? process.env.TAX_RATE ?? '0'),
    );
    // Default enabled = true once a rate exists; explicit 'false' disables.
    const enabled = rawEnabled != null ? rawEnabled === 'true' : true;
    return { rate, enabled };
  }

  /** Effective rate used by pricing: 0 when disabled. */
  async getTaxRate(): Promise<number> {
    const { rate, enabled } = await this.getTaxConfig();
    return enabled ? rate : 0;
  }

  async setTaxConfig(
    rate: number,
    enabled: boolean,
    actorUserId?: string,
  ): Promise<{ rate: number; enabled: boolean }> {
    const clamped = clampRate(rate);
    await this.prisma.appSetting.upsert({
      where: { key: TAX_RATE_KEY },
      create: { key: TAX_RATE_KEY, value: String(clamped), updatedByUserId: actorUserId },
      update: { value: String(clamped), updatedByUserId: actorUserId },
    });
    await this.prisma.appSetting.upsert({
      where: { key: TAX_ENABLED_KEY },
      create: { key: TAX_ENABLED_KEY, value: String(enabled), updatedByUserId: actorUserId },
      update: { value: String(enabled), updatedByUserId: actorUserId },
    });
    return { rate: clamped, enabled };
  }
}
