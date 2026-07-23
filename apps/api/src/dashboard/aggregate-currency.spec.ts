import { jest } from '@jest/globals';
import { convertToPkr } from '@wusuq/shared';
import { DashboardService } from './dashboard.service';
import { FinanceService } from '../finance/finance.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { AuditLogsService } from '../audit-logs/audit-logs.service';
import type { FinanceQueryDto } from '../finance/dto/finance-query.dto';

/**
 * Task 6 — multi-user KPI aggregates must sum PKR equivalents, never raw
 * mixed-currency amounts. PKR tickets contribute `totalAmount` directly;
 * non-PKR tickets convert via the stamped `fxRateToPkr`; a ticket whose
 * conversion returns null is EXCLUDED from the sum and COUNTED.
 */
describe('mixed-currency aggregation', () => {
  const tickets = [
    { totalAmount: 500, currency: 'PKR', fxRateToPkr: null },
    { totalAmount: 35, currency: 'USD', fxRateToPkr: 285 },
    { totalAmount: 20, currency: 'USD', fxRateToPkr: null }, // no rate
  ];

  const sumPkr = (rows: typeof tickets) =>
    rows.reduce(
      (acc, t) => {
        if (t.currency === 'PKR')
          return { ...acc, total: acc.total + Number(t.totalAmount) };
        const pkr = convertToPkr(t.totalAmount, t.fxRateToPkr);
        return pkr === null
          ? { ...acc, unconvertedCount: acc.unconvertedCount + 1 }
          : { ...acc, total: acc.total + pkr };
      },
      { total: 0, unconvertedCount: 0 },
    );

  it('sums PKR equivalents rather than raw mixed amounts', () => {
    // Raw (buggy) sum would be 555. Correct: 500 + (35 x 285) = 10,475.
    expect(sumPkr(tickets).total).toBe(10475);
  });

  it('excludes and COUNTS rate-less tickets instead of understating silently', () => {
    expect(sumPkr(tickets).unconvertedCount).toBe(1);
  });
});

/**
 * The reduce shape above is self-contained and proves nothing about the real
 * service. These tests exercise `DashboardService`'s actual KPI query
 * (`getRevenueKpis`, consumed by `getSummary`) against a mocked Prisma, and
 * `FinanceService.findAll`'s `summary` reduce, so a regression in the real
 * aggregation code — not just the contract — fails these tests.
 */
describe('DashboardService — revenue KPI aggregate sums PKR equivalents', () => {
  function mkPrisma(revenueRows: unknown[]) {
    const ticketFindMany = jest.fn(async () => revenueRows);
    const prisma = {
      ticket: {
        count: jest.fn(async () => 0),
        findMany: ticketFindMany,
        groupBy: jest.fn(async () => []),
        aggregate: jest.fn(async () => ({
          _sum: { totalAmount: 0, amountPaid: 0 },
        })),
        findFirst: jest.fn(async () => null),
      },
      walletTransaction: {
        aggregate: jest.fn(async () => ({ _sum: { amount: 0 } })),
        count: jest.fn(async () => 0),
        findFirst: jest.fn(async () => null),
        findMany: jest.fn(async () => []),
      },
      case: {
        findMany: jest.fn(async () => []),
      },
      auditLog: {
        findMany: jest.fn(async () => []),
      },
      assignment: {
        groupBy: jest.fn(async () => []),
      },
      user: {
        findMany: jest.fn(async () => []),
      },
    } as unknown as PrismaService;
    return { prisma, ticketFindMany };
  }

  it('sums PKR equivalents across mixed-currency tickets and excludes/counts rate-less ones', async () => {
    const { prisma } = mkPrisma([
      { totalAmount: 500, amountPaid: 500, currency: 'PKR', fxRateToPkr: null },
      { totalAmount: 35, amountPaid: 35, currency: 'USD', fxRateToPkr: 285 },
      { totalAmount: 20, amountPaid: 0, currency: 'USD', fxRateToPkr: null },
    ]);
    const service = new DashboardService(prisma);

    const kpis = await (
      service as unknown as {
        getRevenueKpis: () => Promise<{
          totalRevenue: number;
          outstandingBalance: number;
          unconvertedCount: number;
        }>;
      }
    ).getRevenueKpis();

    // paid PKR-equivalent: 500 + (35 x 285) = 10,475
    expect(kpis.totalRevenue).toBe(10475);
    // outstanding = total (10,475, same rows) - paid (10,475) = 0
    expect(kpis.outstandingBalance).toBe(0);
    // the rate-less USD ticket is excluded from both sums and counted once
    expect(kpis.unconvertedCount).toBe(1);
  });

  it('treats a null/undefined currency as PKR (legacy rows predating the currency column)', async () => {
    const { prisma } = mkPrisma([
      { totalAmount: 100, amountPaid: 40, currency: null, fxRateToPkr: null },
    ]);
    const service = new DashboardService(prisma);

    const kpis = await (
      service as unknown as {
        getRevenueKpis: () => Promise<{
          totalRevenue: number;
          outstandingBalance: number;
          unconvertedCount: number;
        }>;
      }
    ).getRevenueKpis();

    expect(kpis.totalRevenue).toBe(40);
    expect(kpis.outstandingBalance).toBe(60);
    expect(kpis.unconvertedCount).toBe(0);
  });
});

/**
 * The "Outstanding > 30 days (PKR)" pending action used to be computed from
 * a raw Prisma `_sum` aggregate — no currency awareness, so a $35 USD ticket
 * contributed 35 to a total explicitly labelled PKR. This exercises the
 * fixed `getAgedOutstandingKpi`, which reuses `sumMixedCurrencyToPkr` over a
 * per-ticket, currency-aware, floored-at-0 remainder.
 */
describe('DashboardService — aged-outstanding KPI sums PKR equivalents', () => {
  function mkPrisma(rows: unknown[]) {
    const ticketFindMany = jest.fn(async () => rows);
    const prisma = {
      ticket: {
        findMany: ticketFindMany,
      },
    } as unknown as PrismaService;
    return { prisma, ticketFindMany };
  }

  it('sums PKR-equivalent remainders across mixed-currency tickets and excludes/counts rate-less ones', async () => {
    const { prisma } = mkPrisma([
      // PKR ticket, 300 outstanding
      { totalAmount: 500, amountPaid: 200, currency: 'PKR', fxRateToPkr: null },
      // USD ticket, 35 outstanding @ 285 -> 9,975 PKR
      { totalAmount: 35, amountPaid: 0, currency: 'USD', fxRateToPkr: 285 },
      // USD ticket, no fx rate stamped -> excluded, counted
      { totalAmount: 20, amountPaid: 0, currency: 'USD', fxRateToPkr: null },
    ]);
    const service = new DashboardService(prisma);

    const result = await (
      service as unknown as {
        getAgedOutstandingKpi: (
          d: Date,
        ) => Promise<{ amount: number; unconvertedCount: number }>;
      }
    ).getAgedOutstandingKpi(new Date());

    // Raw (buggy) sum would be (500-200) + (35-0) + (20-0) = 335.
    // Correct: 300 + (35 x 285) = 10,275.
    expect(result.amount).toBe(10275);
    expect(result.unconvertedCount).toBe(1);
  });

  it('floors a per-ticket remainder at 0 instead of letting an overpaid ticket go negative', async () => {
    const { prisma } = mkPrisma([
      // Overpaid PKR ticket: remainder would be -100, must contribute 0.
      { totalAmount: 400, amountPaid: 500, currency: 'PKR', fxRateToPkr: null },
      // Normal PKR ticket, 250 outstanding.
      { totalAmount: 250, amountPaid: 0, currency: 'PKR', fxRateToPkr: null },
    ]);
    const service = new DashboardService(prisma);

    const result = await (
      service as unknown as {
        getAgedOutstandingKpi: (
          d: Date,
        ) => Promise<{ amount: number; unconvertedCount: number }>;
      }
    ).getAgedOutstandingKpi(new Date());

    // If the overpaid ticket's -100 were allowed through, this would be 150.
    expect(result.amount).toBe(250);
    expect(result.unconvertedCount).toBe(0);
  });
});

describe('FinanceService.findAll — summary sums PKR equivalents', () => {
  function mkPrisma(items: unknown[]) {
    const prisma = {
      ticket: {
        findMany: jest.fn(async () => items),
        count: jest.fn(async () => items.length),
      },
      $transaction: jest.fn(async (ops: Promise<unknown>[]) =>
        Promise.all(ops),
      ),
    } as unknown as PrismaService;
    return prisma;
  }

  it('sums PKR equivalents over the page and reports unconvertedCount', async () => {
    const items = [
      {
        id: 't1',
        batchNo: 'B1',
        status: 'PAID',
        consumer: null,
        service: null,
        serviceCity: null,
        caseType: null,
        currency: 'PKR',
        fxRateToPkr: null,
        totalAmount: 500,
        amountPaid: 500,
        serviceCost: 0,
        deliveryCharges: 0,
        printingCharges: 0,
        attestedCharges: 0,
        nonAttestedCharges: 0,
        additionalCharges: 0,
        additionalServiceCost: 0,
        discountPrice: 0,
        taxRate: 0,
        taxAmount: 0,
        promoDiscount: 0,
        clerkCost: 0,
        clerkAttestedCharges: null,
        clerkNonAttestedCharges: null,
        clerkPrintingCharges: null,
        clerkDeliveryCharges: null,
        formPayload: null,
      },
      {
        id: 't2',
        batchNo: 'B2',
        status: 'PAID',
        consumer: null,
        service: null,
        serviceCity: null,
        caseType: null,
        currency: 'USD',
        fxRateToPkr: 285,
        totalAmount: 35,
        amountPaid: 35,
        serviceCost: 0,
        deliveryCharges: 0,
        printingCharges: 0,
        attestedCharges: 0,
        nonAttestedCharges: 0,
        additionalCharges: 0,
        additionalServiceCost: 0,
        discountPrice: 0,
        taxRate: 0,
        taxAmount: 0,
        promoDiscount: 0,
        clerkCost: 0,
        clerkAttestedCharges: null,
        clerkNonAttestedCharges: null,
        clerkPrintingCharges: null,
        clerkDeliveryCharges: null,
        formPayload: null,
      },
      {
        id: 't3',
        batchNo: 'B3',
        status: 'PAID',
        consumer: null,
        service: null,
        serviceCity: null,
        caseType: null,
        currency: 'USD',
        fxRateToPkr: null,
        totalAmount: 20,
        amountPaid: 0,
        serviceCost: 0,
        deliveryCharges: 0,
        printingCharges: 0,
        attestedCharges: 0,
        nonAttestedCharges: 0,
        additionalCharges: 0,
        additionalServiceCost: 0,
        discountPrice: 0,
        taxRate: 0,
        taxAmount: 0,
        promoDiscount: 0,
        clerkCost: 0,
        clerkAttestedCharges: null,
        clerkNonAttestedCharges: null,
        clerkPrintingCharges: null,
        clerkDeliveryCharges: null,
        formPayload: null,
      },
    ];
    const prisma = mkPrisma(items);
    const auditLogsService = { log: jest.fn(async () => undefined) };
    const service = new FinanceService(
      prisma,
      auditLogsService as unknown as AuditLogsService,
    );

    const result = await service.findAll({
      page: 1,
      limit: 200,
    } as unknown as FinanceQueryDto);

    // 500 (PKR) + 35 x 285 (USD @rate) = 10,475; the rate-less ticket
    // (20 USD) is excluded and counted, not silently dropped from the total
    // AND not silently included at face value either.
    expect(result.summary.totalAmount).toBe(10475);
    expect(result.summary.paidAmount).toBe(10475);
    expect(result.summary.remainingAmount).toBe(0);
    expect(result.summary.unconvertedCount).toBe(1);
  });
});
