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
    const auditCreate = jest.fn(async () => undefined);
    const audit = { create: auditCreate } as unknown as AuditLogsService;
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
      service: new WalletService(prisma, audit, noopDispatcher),
      ticketUpdate,
      txCreate,
      userUpdate,
      auditCreate,
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
    // Digital ONE_TIME flow: due = totalAmount - amountPaid.
    intakeFlow: 'judicial_case_information',
    remainderFinalizedAt: null,
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

/**
 * Batch-8 REVIEW findings 4, 5, 6, 8 — the parts of payTicketFromWallet the
 * first implementation got wrong.
 */
describe('WalletService.payTicketFromWallet — review fixes', () => {
  function build(ticket: Record<string, unknown>, credit: number) {
    const userUpdate = jest.fn(async () => ({}));
    const txCreate = jest.fn(async () => ({}));
    const auditCreate = jest.fn(async () => undefined);
    const tx = {
      $executeRaw: jest.fn(async () => 1),
      user: {
        findUnique: jest.fn(async () => ({ walletBalance: credit })),
        update: userUpdate,
      },
      ticket: {
        findUnique: jest
          .fn<() => Promise<unknown>>()
          .mockResolvedValueOnce(ticket)
          .mockResolvedValue({ status: 'PAID' }),
        update: jest.fn(async () => ({})),
      },
      walletTransaction: { create: txCreate },
    };
    const prisma = {
      $transaction: jest.fn(async (fn: (t: unknown) => unknown) => fn(tx)),
    } as unknown as PrismaService;
    return {
      service: new WalletService(
        prisma,
        { create: auditCreate } as unknown as AuditLogsService,
        noopDispatcher,
      ),
      userUpdate,
      txCreate,
      auditCreate,
    };
  }

  /**
   * FINDING 4 — the server debited `totalAmount − amountPaid` while the pay
   * page's button showed the PHASE-AWARE due (`serviceCost − amountPaid` for a
   * SPLIT flow before the remainder is finalized). `totalAmount` carries tax,
   * so with a non-zero rate the button read "covers the full PKR 3,000" and
   * the server would have taken PKR 3,300 — money the consumer was never
   * shown. Tax is configured at 0 today, so this was dormant, not absent.
   */
  const splitPreFinalize = {
    id: 't1',
    batchNo: 'TKT-1',
    consumerId: 'u1',
    serviceCost: 3000, // phase-1 base — what the consumer is asked for
    totalAmount: 3300, // base + 10% tax
    amountPaid: 0,
    status: 'UNPAID',
    currency: 'PKR',
    archivedAt: null,
    intakeFlow: 'judicial_case_files', // SPLIT
    remainderFinalizedAt: null,
  };

  it('debits only the PHASE-1 base on a SPLIT ticket before finalize', async () => {
    const { service, userUpdate } = build(splitPreFinalize, 5000);
    const out = await service.payTicketFromWallet('u1', 't1');
    expect(out.applied).toBe(3000);
    expect(out.walletBalance).toBe(2000);
    expect(userUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { walletBalance: 2000 } }),
    );
  });

  it('debits the FULL total once the SPLIT remainder is finalized', async () => {
    const { service } = build(
      { ...splitPreFinalize, remainderFinalizedAt: new Date() },
      5000,
    );
    expect((await service.payTicketFromWallet('u1', 't1')).applied).toBe(3300);
  });

  it('debits the full total for a digital ONE_TIME flow', async () => {
    const { service } = build(
      { ...splitPreFinalize, intakeFlow: 'judicial_case_information' },
      5000,
    );
    expect((await service.payTicketFromWallet('u1', 't1')).applied).toBe(3300);
  });

  // FINDING 8 — both operands are Number()-coerced Decimals.
  it('rounds the written balance to 2dp instead of persisting float drift', async () => {
    // These operands are chosen because the RAW subtraction genuinely drifts:
    // 5000.3 - 1100.1 === 3900.2000000000003 in IEEE-754. An earlier version
    // of this test used inputs that happened to subtract cleanly, so it passed
    // even with round2 removed — a guard that cannot fail is not a guard.
    const { service, userUpdate } = build(
      { ...splitPreFinalize, serviceCost: 1100.1, totalAmount: 1100.1 },
      5000.3,
    );
    const out = await service.payTicketFromWallet('u1', 't1');
    expect(5000.3 - 1100.1).not.toBe(3900.2); // the drift is real
    expect(out.walletBalance).toBe(3900.2);
    expect(userUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { walletBalance: 3900.2 } }),
    );
  });

  // FINDING 6 — "Auto-deducted" is untrue on a path the consumer chose.
  it('labels the ledger row as a deliberate wallet payment, not an auto-deduction', async () => {
    const { service, txCreate } = build(splitPreFinalize, 5000);
    await service.payTicketFromWallet('u1', 't1');
    const note = (txCreate.mock.calls[0]?.[0] as { data?: { note?: string } })
      ?.data?.note;
    expect(note).toMatch(/paid from wallet/i);
    expect(note).not.toMatch(/auto-deducted/i);
  });

  // FINDING 5 — every other money-moving path in this service audits.
  it('writes an audit row naming the actor, the ticket and the amount', async () => {
    const { service, auditCreate } = build(splitPreFinalize, 5000);
    await service.payTicketFromWallet('u1', 't1');
    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'WALLET_TICKET_PAYMENT',
        entity: 'TICKET',
        entityId: 't1',
        actorUserId: 'u1',
        metadata: expect.objectContaining({ applied: 3000 }),
      }),
    );
  });

  it('does NOT audit when the debit was refused', async () => {
    // An audit row for a payment that never happened is a lie — the same rule
    // INVOICE_GENERATED follows (write only after the transaction commits).
    const { service, auditCreate } = build(splitPreFinalize, 0);
    await expect(service.payTicketFromWallet('u1', 't1')).rejects.toThrow();
    expect(auditCreate).not.toHaveBeenCalled();
  });
});
