import { jest } from '@jest/globals';
import { WalletService } from './wallet.service';

function makeDispatcher() {
  return {
    walletTopupCreated: jest.fn().mockResolvedValue(undefined),
    walletTopupDecided: jest.fn().mockResolvedValue(undefined),
    walletReceiptUploaded: jest.fn().mockResolvedValue(undefined),
    paymentSubmitted: jest.fn().mockResolvedValue(undefined),
    paymentDecided: jest.fn().mockResolvedValue(undefined),
  };
}

/**
 * Instantiates WalletService with a mocked Prisma (matching the pattern used
 * throughout wallet.service.spec.ts), stubs the target user's stored
 * `currency` to `userCurrency`, optionally stubs an attached ticket's
 * `currency`/`fxRateToPkr`, calls `topup(dto)`, and returns the object
 * actually passed to `walletTransaction.create` so a test can assert on
 * exactly what got persisted.
 */
async function captureTopup(opts: {
  userCurrency: string;
  ticket?: { currency: string; fxRateToPkr: number | null } | null;
  dto: Record<string, unknown>;
}) {
  let capturedCreateData: Record<string, unknown> | null = null;

  const prisma: any = {
    user: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'u-1',
        isActive: true,
        currency: opts.userCurrency,
      }),
    },
    ticket: {
      findUnique: jest.fn().mockResolvedValue(opts.ticket ?? null),
    },
    walletTransaction: {
      create: jest.fn().mockImplementation((args: any) => {
        capturedCreateData = args.data as Record<string, unknown>;
        return Promise.resolve({ id: 'wtx-1', ...args.data });
      }),
    },
  };

  const service = new WalletService(
    prisma as never,
    { create: jest.fn() } as never,
    makeDispatcher() as never,
  );

  await service.topup({ userId: 'u-1', ...opts.dto } as never);

  return { data: capturedCreateData as Record<string, unknown>, prisma };
}

describe('wallet write path derives currency server-side', () => {
  it('stamps the USER currency on a top-up, ignoring any client value', async () => {
    const { data } = await captureTopup({
      userCurrency: 'USD',
      dto: {
        amount: 100,
        paymentMode: 'BANK_TRANSFER',
        currency: 'PKR',
      } as never,
    });
    expect(data.currency).toBe('USD');
  });

  it('stamps PKR for a PKR user', async () => {
    const { data } = await captureTopup({
      userCurrency: 'PKR',
      dto: { amount: 100, paymentMode: 'BANK_TRANSFER' } as never,
    });
    expect(data.currency).toBe('PKR');
  });
});

describe('wallet top-up server-side FX conversion (rail-gated)', () => {
  it('converts a PKR-rail payment against a non-PKR ticket using the stamped rate', async () => {
    const { data } = await captureTopup({
      userCurrency: 'USD',
      ticket: { currency: 'USD', fxRateToPkr: 285 },
      dto: { amount: 9975, paymentMode: 'JAZZ_CASH', ticketId: 't-1' },
    });
    // 9975 PKR / 285 = 35 USD credited — never the raw PKR figure.
    expect(data.amount).toBe(35);
    expect(data.pkrAmountEntered).toBe(9975);
    expect(data.fxRateToPkr).toBe(285);
  });

  it('also converts on EASY_PAISA (the other PKR rail)', async () => {
    const { data } = await captureTopup({
      userCurrency: 'USD',
      ticket: { currency: 'USD', fxRateToPkr: 300 },
      dto: { amount: 3000, paymentMode: 'EASY_PAISA', ticketId: 't-1' },
    });
    expect(data.amount).toBe(10);
    expect(data.pkrAmountEntered).toBe(3000);
    expect(data.fxRateToPkr).toBe(300);
  });

  it('does NOT convert BANK_TRANSFER — credits the entered figure as-is', async () => {
    const { data } = await captureTopup({
      userCurrency: 'USD',
      ticket: { currency: 'USD', fxRateToPkr: 285 },
      dto: { amount: 35, paymentMode: 'BANK_TRANSFER', ticketId: 't-1' },
    });
    // A missing/irrelevant rate must never touch a bank transfer: the
    // consumer wired USD directly and their bank already converted.
    expect(data.amount).toBe(35);
    expect(data.pkrAmountEntered).toBeNull();
    expect(data.fxRateToPkr).toBeNull();
  });

  it('does not convert a PKR-rail payment against a PKR ticket (nothing to convert)', async () => {
    const { data } = await captureTopup({
      userCurrency: 'PKR',
      ticket: { currency: 'PKR', fxRateToPkr: null },
      dto: { amount: 5000, paymentMode: 'JAZZ_CASH', ticketId: 't-1' },
    });
    expect(data.amount).toBe(5000);
    expect(data.pkrAmountEntered).toBeNull();
    expect(data.fxRateToPkr).toBeNull();
  });

  it('does not convert a generic top-up with no attached ticket, on any rail', async () => {
    const { data } = await captureTopup({
      userCurrency: 'USD',
      dto: { amount: 100, paymentMode: 'JAZZ_CASH' },
    });
    expect(data.amount).toBe(100);
    expect(data.pkrAmountEntered).toBeNull();
    expect(data.fxRateToPkr).toBeNull();
  });

  it('REJECTS a PKR-rail payment against a non-PKR ticket with no stamped rate — never falls back to 1.0', async () => {
    await expect(
      captureTopup({
        userCurrency: 'USD',
        ticket: { currency: 'USD', fxRateToPkr: null },
        dto: { amount: 9975, paymentMode: 'JAZZ_CASH', ticketId: 't-1' },
      }),
    ).rejects.toThrow(/FX rate not set/);
  });

  it('REJECTS a PKR-rail payment against a non-PKR ticket with a non-positive rate', async () => {
    await expect(
      captureTopup({
        userCurrency: 'USD',
        ticket: { currency: 'USD', fxRateToPkr: 0 },
        dto: { amount: 9975, paymentMode: 'JAZZ_CASH', ticketId: 't-1' },
      }),
    ).rejects.toThrow(/FX rate not set/);
  });
});
