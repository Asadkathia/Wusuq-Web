import { jest } from '@jest/globals';
import { NotFoundException } from '@nestjs/common';
import { CasesService } from './cases.service';

function makeService(prisma: Record<string, unknown>) {
  return new CasesService(
    prisma as never,
    { create: jest.fn().mockResolvedValue({}) } as never,
    {} as never,
    {
      caseCreated: jest.fn().mockResolvedValue(undefined),
      caseStatusChanged: jest.fn().mockResolvedValue(undefined),
    } as never,
  );
}

function caseRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'case-1',
    consumerId: 'consumer-B',
    status: 'OPEN',
    caseRef: 'CASE-1',
    title: 'Case',
    notes: null,
    closedAt: null,
    deletedAt: null,
    consumer: { id: 'consumer-B', name: 'B', phone: null, email: 'b@x.com' },
    tickets: [],
    events: [],
    documents: [],
    ...overrides,
  };
}

describe('cases by-id ownership scoping (report 3.3b)', () => {
  const callerA = { userId: 'consumer-A', role: 'consumer' as const };

  it('findOne returns 404 for a consumer reading another consumer case', async () => {
    const prisma = {
      case: { findFirst: jest.fn().mockResolvedValue(caseRecord()) },
    };
    const service = makeService(prisma);
    await expect(service.findOne('case-1', callerA)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('findOne returns the case for its owner', async () => {
    const prisma = {
      case: { findFirst: jest.fn().mockResolvedValue(caseRecord()) },
    };
    const service = makeService(prisma);
    await expect(
      service.findOne('case-1', { userId: 'consumer-B', role: 'consumer' }),
    ).resolves.toMatchObject({ id: 'case-1' });
  });

  it('updateCase returns 404 for a lawyer updating another consumer case', async () => {
    const prisma = {
      case: {
        findFirst: jest.fn().mockResolvedValue(caseRecord()),
        update: jest.fn().mockResolvedValue(caseRecord()),
      },
      caseEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    const service = makeService(prisma);
    await expect(
      service.updateCase(
        'case-1',
        { title: 'New' },
        {
          actorUserId: 'consumer-A',
          actorRole: 'lawyer',
        },
      ),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.case.update).not.toHaveBeenCalled();
  });

  it('deleteCase returns 404 for a non-owner consumer-class caller', async () => {
    const prisma = {
      case: {
        findFirst: jest.fn().mockResolvedValue(caseRecord()),
        update: jest.fn().mockResolvedValue(caseRecord()),
      },
    };
    const service = makeService(prisma);
    await expect(
      service.deleteCase('case-1', {
        actorUserId: 'consumer-A',
        actorRole: 'lawyer',
      }),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.case.update).not.toHaveBeenCalled();
  });

  it('getCaseSummary returns 404 for a non-owner consumer', async () => {
    const prisma = {
      case: { findFirst: jest.fn().mockResolvedValue(caseRecord()) },
    };
    const service = makeService(prisma);
    await expect(service.getCaseSummary('case-1', callerA)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('listCaseTickets returns 404 for a non-owner consumer', async () => {
    const prisma = {
      case: { findFirst: jest.fn().mockResolvedValue(caseRecord()) },
      ticket: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = makeService(prisma);
    await expect(service.listCaseTickets('case-1', callerA)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('staff callers are not scoped', async () => {
    const prisma = {
      case: { findFirst: jest.fn().mockResolvedValue(caseRecord()) },
    };
    const service = makeService(prisma);
    await expect(
      service.findOne('case-1', { userId: 'admin-1', role: 'staff-admin' }),
    ).resolves.toMatchObject({ id: 'case-1' });
  });
});
