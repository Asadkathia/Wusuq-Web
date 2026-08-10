/**
 * Batch-5 B: soft-archiving a ticket must take its DERIVED data with it.
 *
 * The client deleted every ticket and still saw the ticket's notifications in
 * the consumer bell ("Service completed / Final payment due" for
 * TKT-85905379-133644). Notification has no ticket FK — the link is
 * metadata.ticketId, written by every dispatcher method — so the archive branch
 * targets them explicitly.
 *
 * Notifications are derived messages, not records of money: deleting them loses
 * nothing that AuditLog / TicketStatusHistory doesn't still hold.
 */
import { jest } from '@jest/globals';
import { TicketsService } from './tickets.service';

function makeService() {
  const notificationDeleteMany = jest.fn().mockResolvedValue({ count: 3 });
  const ticketUpdateMany = jest.fn().mockResolvedValue({ count: 2 });
  const prisma: any = {
    ticket: {
      updateMany: ticketUpdateMany,
      findMany: jest.fn().mockResolvedValue([]),
    },
    notification: { deleteMany: notificationDeleteMany },
  };
  prisma.$transaction = jest.fn(async (arg: any) =>
    typeof arg === 'function' ? arg(prisma) : Promise.all(arg),
  );
  const svc = new TicketsService(
    prisma as never,
    { create: jest.fn().mockResolvedValue(undefined) } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return { svc, notificationDeleteMany, ticketUpdateMany };
}

describe('bulkAction delete — archive cascade', () => {
  it("removes the archived tickets' notifications", async () => {
    const { svc, notificationDeleteMany, ticketUpdateMany } = makeService();

    await svc.bulkAction({
      action: 'delete',
      ticketIds: ['t1', 't2'],
    } as never);

    // The tickets themselves are soft-archived, never hard-deleted.
    expect(ticketUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ archivedAt: expect.any(Date) }),
      }),
    );

    // …and their notifications go with them, matched on metadata.ticketId.
    expect(notificationDeleteMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { metadata: { path: ['ticketId'], equals: 't1' } },
          { metadata: { path: ['ticketId'], equals: 't2' } },
        ],
      },
    });
  });

  it('does not touch notifications on restore', async () => {
    const { svc, notificationDeleteMany } = makeService();

    await svc.bulkAction({ action: 'restore', ticketIds: ['t1'] } as never);

    expect(notificationDeleteMany).not.toHaveBeenCalled();
  });
});
