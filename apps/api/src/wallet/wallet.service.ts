import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { PrismaService } from '../prisma/prisma.service';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { TopupWalletDto } from './dto/topup-wallet.dto';

@Injectable()
export class WalletService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
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
    await this.ensureUserExists(dto.userId);

    const transaction = await this.prisma.walletTransaction.create({
      data: {
        userId: dto.userId,
        amount: dto.amount,
        paymentMode: dto.paymentMode,
        currency: dto.currency,
        status: 'PENDING_VERIFICATION',
        receiptUrl: dto.receiptUrl,
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
    const transaction = await this.prisma.walletTransaction.findUnique({
      where: { id: transactionId },
    });

    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    if (transaction.status !== 'PENDING_VERIFICATION') {
      return { success: true, alreadyProcessed: true, transaction };
    }

    const { updatedTransaction, updatedUser } = await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT id FROM "User" WHERE id = ${transaction.userId} FOR UPDATE`;

        const updatedTransaction = await tx.walletTransaction.update({
          where: { id: transactionId },
          data: {
            status: 'VERIFIED',
            verifiedAt: new Date(),
            reviewedByUserId: actor?.actorUserId,
            note: payload.note,
          },
        });

        const creditedUser = await tx.user.update({
          where: { id: transaction.userId },
          data: { walletBalance: { increment: transaction.amount } },
          select: { id: true, walletBalance: true },
        });

        await this.clearPendingTickets(
          creditedUser.id,
          Number(creditedUser.walletBalance),
          tx,
        );

        // Re-read the final balance after deductions
        const updatedUser = await tx.user.findUniqueOrThrow({
          where: { id: creditedUser.id },
          select: { id: true, walletBalance: true },
        });

        return { updatedTransaction, updatedUser };
      },
    );

    await this.auditLogsService.create({
      action: 'WALLET_TOPUP_VERIFIED',
      entity: 'WALLET_TRANSACTION',
      entityId: updatedTransaction.id,
      actorUserId: actor?.actorUserId,
      actorEmail: actor?.actorEmail,
      metadata: {
        userId: transaction.userId,
        amount: Number(transaction.amount),
      },
    });

    return {
      success: true,
      transaction: updatedTransaction,
      userId: updatedUser.id,
    };
  }

  async rejectTopup(
    transactionId: string,
    payload: { note?: string },
    actor?: { actorUserId?: string; actorEmail?: string },
  ) {
    const transaction = await this.prisma.walletTransaction.findUnique({
      where: { id: transactionId },
    });

    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    const rejected = await this.prisma.walletTransaction.update({
      where: { id: transactionId },
      data: {
        status: 'REJECTED',
        reviewedByUserId: actor?.actorUserId,
        note: payload.note,
      },
    });

    await this.auditLogsService.create({
      action: 'WALLET_TOPUP_REJECTED',
      entity: 'WALLET_TRANSACTION',
      entityId: rejected.id,
      actorUserId: actor?.actorUserId,
      actorEmail: actor?.actorEmail,
      metadata: {
        userId: transaction.userId,
        amount: Number(transaction.amount),
      },
    });

    return { success: true, transaction: rejected };
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
      select: { id: true, name: true, email: true, walletBalance: true },
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

    return {
      balance: Number(user.walletBalance || 0),
      transactions: transactions.map((transaction) => ({
        ...transaction,
        amount: Number(transaction.amount || 0),
        referenceNo: transaction.id,
      })),
    };
  }

  private async clearPendingTickets(
    userId: string,
    postTopupBalance: number,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const tickets = await tx.ticket.findMany({
      where: {
        consumerId: userId,
        paymentStatus: { not: 'PAID' },
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true, batchNo: true, totalAmount: true, amountPaid: true },
    });

    let remainingBalance = postTopupBalance;

    for (const ticket of tickets) {
      if (remainingBalance <= 0) break;

      const ticketRemaining =
        Number(ticket.totalAmount) - Number(ticket.amountPaid);
      if (ticketRemaining <= 0) continue;

      const deducted = Math.min(remainingBalance, ticketRemaining);
      const newPaymentStatus =
        deducted >= ticketRemaining ? 'PAID' : 'PARTIALLY_PAID';

      await tx.ticket.update({
        where: { id: ticket.id },
        data: {
          amountPaid: { increment: deducted },
          paymentStatus: newPaymentStatus,
        },
      });

      await tx.walletTransaction.create({
        data: {
          userId,
          ticketId: ticket.id,
          amount: deducted,
          paymentMode: 'BANK_TRANSFER',
          currency: 'PKR',
          status: 'VERIFIED',
          verifiedAt: new Date(),
          note: `Auto-deducted for ticket ${ticket.batchNo}`,
        },
      });

      remainingBalance -= deducted;
    }

    // Write final balance back after all deductions
    await tx.user.update({
      where: { id: userId },
      data: { walletBalance: remainingBalance },
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
}
