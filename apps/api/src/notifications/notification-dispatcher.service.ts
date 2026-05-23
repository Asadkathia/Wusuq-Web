import { Injectable } from '@nestjs/common';
import { NOTIFICATION_TYPES } from '@wusuq/shared';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from './notifications.service';
import { notificationTemplates as T } from './notification-templates';
import {
  ADMIN_NOTIFY_ROLES,
  FINANCE_NOTIFY_ROLES,
} from './notification-audiences';

@Injectable()
export class NotificationDispatcher {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  // ─── audience helpers ───
  private async adminIds(): Promise<string[]> {
    const rows = await this.prisma.user.findMany({
      where: { role: { in: ADMIN_NOTIFY_ROLES }, isActive: true },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  private async financeIds(): Promise<string[]> {
    const rows = await this.prisma.user.findMany({
      where: { role: { in: FINANCE_NOTIFY_ROLES }, isActive: true },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  private async activeAssigneeId(ticketId: string): Promise<string | null> {
    const a = await this.prisma.assignment.findFirst({
      where: { ticketId, status: { in: ['ACTIVE', 'ACCEPTED'] } },
      orderBy: { createdAt: 'desc' },
      select: { representativeId: true },
    });
    return a?.representativeId ?? null;
  }

  private async assigningAdminId(ticketId: string): Promise<string | null> {
    const log = await this.prisma.auditLog.findFirst({
      where: {
        entity: 'TICKET',
        entityId: ticketId,
        action: 'TICKET_ASSIGNED',
      },
      orderBy: { createdAt: 'desc' },
      select: { actorUserId: true },
    });
    return log?.actorUserId ?? null;
  }

  private async loadTicket(ticketId: string) {
    return this.prisma.ticket.findUnique({
      where: { id: ticketId },
      include: {
        consumer: { select: { id: true, email: true } },
        service: { select: { name: true } },
      },
    });
  }

  private async emailUser(
    userId: string,
    title: string,
    body: string,
  ): Promise<void> {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    if (u?.email) {
      await this.notifications.sendEmail(u.email, title, `<p>${body}</p>`);
    }
  }

  // ─── ticket events ───
  async ticketCreated(ticketId: string): Promise<void> {
    const t = await this.loadTicket(ticketId);
    if (!t) return;
    const consumerCopy = T.ticketCreatedForConsumer(t.batchNo, t.service.name);
    await this.notifications.create({
      userId: t.consumerId,
      ...consumerCopy,
      type: NOTIFICATION_TYPES.TICKET_CREATED,
      metadata: { ticketId: t.id, batchNo: t.batchNo },
    });
    if (t.consumer.email) {
      await this.notifications.sendEmail(
        t.consumer.email,
        consumerCopy.title,
        `<p>${consumerCopy.body}</p>`,
      );
    }
    const adminCopy = T.ticketCreatedForAdmin(t.batchNo, t.service.name);
    for (const id of await this.adminIds()) {
      await this.notifications.create({
        userId: id,
        ...adminCopy,
        type: NOTIFICATION_TYPES.TICKET_CREATED,
        metadata: { ticketId: t.id, batchNo: t.batchNo },
      });
    }
  }

  async ticketStatusChanged(
    ticketId: string,
    from: string,
    to: string,
  ): Promise<void> {
    const t = await this.loadTicket(ticketId);
    if (!t) return;
    const isCompleted = to === 'COMPLETED';
    const consumerCopy = isCompleted
      ? T.ticketCompletedForConsumer(t.batchNo, t.service.name)
      : T.ticketStatusForConsumer(t.batchNo, to);
    await this.notifications.create({
      userId: t.consumerId,
      ...consumerCopy,
      type: isCompleted
        ? NOTIFICATION_TYPES.TICKET_COMPLETED
        : NOTIFICATION_TYPES.TICKET_STATUS_CHANGED,
      metadata: { ticketId: t.id, batchNo: t.batchNo, from, to },
    });
    if (isCompleted && t.consumer.email) {
      await this.notifications.sendEmail(
        t.consumer.email,
        consumerCopy.title,
        `<p>${consumerCopy.body}</p>`,
      );
    }
    const assigneeId = await this.activeAssigneeId(ticketId);
    if (assigneeId && assigneeId !== t.consumerId) {
      const assigneeCopy = T.ticketStatusForAssignee(t.batchNo, to);
      await this.notifications.create({
        userId: assigneeId,
        ...assigneeCopy,
        type: NOTIFICATION_TYPES.TICKET_STATUS_CHANGED,
        metadata: { ticketId: t.id, batchNo: t.batchNo, from, to },
      });
    }
  }

  async ticketAssigned(ticketId: string, assigneeId: string): Promise<void> {
    const t = await this.loadTicket(ticketId);
    if (!t) return;
    const copy = T.ticketAssignedForAssignee(t.batchNo, t.service.name);
    await this.notifications.create({
      userId: assigneeId,
      ...copy,
      type: NOTIFICATION_TYPES.TICKET_ASSIGNED,
      metadata: { ticketId: t.id, batchNo: t.batchNo },
    });
    await this.emailUser(assigneeId, copy.title, copy.body);
  }

  async ticketReassigned(
    ticketId: string,
    prevAssigneeId: string,
    newAssigneeId: string,
  ): Promise<void> {
    const t = await this.loadTicket(ticketId);
    if (!t) return;
    await this.ticketAssigned(ticketId, newAssigneeId);
    if (prevAssigneeId && prevAssigneeId !== newAssigneeId) {
      const copy = T.ticketReassignedForOldAssignee(t.batchNo);
      await this.notifications.create({
        userId: prevAssigneeId,
        ...copy,
        type: NOTIFICATION_TYPES.TICKET_REASSIGNED,
        metadata: { ticketId: t.id, batchNo: t.batchNo },
      });
    }
  }

  async ticketAssignmentAccepted(ticketId: string): Promise<void> {
    const t = await this.loadTicket(ticketId);
    if (!t) return;
    const copy = T.ticketAssignmentAcceptedForAdmin(t.batchNo);
    const adminId = await this.assigningAdminId(ticketId);
    const targets = adminId ? [adminId] : await this.adminIds();
    for (const id of targets) {
      await this.notifications.create({
        userId: id,
        ...copy,
        type: NOTIFICATION_TYPES.TICKET_ASSIGNMENT_ACCEPTED,
        metadata: { ticketId: t.id, batchNo: t.batchNo },
      });
    }
  }

  async ticketAssignmentRejected(
    ticketId: string,
    reason: string,
  ): Promise<void> {
    const t = await this.loadTicket(ticketId);
    if (!t) return;
    const adminId = await this.assigningAdminId(ticketId);
    if (!adminId) return;
    const copy = T.ticketAssignmentRejectedForAdmin(t.batchNo, reason);
    await this.notifications.create({
      userId: adminId,
      ...copy,
      type: NOTIFICATION_TYPES.TICKET_ASSIGNMENT_REJECTED,
      metadata: { ticketId: t.id, batchNo: t.batchNo, reason },
    });
    await this.emailUser(adminId, copy.title, copy.body);
  }

  async ticketClerkCostsSubmitted(ticketId: string): Promise<void> {
    const t = await this.loadTicket(ticketId);
    if (!t) return;
    const copy = T.ticketClerkCostsForBackOffice(t.batchNo);
    const ids = new Set([
      ...(await this.adminIds()),
      ...(await this.financeIds()),
    ]);
    for (const id of ids) {
      await this.notifications.create({
        userId: id,
        ...copy,
        type: NOTIFICATION_TYPES.TICKET_CLERK_COSTS_SUBMITTED,
        metadata: { ticketId: t.id, batchNo: t.batchNo },
      });
    }
  }

  async ticketClerkReceiptSubmitted(ticketId: string): Promise<void> {
    const t = await this.loadTicket(ticketId);
    if (!t) return;
    const copy = T.ticketClerkReceiptSubmittedForBackOffice(t.batchNo);
    const ids = new Set([
      ...(await this.adminIds()),
      ...(await this.financeIds()),
    ]);
    for (const id of ids) {
      await this.notifications.create({
        userId: id,
        ...copy,
        type: NOTIFICATION_TYPES.TICKET_CLERK_RECEIPT_SUBMITTED,
        metadata: { ticketId: t.id, batchNo: t.batchNo },
      });
    }
  }

  async ticketClerkReceiptDecided(
    ticketId: string,
    decision: 'VERIFIED' | 'REJECTED',
  ): Promise<void> {
    const t = await this.loadTicket(ticketId);
    if (!t) return;
    const assigneeId = await this.activeAssigneeId(ticketId);
    if (!assigneeId) return;
    const copy = T.ticketClerkReceiptDecidedForAssignee(t.batchNo, decision);
    await this.notifications.create({
      userId: assigneeId,
      ...copy,
      type:
        decision === 'VERIFIED'
          ? NOTIFICATION_TYPES.TICKET_CLERK_RECEIPT_VERIFIED
          : NOTIFICATION_TYPES.TICKET_CLERK_RECEIPT_REJECTED,
      metadata: { ticketId: t.id, batchNo: t.batchNo },
    });
  }

  async ticketDocumentUploaded(ticketId: string): Promise<void> {
    const t = await this.loadTicket(ticketId);
    if (!t) return;
    const copy = T.ticketDocumentUploadedForConsumer(t.batchNo);
    await this.notifications.create({
      userId: t.consumerId,
      ...copy,
      type: NOTIFICATION_TYPES.TICKET_DOCUMENT_UPLOADED,
      metadata: { ticketId: t.id, batchNo: t.batchNo },
    });
  }

  async ticketRegenerated(ticketId: string): Promise<void> {
    const t = await this.loadTicket(ticketId);
    if (!t) return;
    const copy = T.ticketRegeneratedForConsumer(t.batchNo);
    await this.notifications.create({
      userId: t.consumerId,
      ...copy,
      type: NOTIFICATION_TYPES.TICKET_REGENERATED,
      metadata: { ticketId: t.id, batchNo: t.batchNo },
    });
  }

  // ─── payment / wallet ───
  async paymentCompleted(ticketId: string): Promise<void> {
    const t = await this.loadTicket(ticketId);
    if (!t) return;
    const consumerCopy = T.paymentCompletedForConsumer(t.batchNo);
    await this.notifications.create({
      userId: t.consumerId,
      ...consumerCopy,
      type: NOTIFICATION_TYPES.PAYMENT_COMPLETED,
      metadata: { ticketId: t.id, batchNo: t.batchNo },
    });
    if (t.consumer.email) {
      await this.notifications.sendEmail(
        t.consumer.email,
        consumerCopy.title,
        `<p>${consumerCopy.body}</p>`,
      );
    }
    const financeCopy = T.paymentCompletedForFinance(t.batchNo);
    for (const id of await this.financeIds()) {
      if (id === t.consumerId) continue;
      await this.notifications.create({
        userId: id,
        ...financeCopy,
        type: NOTIFICATION_TYPES.PAYMENT_COMPLETED,
        metadata: { ticketId: t.id, batchNo: t.batchNo },
      });
    }
  }

  private async loadTxn(transactionId: string) {
    return this.prisma.walletTransaction.findUnique({
      where: { id: transactionId },
      include: { user: { select: { id: true, email: true } } },
    });
  }

  async walletTopupCreated(transactionId: string): Promise<void> {
    const tx = await this.loadTxn(transactionId);
    if (!tx) return;
    const amount = Number(tx.amount);
    await this.notifications.create({
      userId: tx.userId,
      ...T.walletTopupCreatedForConsumer(amount),
      type: NOTIFICATION_TYPES.WALLET_TOPUP_CREATED,
      metadata: { transactionId: tx.id },
    });
    const financeCopy = T.walletTopupCreatedForFinance(amount);
    for (const id of await this.financeIds()) {
      if (id === tx.userId) continue;
      await this.notifications.create({
        userId: id,
        ...financeCopy,
        type: NOTIFICATION_TYPES.WALLET_TOPUP_CREATED,
        metadata: { transactionId: tx.id },
      });
    }
  }

  async walletTopupDecided(
    transactionId: string,
    decision: 'VERIFIED' | 'REJECTED',
  ): Promise<void> {
    const tx = await this.loadTxn(transactionId);
    if (!tx) return;
    const copy = T.walletTopupDecidedForConsumer(Number(tx.amount), decision);
    await this.notifications.create({
      userId: tx.userId,
      ...copy,
      type:
        decision === 'VERIFIED'
          ? NOTIFICATION_TYPES.WALLET_TOPUP_VERIFIED
          : NOTIFICATION_TYPES.WALLET_TOPUP_REJECTED,
      metadata: { transactionId: tx.id },
    });
    if (tx.user.email) {
      await this.notifications.sendEmail(
        tx.user.email,
        copy.title,
        `<p>${copy.body}</p>`,
      );
    }
  }

  async walletReceiptUploaded(): Promise<void> {
    const copy = T.walletReceiptUploadedForFinance();
    for (const id of await this.financeIds()) {
      await this.notifications.create({
        userId: id,
        ...copy,
        type: NOTIFICATION_TYPES.WALLET_RECEIPT_UPLOADED,
      });
    }
  }

  private async loadTxnWithTicket(transactionId: string) {
    return this.prisma.walletTransaction.findUnique({
      where: { id: transactionId },
      include: {
        user: { select: { id: true, email: true } },
        ticket: { select: { id: true, batchNo: true } },
      },
    });
  }

  async paymentSubmitted(transactionId: string): Promise<void> {
    const tx = await this.loadTxnWithTicket(transactionId);
    if (!tx) return;
    const batchNo = tx.ticket?.batchNo ?? transactionId;
    const amount = Number(tx.amount);
    const consumerCopy = T.paymentSubmittedForConsumer(batchNo, amount);
    await this.notifications.create({
      userId: tx.userId,
      ...consumerCopy,
      type: NOTIFICATION_TYPES.PAYMENT_SUBMITTED,
      metadata: { transactionId: tx.id, ticketId: tx.ticketId ?? undefined },
    });
    const financeCopy = T.paymentSubmittedForFinance(batchNo, amount);
    const ids = new Set([
      ...(await this.adminIds()),
      ...(await this.financeIds()),
    ]);
    for (const id of ids) {
      if (id === tx.userId) continue;
      await this.notifications.create({
        userId: id,
        ...financeCopy,
        type: NOTIFICATION_TYPES.PAYMENT_SUBMITTED,
        metadata: { transactionId: tx.id, ticketId: tx.ticketId ?? undefined },
      });
    }
  }

  async paymentDecided(
    transactionId: string,
    approved: boolean,
  ): Promise<void> {
    const tx = await this.loadTxnWithTicket(transactionId);
    if (!tx) return;
    const batchNo = tx.ticket?.batchNo ?? transactionId;
    const copy = approved
      ? T.paymentApprovedForConsumer(batchNo)
      : T.paymentRejectedForConsumer(batchNo);
    await this.notifications.create({
      userId: tx.userId,
      ...copy,
      type: approved
        ? NOTIFICATION_TYPES.PAYMENT_APPROVED
        : NOTIFICATION_TYPES.PAYMENT_REJECTED,
      metadata: { transactionId: tx.id, ticketId: tx.ticketId ?? undefined },
    });
    if (tx.user.email) {
      await this.notifications.sendEmail(
        tx.user.email,
        copy.title,
        `<p>${copy.body}</p>`,
      );
    }
  }

  async paymentRemainderDue(ticketId: string): Promise<void> {
    const t = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        batchNo: true,
        consumerId: true,
        totalAmount: true,
        amountPaid: true,
        paymentStatus: true,
      },
    });
    if (!t) return;
    // No-op if the ticket is already fully paid.
    if (t.paymentStatus === 'PAID') return;
    const remainder = Math.max(0, Number(t.totalAmount) - Number(t.amountPaid));
    const copy = T.paymentRemainderDueForConsumer(t.batchNo, remainder);
    await this.notifications.create({
      userId: t.consumerId,
      ...copy,
      type: NOTIFICATION_TYPES.PAYMENT_REMAINDER_DUE,
      metadata: { ticketId: t.id, batchNo: t.batchNo, remainder },
    });
  }

  // ─── case ───
  private async loadCase(caseId: string) {
    return this.prisma.case.findUnique({
      where: { id: caseId },
      select: { id: true, caseRef: true, consumerId: true },
    });
  }

  async caseCreated(caseId: string): Promise<void> {
    const k = await this.loadCase(caseId);
    if (!k) return;
    await this.notifications.create({
      userId: k.consumerId,
      ...T.caseCreatedForConsumer(k.caseRef),
      type: NOTIFICATION_TYPES.CASE_CREATED,
      metadata: { caseId: k.id, caseRef: k.caseRef },
    });
  }

  async caseStatusChanged(
    caseId: string,
    from: string,
    to: string,
  ): Promise<void> {
    const k = await this.loadCase(caseId);
    if (!k) return;
    await this.notifications.create({
      userId: k.consumerId,
      ...T.caseStatusForConsumer(k.caseRef, to),
      type: NOTIFICATION_TYPES.CASE_STATUS_CHANGED,
      metadata: { caseId: k.id, caseRef: k.caseRef, from, to },
    });
  }

  async caseDriftDetected(caseId: string): Promise<void> {
    const k = await this.loadCase(caseId);
    if (!k) return;
    const copy = T.caseDriftForAdmin(k.caseRef);
    for (const id of await this.adminIds()) {
      await this.notifications.create({
        userId: id,
        ...copy,
        type: NOTIFICATION_TYPES.CASE_DRIFT_DETECTED,
        metadata: { caseId: k.id, caseRef: k.caseRef },
      });
    }
  }

  // ─── auth ───
  async authPasswordChanged(userId: string): Promise<void> {
    const copy = T.authPasswordChanged();
    await this.notifications.create({
      userId,
      ...copy,
      type: NOTIFICATION_TYPES.AUTH_PASSWORD_CHANGED,
    });
    await this.emailUser(userId, copy.title, copy.body);
  }

  async authImpersonationStarted(
    targetUserId: string,
    adminEmail: string,
  ): Promise<void> {
    const copy = T.authImpersonationStarted(adminEmail);
    await this.notifications.create({
      userId: targetUserId,
      ...copy,
      type: NOTIFICATION_TYPES.AUTH_IMPERSONATION_STARTED,
    });
    await this.emailUser(targetUserId, copy.title, copy.body);
  }
}
