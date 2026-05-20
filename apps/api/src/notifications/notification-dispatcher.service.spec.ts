import { jest } from '@jest/globals';
import { NOTIFICATION_TYPES } from '@wusuq/shared';
import { NotificationDispatcher } from './notification-dispatcher.service';

function build() {
  const prisma = {
    ticket: { findUnique: jest.fn() },
    user: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    assignment: { findFirst: jest.fn().mockResolvedValue(null) },
    auditLog: { findFirst: jest.fn().mockResolvedValue(null) },
    case: { findUnique: jest.fn() },
    walletTransaction: { findUnique: jest.fn() },
  };
  const notifications = {
    create: jest.fn().mockResolvedValue({}),
    sendEmail: jest.fn().mockResolvedValue(undefined),
  };
  const dispatcher = new NotificationDispatcher(
    prisma as never,
    notifications as never,
  );
  return { dispatcher, prisma, notifications };
}

describe('NotificationDispatcher — tickets', () => {
  it('ticketCreated notifies consumer (in-app + email) and admins (in-app)', async () => {
    const { dispatcher, prisma, notifications } = build();
    prisma.ticket.findUnique.mockResolvedValue({
      id: 't1',
      batchNo: 'TKT-1',
      consumerId: 'c1',
      consumer: { id: 'c1', email: 'c@x.com' },
      service: { name: 'Case Files' },
    });
    prisma.user.findMany.mockResolvedValue([{ id: 'a1' }, { id: 'a2' }]);

    await dispatcher.ticketCreated('t1');

    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'c1',
        type: NOTIFICATION_TYPES.TICKET_CREATED,
      }),
    );
    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'a1' }),
    );
    expect(notifications.sendEmail).toHaveBeenCalledWith(
      'c@x.com',
      expect.any(String),
      expect.any(String),
    );
  });

  it('ticketStatusChanged notifies consumer + active assignee; emails consumer only on COMPLETED', async () => {
    const { dispatcher, prisma, notifications } = build();
    prisma.ticket.findUnique.mockResolvedValue({
      id: 't1',
      batchNo: 'TKT-1',
      consumerId: 'c1',
      consumer: { id: 'c1', email: 'c@x.com' },
      service: { name: 'Case Files' },
    });
    prisma.assignment.findFirst.mockResolvedValue({ representativeId: 'r1' });

    await dispatcher.ticketStatusChanged('t1', 'PENDING', 'IN_PROGRESS');
    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'c1',
        type: NOTIFICATION_TYPES.TICKET_STATUS_CHANGED,
      }),
    );
    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'r1' }),
    );
    expect(notifications.sendEmail).not.toHaveBeenCalled();

    notifications.create.mockClear();
    await dispatcher.ticketStatusChanged('t1', 'WAITING_APPROVAL', 'COMPLETED');
    expect(notifications.sendEmail).toHaveBeenCalledWith(
      'c@x.com',
      expect.any(String),
      expect.any(String),
    );
  });

  it('ticketAssignmentRejected notifies the assigning admin from the audit trail', async () => {
    const { dispatcher, prisma, notifications } = build();
    prisma.ticket.findUnique.mockResolvedValue({ id: 't1', batchNo: 'TKT-1' });
    prisma.auditLog.findFirst.mockResolvedValue({ actorUserId: 'admin-1' });
    prisma.user.findUnique.mockResolvedValue({ email: 'admin@x.com' });

    await dispatcher.ticketAssignmentRejected('t1', 'cannot reach court');

    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'admin-1',
        type: NOTIFICATION_TYPES.TICKET_ASSIGNMENT_REJECTED,
      }),
    );
    expect(notifications.sendEmail).toHaveBeenCalled();
  });
});

describe('NotificationDispatcher — payments/wallet/case/auth', () => {
  it('paymentCompleted notifies consumer (email) + finance', async () => {
    const { dispatcher, prisma, notifications } = build();
    prisma.ticket.findUnique.mockResolvedValue({
      id: 't1',
      batchNo: 'TKT-1',
      consumerId: 'c1',
      consumer: { id: 'c1', email: 'c@x.com' },
      service: { name: 'Case Files' },
    });
    prisma.user.findMany.mockResolvedValue([{ id: 'f1' }]);

    await dispatcher.paymentCompleted('t1');

    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'c1',
        type: NOTIFICATION_TYPES.PAYMENT_COMPLETED,
      }),
    );
    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'f1' }),
    );
    expect(notifications.sendEmail).toHaveBeenCalledWith(
      'c@x.com',
      expect.any(String),
      expect.any(String),
    );
  });

  it('walletTopupDecided VERIFIED notifies owner with email', async () => {
    const { dispatcher, prisma, notifications } = build();
    prisma.walletTransaction.findUnique.mockResolvedValue({
      id: 'w1',
      userId: 'c1',
      amount: 5000,
      user: { id: 'c1', email: 'c@x.com' },
    });

    await dispatcher.walletTopupDecided('w1', 'VERIFIED');

    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'c1',
        type: NOTIFICATION_TYPES.WALLET_TOPUP_VERIFIED,
      }),
    );
    expect(notifications.sendEmail).toHaveBeenCalled();
  });

  it('caseDriftDetected notifies admins', async () => {
    const { dispatcher, prisma, notifications } = build();
    prisma.case.findUnique.mockResolvedValue({
      id: 'k1',
      caseRef: 'CASE-1',
      consumerId: 'c1',
    });
    prisma.user.findMany.mockResolvedValue([{ id: 'a1' }]);

    await dispatcher.caseDriftDetected('k1');

    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'a1',
        type: NOTIFICATION_TYPES.CASE_DRIFT_DETECTED,
      }),
    );
  });

  it('authPasswordChanged notifies the user', async () => {
    const { dispatcher, notifications } = build();
    await dispatcher.authPasswordChanged('u1');
    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u1',
        type: NOTIFICATION_TYPES.AUTH_PASSWORD_CHANGED,
      }),
    );
  });
});
