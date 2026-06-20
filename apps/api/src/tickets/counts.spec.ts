import { jest } from '@jest/globals';
import { TicketsService } from './tickets.service';

function makeDispatcher() {
  return {
    ticketCreated: jest.fn().mockResolvedValue(undefined),
    ticketStatusChanged: jest.fn().mockResolvedValue(undefined),
    ticketDispatched: jest.fn().mockResolvedValue(undefined),
    paymentRemainderDue: jest.fn().mockResolvedValue(undefined),
  };
}

describe('countsByStatus', () => {
  it('clerk scope: filters by representativeId and archivedAt: null', async () => {
    const groupBy = jest.fn().mockResolvedValue([
      { status: 'ASSIGNED', _count: { _all: 3 } },
    ]);
    const prisma = {
      ticket: { groupBy },
    };
    const service = new TicketsService(
      prisma as never,
      { create: jest.fn().mockResolvedValue({}) } as never,
      { resolve: jest.fn() } as never,
      { resolveProvinceByCity: jest.fn() } as never,
      makeDispatcher() as never,
      { settleTicketsForUser: jest.fn() } as never,
    );

    const result = await service.countsByStatus({ representativeId: 'rep-1' });

    expect(groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          archivedAt: null,
          assignments: { some: { representativeId: 'rep-1' } },
        }),
      }),
    );
    expect(result).toEqual({ ASSIGNED: 3 });
  });

  it('staff scope: only filters by archivedAt: null', async () => {
    const groupBy = jest.fn().mockResolvedValue([
      { status: 'PAID', _count: { _all: 2 } },
      { status: 'UNPAID', _count: { _all: 5 } },
    ]);
    const prisma = {
      ticket: { groupBy },
    };
    const service = new TicketsService(
      prisma as never,
      { create: jest.fn().mockResolvedValue({}) } as never,
      { resolve: jest.fn() } as never,
      { resolveProvinceByCity: jest.fn() } as never,
      makeDispatcher() as never,
      { settleTicketsForUser: jest.fn() } as never,
    );

    const result = await service.countsByStatus({});

    expect(groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { archivedAt: null },
      }),
    );
    expect(result).toEqual({ PAID: 2, UNPAID: 5 });
  });
});
