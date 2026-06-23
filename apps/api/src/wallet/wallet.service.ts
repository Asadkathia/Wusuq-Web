import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PaymentMode, Prisma, TicketStatus } from '@prisma/client';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { NotificationDispatcher } from '../notifications/notification-dispatcher.service';
import { PrismaService } from '../prisma/prisma.service';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { TopupWalletDto } from './dto/topup-wallet.dto';

@Injectable()
export class WalletService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
    private readonly dispatcher: NotificationDispatcher,
  ) {}

  async list(query: PaginationQueryDto) {
    const skip = (query.page - 1) * query.limit;

    const userWhere = query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' as const } },
            { email: { contains: query.search, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const [users, total, pendingTopups] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where: userWhere,
        skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: { walletTransactions: true },
          },
        },
      }),
      this.prisma.user.count({ where: userWhere }),
      this.prisma.walletTransaction.findMany({
        where: { status: 'PENDING_VERIFICATION' },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    ]);

    return {
      items: users.map((user, index) => ({
        sr: skip + index + 1,
        userId: user.id,
        consumerName: user.name,
        accountBalance: Number(user.walletBalance),
        totalTransactions: user._count.walletTransactions,
        createdAt: user.createdAt,
      })),
      page: query.page,
      limit: query.limit,
      total,
      pendingTopups,
    };
  }

  async topup(
    dto: TopupWalletDto,
    actor?: { actorUserId?: string; actorEmail?: string },
  ) {
    if (!dto.userId) {
      throw new BadRequestException('userId is required');
    }
    await this.ensureUserExistsAndActive(dto.userId);

    const transaction = await this.prisma.walletTransaction.create({
      data: {
        userId: dto.userId,
        amount: dto.amount,
        paymentMode: dto.paymentMode,
        currency: dto.currency,
        status: 'PENDING_VERIFICATION',
        receiptUrl: dto.receiptUrl,
        ticketId: dto.ticketId ?? null,
        type: dto.ticketId ? 'TICKET_PAYMENT' : 'TOPUP',
      },
    });

    await this.auditLogsService.create({
      action: 'WALLET_TOPUP_CREATED',
      entity: 'WALLET_TRANSACTION',
      entityId: transaction.id,
      actorUserId: actor?.actorUserId,
      actorEmail: actor?.actorEmail,
      metadata: {
        userId: dto.userId,
        amount: dto.amount,
      },
    });

    if (transaction.type === 'TICKET_PAYMENT') {
      await this.dispatcher
        .paymentSubmitted(transaction.id)
        .catch(() => undefined);
    } else {
      await this.dispatcher
        .walletTopupCreated(transaction.id)
        .catch(() => undefined);
    }

    return {
      success: true,
      transaction,
      status: 'PENDING_VERIFICATION',
    };
  }

  async verifyTopup(
    transactionId: string,
    payload: { note?: string },
    actor?: { actorUserId?: string; actorEmail?: string },
  ) {
    const result = await this.prisma.$transaction(async (tx) => {
      // Lock the transaction row first so two concurrent verify calls
      // serialize. Re-read the locked state and decide on action atomically.
      await tx.$executeRaw`SELECT id FROM "WalletTransaction" WHERE id = ${transactionId} FOR UPDATE`;

      const locked = await tx.walletTransaction.findUnique({
        where: { id: transactionId },
      });

      if (!locked) {
        throw new NotFoundException('Transaction not found');
      }
      if (locked.status !== 'PENDING_VERIFICATION') {
        return {
          alreadyProcessed: true,
          transaction: locked,
          userId: locked.userId,
        };
      }

      // Conditional update: only flip PENDING → VERIFIED, never re-verify.
      const updateResult = await tx.walletTransaction.updateMany({
        where: { id: transactionId, status: 'PENDING_VERIFICATION' },
        data: {
          status: 'VERIFIED',
          verifiedAt: new Date(),
          reviewedByUserId: actor?.actorUserId,
          note: payload.note,
        },
      });
      if (updateResult.count !== 1) {
        // Lost the race despite the row lock — be safe.
        const fresh = await tx.walletTransaction.findUniqueOrThrow({
          where: { id: transactionId },
        });
        return {
          alreadyProcessed: true,
          transaction: fresh,
          userId: fresh.userId,
        };
      }

      // Lock the user row before crediting.
      await tx.$executeRaw`SELECT id FROM "User" WHERE id = ${locked.userId} FOR UPDATE`;

      const creditedUser = await tx.user.update({
        where: { id: locked.userId },
        data: { walletBalance: { increment: locked.amount } },
        select: { id: true, walletBalance: true },
      });

      await this.clearPendingTickets(
        creditedUser.id,
        Number(creditedUser.walletBalance),
        locked.paymentMode,
        tx,
      );

      const updatedTransaction = await tx.walletTransaction.findUniqueOrThrow({
        where: { id: transactionId },
      });

      return {
        alreadyProcessed: false,
        transaction: updatedTransaction,
        userId: locked.userId,
      };
    });

    if (!result.alreadyProcessed) {
      await this.auditLogsService.create({
        action: 'WALLET_TOPUP_VERIFIED',
        entity: 'WALLET_TRANSACTION',
        entityId: result.transaction.id,
        actorUserId: actor?.actorUserId,
        actorEmail: actor?.actorEmail,
        metadata: {
          userId: result.userId,
          amount: Number(result.transaction.amount),
        },
      });
      if (result.transaction.type === 'TICKET_PAYMENT') {
        await this.dispatcher
          .paymentDecided(result.transaction.id, true)
          .catch(() => undefined);
      } else {
        await this.dispatcher
          .walletTopupDecided(result.transaction.id, 'VERIFIED')
          .catch(() => undefined);
      }
    }

    return {
      success: true,
      alreadyProcessed: result.alreadyProcessed,
      transaction: result.transaction,
      userId: result.userId,
    };
  }

  async rejectTopup(
    transactionId: string,
    payload: { note?: string },
    actor?: { actorUserId?: string; actorEmail?: string },
  ) {
    // Mirrors verifyTopup (audit 1.1): lock + conditional update so a late or
    // concurrent reject can never flip an already-VERIFIED (credited, possibly
    // spent) top-up to REJECTED — there is no reversal path for the credit.
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM "WalletTransaction" WHERE id = ${transactionId} FOR UPDATE`;

      const locked = await tx.walletTransaction.findUnique({
        where: { id: transactionId },
      });
      if (!locked) {
        throw new NotFoundException('Transaction not found');
      }
      if (locked.status !== 'PENDING_VERIFICATION') {
        return { alreadyProcessed: true, transaction: locked };
      }

      const updateResult = await tx.walletTransaction.updateMany({
        where: { id: transactionId, status: 'PENDING_VERIFICATION' },
        data: {
          status: 'REJECTED',
          reviewedByUserId: actor?.actorUserId,
          note: payload.note,
        },
      });
      if (updateResult.count !== 1) {
        const fresh = await tx.walletTransaction.findUniqueOrThrow({
          where: { id: transactionId },
        });
        return { alreadyProcessed: true, transaction: fresh };
      }

      const rejected = await tx.walletTransaction.findUniqueOrThrow({
        where: { id: transactionId },
      });
      return { alreadyProcessed: false, transaction: rejected };
    });

    if (result.alreadyProcessed) {
      return {
        success: true,
        alreadyProcessed: true,
        transaction: result.transaction,
      };
    }

    const rejected = result.transaction;
    await this.auditLogsService.create({
      action: 'WALLET_TOPUP_REJECTED',
      entity: 'WALLET_TRANSACTION',
      entityId: rejected.id,
      actorUserId: actor?.actorUserId,
      actorEmail: actor?.actorEmail,
      metadata: {
        userId: rejected.userId,
        amount: Number(rejected.amount),
      },
    });

    if (rejected.type === 'TICKET_PAYMENT') {
      await this.dispatcher
        .paymentDecided(rejected.id, false)
        .catch(() => undefined);
    } else {
      await this.dispatcher
        .walletTopupDecided(rejected.id, 'REJECTED')
        .catch(() => undefined);
    }

    return { success: true, alreadyProcessed: false, transaction: rejected };
  }

  async history(userId: string) {
    await this.ensureUserExists(userId);

    const items = await this.prisma.walletTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    return { userId, items };
  }

  async getMyWallet(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        walletBalance: true,
        currency: true,
      },
    });

    const transactions = await this.prisma.walletTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        amount: true,
        paymentMode: true,
        status: true,
        createdAt: true,
        verifiedAt: true,
      },
    });

    // Dynamic balance: prepaid credit (walletBalance, never < 0) minus the
    // consumer's outstanding ticket dues. Goes negative when they owe more than
    // they've topped up — e.g. after choosing "Pay later". Every non-delivered,
    // positively-priced ticket with a remaining amount counts toward dues (not
    // only ones explicitly deferred). Verified top-ups auto-settle tickets
    // (clearPendingTickets), so dues shrink and the net rises back toward >= 0.
    const credit = Number(user.walletBalance || 0);
    const due = await this.outstandingDuesForUser(userId);

    return {
      balance: credit - due,
      credit,
      due,
      currency: user.currency,
      transactions: transactions.map((transaction) => ({
        ...transaction,
        amount: Number(transaction.amount || 0),
        referenceNo: transaction.id,
      })),
    };
  }

  /**
   * Sum of remaining amounts (totalAmount − amountPaid) across a consumer's
   * tickets that are not yet DELIVERED and carry a positive price. This is the
   * amount the consumer still owes; the wallet net balance subtracts it from
   * prepaid credit.
   */
  private async outstandingDuesForUser(userId: string): Promise<number> {
    const tickets = await this.prisma.ticket.findMany({
      // Audit 4.2: archived tickets no longer owe anything.
      where: {
        consumerId: userId,
        status: { not: 'DELIVERED' },
        archivedAt: null,
      },
      select: { totalAmount: true, amountPaid: true },
    });
    return tickets.reduce((sum, t) => {
      const total = Number(t.totalAmount);
      if (total <= 0) return sum;
      const remaining = total - Number(t.amountPaid);
      return remaining > 0 ? sum + remaining : sum;
    }, 0);
  }

  async isReceiptOwnedBy(filename: string, userId: string): Promise<boolean> {
    // Match either the new authenticated path (/wallet/receipt/<file>) or
    // the legacy /uploads/wallet-receipts/<file> for backwards compatibility
    // with rows persisted before this change.
    const newUrl = `/wallet/receipt/${filename}`;
    const legacyUrl = `/uploads/wallet-receipts/${filename}`;
    const hit = await this.prisma.walletTransaction.findFirst({
      where: { userId, receiptUrl: { in: [newUrl, legacyUrl] } },
      select: { id: true },
    });
    return Boolean(hit);
  }

  async recordReceiptUpload(
    file: { filename: string; path: string; mimetype: string },
    actor: { actorUserId: string; actorEmail?: string },
  ) {
    // Persist the *authenticated* download URL so the admin UI can hand it
    // to apiClient.getBlob() unchanged. Bare /uploads/... is never served.
    const url = `/wallet/receipt/${file.filename}`;
    await this.auditLogsService.create({
      action: 'WALLET_RECEIPT_UPLOADED',
      entity: 'WALLET_TRANSACTION',
      entityId: file.filename,
      actorUserId: actor.actorUserId,
      actorEmail: actor.actorEmail,
      metadata: { path: file.path, mimetype: file.mimetype },
    });
    await this.dispatcher.walletReceiptUploaded().catch(() => undefined);
    return { url, path: url, filename: file.filename };
  }

  /**
   * Public wrapper around clearPendingTickets for use by TicketsService after
   * finalizing a remainder. Opens its own $transaction and re-reads the user's
   * current wallet balance so callers don't need to pass it in.
   */
  async settleTicketsForUser(userId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { walletBalance: true },
      });
      if (!user) return;
      await this.clearPendingTickets(
        userId,
        Number(user.walletBalance),
        'BANK_TRANSFER',
        tx,
      );
    });
  }

  /**
   * Admin wallet adjustment: increments/decrements walletBalance, writes an
   * ADMIN_ADJUSTMENT WalletTransaction (status VERIFIED), and re-settles tickets
   * on a positive adjustment.
   */
  async adjustWallet(
    userId: string,
    amount: number,
    note: string,
    adminId?: string,
  ) {
    const result = await this.prisma.$transaction(async (tx) => {
      // Audit 1.7: walletBalance is prepaid credit and must never go negative
      // (clearPendingTickets floors deductions at 0; this path must too).
      // Lock the user row so a concurrent settlement can't invalidate the
      // check between read and increment.
      await tx.$executeRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
      const current = await tx.user.findUnique({
        where: { id: userId },
        select: { walletBalance: true, currency: true },
      });
      if (!current) {
        throw new NotFoundException('User not found');
      }
      if (Number(current.walletBalance) + amount < 0) {
        throw new BadRequestException(
          `Adjustment would make the wallet balance negative (current credit: ${Number(
            current.walletBalance,
          )})`,
        );
      }
      const user = await tx.user.update({
        where: { id: userId },
        data: { walletBalance: { increment: amount } },
        select: { walletBalance: true },
      });
      const txn = await tx.walletTransaction.create({
        data: {
          userId,
          amount,
          paymentMode: 'BANK_TRANSFER',
          currency: current.currency,
          status: 'VERIFIED',
          type: 'ADMIN_ADJUSTMENT',
          verifiedAt: new Date(),
          reviewedByUserId: adminId,
          note,
        },
      });
      if (amount > 0) {
        await this.clearPendingTickets(
          userId,
          Number(user.walletBalance),
          'BANK_TRANSFER',
          tx,
        );
      }
      return { user, txnId: txn.id };
    });
    // Sensitive admin action — record it in the audit trail.
    await this.auditLogsService.create({
      action: 'WALLET_ADJUSTED',
      entity: 'WALLET_TRANSACTION',
      entityId: result.txnId,
      actorUserId: adminId,
      metadata: { userId, amount, note },
    });
    return result.user;
  }

  // Auto-applies wallet balance to the consumer's oldest unpaid tickets in
  // FIFO order. Skips tickets with totalAmount <= 0 so a free-priced or
  // unresolved-pricing ticket never gets silently marked PAID. Records the
  // top-up's original payment mode on each settlement transaction so finance
  // history can still show how the money came in.
  private async clearPendingTickets(
    userId: string,
    postTopupBalance: number,
    paymentMode: PaymentMode,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const candidateIds = await tx.ticket.findMany({
      where: {
        consumerId: userId,
        status: { notIn: ['DELIVERED'] },
        // Audit 4.2: never auto-settle an archived ticket.
        archivedAt: null,
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });

    let remainingBalance = postTopupBalance;

    for (const { id } of candidateIds) {
      if (remainingBalance <= 0) break;

      // Lock the ticket row, then re-read its money columns under the lock.
      // This serialises wallet auto-deduction against finance.reconcilePayment
      // (which also takes a row-level lock on the same ticket) so two
      // concurrent payment paths can't race on the same ticket and
      // overpay.
      await tx.$executeRaw`SELECT id FROM "Ticket" WHERE id = ${id} FOR UPDATE`;

      const fresh = await tx.ticket.findUnique({
        where: { id },
        select: {
          id: true,
          batchNo: true,
          totalAmount: true,
          amountPaid: true,
          serviceCost: true,
          status: true,
          currency: true,
        },
      });
      if (!fresh) continue;
      // Status may have been fully settled between findMany and the lock.
      if (fresh.status === 'DELIVERED') continue;

      const totalAmount = Number(fresh.totalAmount);
      const amountPaid = Number(fresh.amountPaid);

      // Tickets without a resolved positive price never auto-settle.
      if (totalAmount <= 0) continue;

      const ticketRemaining = totalAmount - amountPaid;
      if (ticketRemaining <= 0) continue;

      const deducted = Math.min(remainingBalance, ticketRemaining);

      await this.applyPaymentToTicket(
        tx,
        {
          ticketId: fresh.id,
          batchNo: fresh.batchNo,
          totalAmount,
          amountPaid,
          serviceCost: Number(fresh.serviceCost),
          status: fresh.status,
          currency: fresh.currency,
        },
        deducted,
        paymentMode,
        userId,
      );

      remainingBalance -= deducted;
    }

    // Write final balance back after all deductions
    await tx.user.update({
      where: { id: userId },
      data: { walletBalance: remainingBalance },
    });
  }

  // Single point of payment-application logic so wallet auto-deduction and
  // any future ticket-targeted payment path stay consistent. NOTE: callers
  // must already have a row-level lock on the user / ticket where needed.
  private async applyPaymentToTicket(
    tx: Prisma.TransactionClient,
    ticket: {
      ticketId: string;
      batchNo: string;
      totalAmount: number;
      amountPaid: number;
      serviceCost: number;
      status: string;
      currency: string;
    },
    deducted: number,
    paymentMode: PaymentMode,
    userId: string,
  ) {
    const newAmountPaid = ticket.amountPaid + deducted;
    const data: { amountPaid: { increment: number }; status?: TicketStatus } = {
      amountPaid: { increment: deducted },
    };
    if (ticket.status === 'UNPAID' && newAmountPaid >= ticket.serviceCost) {
      data.status = 'PAID';
    }

    await tx.ticket.update({
      where: { id: ticket.ticketId },
      data,
    });

    await tx.walletTransaction.create({
      data: {
        userId,
        ticketId: ticket.ticketId,
        amount: deducted,
        paymentMode,
        currency: ticket.currency,
        status: 'VERIFIED',
        type: 'TICKET_DEBIT',
        verifiedAt: new Date(),
        note: `Auto-deducted for ticket ${ticket.batchNo}`,
      },
    });
  }

  private async ensureUserExists(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
  }

  private async ensureUserExistsAndActive(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, isActive: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (!user.isActive) {
      throw new BadRequestException('User is not active');
    }
  }
}
