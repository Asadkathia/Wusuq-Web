import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CurrencyService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Convert an amount from one currency to another using the latest exchange rate.
   * Falls back to 1.0 (no conversion) if no rate is found.
   */
  async convert(amount: number, from: string, to: string): Promise<number> {
    if (from === to) return amount;

    const rate = await this.prisma.exchangeRate.findFirst({
      where: { fromCurrency: from, toCurrency: to },
      orderBy: { effectiveAt: 'desc' },
    });

    if (!rate) return amount;
    return amount * Number(rate.rate);
  }

  async upsertRate(from: string, to: string, rate: number, effectiveAt?: Date) {
    const at = effectiveAt ?? new Date();
    return this.prisma.exchangeRate.upsert({
      where: { fromCurrency_toCurrency_effectiveAt: { fromCurrency: from, toCurrency: to, effectiveAt: at } },
      update: { rate },
      create: { fromCurrency: from, toCurrency: to, rate, effectiveAt: at },
    });
  }

  async listRates() {
    return this.prisma.exchangeRate.findMany({ orderBy: { effectiveAt: 'desc' } });
  }

  async getLatestRate(from: string, to: string) {
    return this.prisma.exchangeRate.findFirst({
      where: { fromCurrency: from, toCurrency: to },
      orderBy: { effectiveAt: 'desc' },
    });
  }

  /**
   * Convert PKR amount to USD using the rate effective on or before `asOf` date.
   * Laravel divides PKR cost by the PKR→USD rate on the ticket's created_at date.
   * Falls back to latest rate if no rate exists before `asOf`. Returns original amount if no rate found.
   */
  /**
   * Convert a USD amount to PKR using the rate effective on or before `asOf` date.
   * Used for overseas base costs stored in USD — multiply by USD→PKR rate.
   */
  async convertUsdToPkrAtDate(usdAmount: number, asOf: Date): Promise<number> {
    const rate = await this.prisma.exchangeRate.findFirst({
      where: {
        fromCurrency: 'USD',
        toCurrency: 'PKR',
        effectiveAt: { lte: asOf },
      },
      orderBy: { effectiveAt: 'desc' },
    });

    if (!rate) {
      const latest = await this.getLatestRate('USD', 'PKR');
      if (!latest) return usdAmount;
      return Math.round(usdAmount * Number(latest.rate) * 100) / 100;
    }

    return Math.round(usdAmount * Number(rate.rate) * 100) / 100;
  }

  async convertPkrToUsdAtDate(pkrAmount: number, asOf: Date): Promise<number> {
    const rate = await this.prisma.exchangeRate.findFirst({
      where: {
        fromCurrency: 'PKR',
        toCurrency: 'USD',
        effectiveAt: { lte: asOf },
      },
      orderBy: { effectiveAt: 'desc' },
    });

    if (!rate) {
      // fall back to latest rate
      const latest = await this.getLatestRate('PKR', 'USD');
      if (!latest) return pkrAmount;
      return Math.round((pkrAmount / Number(latest.rate)) * 100) / 100;
    }

    return Math.round((pkrAmount / Number(rate.rate)) * 100) / 100;
  }
}
