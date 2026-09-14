import { jest } from '@jest/globals';
import { WalletService } from './wallet.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { AuditLogsService } from '../audit-logs/audit-logs.service';
import type { NotificationDispatcher } from '../notifications/notification-dispatcher.service';

const noopAudit = {
  create: jest.fn(async () => undefined),
} as unknown as AuditLogsService;
const noopDispatcher = {} as unknown as NotificationDispatcher;

/**
 * Batch-8 items 4 + 4b — the staff "Consumer Wallets" board.
 *
 * Client, scrolling it: "I don't know what CATEGORY these are coming from …
 * whoever has sent money should come to the top — he sent 5,000 and he's at
 * the very bottom."
 */
describe('WalletService.list', () => {
  function mkService() {
    const findMany = jest.fn(async () => []);
    const count = jest.fn(async () => 0);
    const prisma = {
      $transaction: jest.fn(async (ops: unknown[]) => Promise.all(ops)),
      user: { findMany, count },
      walletTransaction: { findMany: jest.fn(async () => []) },
    } as unknown as PrismaService;
    return {
      service: new WalletService(prisma, noopAudit, noopDispatcher),
      findMany,
      count,
    };
  }

  // ITEM 4b: the board is headed "Consumer Wallets" but had NO role filter, so
  // it listed 16 representatives and the super admin too (17 of 82 rows).
  it('lists consumer-class roles ONLY — never representatives or staff', async () => {
    const { service, findMany, count } = mkService();
    await service.list({ page: 1, limit: 20 } as never);
    const where = (
      findMany.mock.calls[0]?.[0] as { where?: Record<string, unknown> }
    )?.where;
    expect(where?.role).toEqual({ in: ['consumer', 'lawyer', 'company'] });
    // The total must be scoped identically or the pager lies about the count.
    const countWhere = (
      count.mock.calls[0]?.[0] as { where?: Record<string, unknown> }
    )?.where;
    expect(countWhere?.role).toEqual({ in: ['consumer', 'lawyer', 'company'] });
  });

  // ITEM 4: was `createdAt: 'desc'`, which ranked every zero-balance account
  // above the people actually holding credit.
  it('orders by balance descending, with createdAt only as a tiebreaker', async () => {
    const { service, findMany } = mkService();
    await service.list({ page: 1, limit: 20 } as never);
    const orderBy = (findMany.mock.calls[0]?.[0] as { orderBy?: unknown })
      ?.orderBy;
    expect(orderBy).toEqual([{ walletBalance: 'desc' }, { createdAt: 'desc' }]);
  });

  it('keeps the role filter when a search term is supplied', async () => {
    const { service, findMany } = mkService();
    await service.list({ page: 1, limit: 20, search: 'zain' } as never);
    const where = (
      findMany.mock.calls[0]?.[0] as { where?: Record<string, unknown> }
    )?.where;
    expect(where?.role).toEqual({ in: ['consumer', 'lawyer', 'company'] });
    expect(where?.OR).toBeDefined();
  });
});

/**
 * Batch-8 item 5 — spend prepaid credit on one specific ticket.
 *
 * Client: "I have 5,000 … now suppose this is an unpaid ticket and I pay it —
 * then I'd have to deposit money AGAIN? So where is the accounting happening?"
 */
describe('WalletService.payTicketFromWallet', () => {
  function mkService(opts: {
    credit: number;
    ticket: Record<string, unknown> | null;
  }) {
    const ticketUpdate = jest.fn(async () => ({}));
    const txCreate = jest.fn(async () => ({}));
    const userUpdate = jest.fn(async () => ({}));
    const tx = {
      $executeRaw: jest.fn(async () => 1),
      user: {
        findUnique: jest.fn(async () => ({ walletBalance: opts.credit })),
        update: userUpdate,
      },
      ticket: {
        findUnique: jest
          .fn<() => Promise<unknown>>()
          .mockResolvedValueOnce(opts.ticket)
          .mockResolvedValue({ status: 'PAID' }),
        update: ticketUpdate,
      },
      walletTransaction: { create: txCreate },
    };
    const prisma = {
      $transaction: jest.fn(async (fn: (t: unknown) => unknown) => fn(tx)),
    } as unknown as PrismaService;
    return {
      service: new WalletService(prisma, noopAudit, noopDispatcher),
      ticketUpdate,
      txCreate,
      userUpdate,
    };
  }

  const openTicket = {
    id: 't1',
    batchNo: 'TKT-1',
    consumerId: 'u1',
    totalAmount: 1100,
    amountPaid: 0,
    serviceCost: 1100,
    status: 'UNPAID',
    currency: 'PKR',
    archivedAt: null,
  };

  it('applies the amount due and debits exactly that from the wallet', async () => {
    const { service, userUpdate, txCreate } = mkService({
      credit: 5000,
      ticket: openTicket,
    });
    const out = await service.payTicketFromWallet('u1', 't1');
    expect(out.applied).toBe(1100);
    expect(out.walletBalance).toBe(3900);
    expect(userUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { walletBalance: 3900 } }),
    );
    // A real ledger row, so the consumer can see where the credit went.
    expect(txCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'TICKET_DEBIT', amount: 1100 }),
      }),
    );
  });

  it('applies a PARTIAL payment when credit does not cover the bill', async () => {
    // Refusing would be strictly worse: the consumer's money is stuck and the
    // full amount stays due anyway.
    const { service } = mkService({ credit: 400, ticket: openTicket });
    const out = await service.payTicketFromWallet('u1', 't1');
    expect(out.applied).toBe(400);
    expect(out.walletBalance).toBe(0);
  });

  // 404, never 403 — consumer-class callers must not be able to probe ids
  // (the audit 3.1 rule).
  it('404s on another consumer’s ticket rather than revealing it exists', async () => {
    const { service } = mkService({
      credit: 5000,
      ticket: { ...openTicket, consumerId: 'someone-else' },
    });
    await expect(service.payTicketFromWallet('u1', 't1')).rejects.toThrow(
      'Ticket not found',
    );
  });

  it('404s on an archived ticket', async () => {
    const { service } = mkService({
      credit: 5000,
      ticket: { ...openTicket, archivedAt: new Date() },
    });
    await expect(service.payTicketFromWallet('u1', 't1')).rejects.toThrow(
      'Ticket not found',
    );
  });

  it('refuses when there is no credit to spend', async () => {
    const { service } = mkService({ credit: 0, ticket: openTicket });
    await expect(service.payTicketFromWallet('u1', 't1')).rejects.toThrow(
      /no credit/i,
    );
  });

  it('refuses when the ticket is already fully paid', async () => {
    const { service } = mkService({
      credit: 5000,
      ticket: { ...openTicket, amountPaid: 1100 },
    });
    await expect(service.payTicketFromWallet('u1', 't1')).rejects.toThrow(
      /nothing left to pay/i,
    );
  });
});
