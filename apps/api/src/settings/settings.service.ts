import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const TAX_RATE_KEY = 'tax.rate';
const TAX_ENABLED_KEY = 'tax.enabled';

const COMPANY_KEYS = {
  name: 'company.name',
  country: 'company.country',
  phone: 'company.phone',
  email: 'company.email',
} as const;

/** Defaults match the owner's invoice template header (spec 2026-07-16). */
const COMPANY_DEFAULTS: CompanySettings = {
  name: 'WUSUQ',
  country: 'Pakistan',
  phone: '0300-1998787',
  email: 'wusuqlq@icloud.com',
};

export interface CompanySettings {
  name: string;
  country: string;
  phone: string;
  email: string;
}

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
    const rate = clampRate(Number(rawRate ?? process.env.TAX_RATE ?? '0'));
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
    await this.prisma.$transaction([
      this.prisma.appSetting.upsert({
        where: { key: TAX_RATE_KEY },
        create: {
          key: TAX_RATE_KEY,
          value: String(clamped),
          updatedByUserId: actorUserId,
        },
        update: { value: String(clamped), updatedByUserId: actorUserId },
      }),
      this.prisma.appSetting.upsert({
        where: { key: TAX_ENABLED_KEY },
        create: {
          key: TAX_ENABLED_KEY,
          value: String(enabled),
          updatedByUserId: actorUserId,
        },
        update: { value: String(enabled), updatedByUserId: actorUserId },
      }),
    ]);
    return { rate: clamped, enabled };
  }

  /** Company identity block on the invoice header. Admin-editable, no deploy. */
  async getCompanySettings(): Promise<CompanySettings> {
    const entries = await Promise.all(
      (Object.keys(COMPANY_KEYS) as Array<keyof CompanySettings>).map(
        async (field) =>
          [
            field,
            (await this.readKey(COMPANY_KEYS[field]))?.trim() ||
              COMPANY_DEFAULTS[field],
          ] as const,
      ),
    );
    return Object.fromEntries(entries) as unknown as CompanySettings;
  }

  async setCompanySettings(
    input: CompanySettings,
    actorUserId?: string,
  ): Promise<CompanySettings> {
    const next: CompanySettings = {
      name: input.name.trim(),
      country: input.country.trim(),
      phone: input.phone.trim(),
      email: input.email.trim(),
    };
    await this.prisma.$transaction(
      (Object.keys(COMPANY_KEYS) as Array<keyof CompanySettings>).map((field) =>
        this.prisma.appSetting.upsert({
          where: { key: COMPANY_KEYS[field] },
          create: {
            key: COMPANY_KEYS[field],
            value: next[field],
            updatedByUserId: actorUserId,
          },
          update: { value: next[field], updatedByUserId: actorUserId },
        }),
      ),
    );
    return next;
  }
}
