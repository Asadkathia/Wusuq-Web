import { jest } from '@jest/globals';
import { TicketsService } from './tickets.service';

function makeDispatcher() {
  return {
    ticketCreated: jest.fn().mockResolvedValue(undefined),
    ticketStatusChanged: jest.fn().mockResolvedValue(undefined),
    ticketAssigned: jest.fn().mockResolvedValue(undefined),
    ticketReassigned: jest.fn().mockResolvedValue(undefined),
    ticketAssignmentAccepted: jest.fn().mockResolvedValue(undefined),
    ticketAssignmentRejected: jest.fn().mockResolvedValue(undefined),
    ticketClerkCostsSubmitted: jest.fn().mockResolvedValue(undefined),
    ticketClerkReceiptSubmitted: jest.fn().mockResolvedValue(undefined),
    ticketClerkReceiptDecided: jest.fn().mockResolvedValue(undefined),
    ticketDocumentUploaded: jest.fn().mockResolvedValue(undefined),
    ticketRegenerated: jest.fn().mockResolvedValue(undefined),
    ticketDispatched: jest.fn().mockResolvedValue(undefined),
    paymentRemainderDue: jest.fn().mockResolvedValue(undefined),
    caseDriftDetected: jest.fn().mockResolvedValue(undefined),
  };
}

function makeService(prisma: Record<string, unknown>) {
  const auditLogsService = { create: jest.fn().mockResolvedValue({}) };
  return new TicketsService(
    prisma as never,
    auditLogsService as never,
    { resolve: jest.fn() } as never,
    { resolveProvinceByCity: jest.fn() } as never,
    makeDispatcher() as never,
    { settleTicketsForUser: jest.fn().mockResolvedValue(undefined) } as never,
  );
}

const reps = [
  {
    id: 'r1',
    name: 'High Court Rep',
    city: 'Islamabad',
    courtCity: 'Islamabad',
    courtLevel: 'high',
  },
  {
    id: 'r2',
    name: 'Lower Court Rep',
    city: 'Islamabad',
    courtCity: 'Islamabad',
    courtLevel: 'lower',
  },
  {
    id: 'r3',
    name: 'Unset Tier Rep',
    city: 'Islamabad',
    courtCity: 'Islamabad',
    courtLevel: null,
  },
  {
    id: 'r4',
    name: 'High Court Rep — Lahore',
    city: 'Lahore',
    courtCity: 'Lahore',
    courtLevel: 'high',
  },
];

function repPrisma(overrides: Record<string, unknown> = {}) {
  return {
    user: { findMany: jest.fn().mockResolvedValue(reps) },
    ticket: { findUnique: jest.fn() },
    ...overrides,
  };
}

describe('Task 5 (C3) — representativeCandidates tier scoping', () => {
  it('tags matching-tier reps true and others false when a tier is given', async () => {
    const service = makeService(repPrisma());
    const res = (await service.representativeCandidates({
      city: 'Islamabad',
      tier: 'high',
    })) as Array<{ id: string; tierMatch?: boolean }>;

    // City-scoping still applies — only Islamabad reps (r1, r2, r3), never r4.
    expect(res.map((r) => r.id).sort()).toEqual(['r1', 'r2', 'r3']);

    const byId = Object.fromEntries(res.map((r) => [r.id, r.tierMatch]));
    expect(byId.r1).toBe(true); // courtLevel === 'high'
    expect(byId.r2).toBe(false); // courtLevel === 'lower'
    expect(byId.r3).toBe(false); // courtLevel null
  });

  it('city-scoping still filters out non-serving reps when a tier is given', async () => {
    const service = makeService(repPrisma());
    const res = (await service.representativeCandidates({
      city: 'Lahore',
      tier: 'high',
    })) as Array<{ id: string; tierMatch?: boolean }>;
    expect(res.map((r) => r.id)).toEqual(['r4']);
    expect(res[0].tierMatch).toBe(true);
  });

  it('back-compat: no tier supplied → candidates carry no tierMatch field', async () => {
    const service = makeService(repPrisma());
    const res = (await service.representativeCandidates({
      city: 'Islamabad',
    })) as Array<Record<string, unknown>>;
    expect(res.map((r) => r.id).sort()).toEqual(['r1', 'r2', 'r3']);
    for (const rep of res) {
      expect(rep).not.toHaveProperty('tierMatch');
    }
  });

  it('back-compat: no city and no tier → returns the full active pool untagged', async () => {
    const service = makeService(repPrisma());
    const res = (await service.representativeCandidates({})) as Array<
      Record<string, unknown>
    >;
    expect(res.map((r) => r.id).sort()).toEqual(['r1', 'r2', 'r3', 'r4']);
    for (const rep of res) {
      expect(rep).not.toHaveProperty('tierMatch');
    }
  });
});

describe('Task 5 (C3) — deriveTicketTier', () => {
  it('derives the High Court tier from the ticket formPayload', async () => {
    const prisma = {
      ticket: {
        findUnique: jest.fn().mockResolvedValue({
          formPayload: { select_court_type: 'High Court' },
        }),
      },
    };
    const service = makeService(prisma);
    await expect(service.deriveTicketTier('ticket-1')).resolves.toBe('high');
  });

  it('returns null when the ticket does not exist', async () => {
    const prisma = {
      ticket: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const service = makeService(prisma);
    await expect(service.deriveTicketTier('missing')).resolves.toBeNull();
  });

  it('returns null when the payload has no derivable court type', async () => {
    const prisma = {
      ticket: {
        findUnique: jest.fn().mockResolvedValue({ formPayload: {} }),
      },
    };
    const service = makeService(prisma);
    await expect(service.deriveTicketTier('ticket-2')).resolves.toBeNull();
  });
});
