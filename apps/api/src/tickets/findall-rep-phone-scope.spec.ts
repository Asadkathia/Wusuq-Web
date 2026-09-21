/**
 * Batch-9 final review finding 5: `findAll` scopes which TICKETS a
 * representative can list via `assignments: { some: { representativeId } }`
 * — any assignment, active or not (pre-existing, unchanged here). But the
 * consumer's phone (owner-approved carve-out, batch-9 §6.1) was approved for
 * the ASSIGNED representative specifically, and a REJECTED/SUPERSEDED
 * assignment is not that. Before this fix `findAll` projected
 * `consumer: ticket.consumer` unconditionally, so a rep whose assignment had
 * been rejected — or superseded by a reassignment to someone else — still
 * received the consumer's phone number on every list page.
 */
import { jest } from '@jest/globals';
import { TicketsService } from './tickets.service';

function makeService(rows: any[], activeAssignmentRows: any[] = []) {
  const prisma: any = {
    ticket: {
      findMany: jest.fn().mockResolvedValue(rows),
      count: jest.fn().mockResolvedValue(rows.length),
    },
    assignment: {
      findMany: jest.fn().mockResolvedValue(activeAssignmentRows),
    },
  };
  prisma.$transaction = jest.fn(async (arg: any) =>
    typeof arg === 'function' ? arg(prisma) : Promise.all(arg),
  );
  return {
    service: new TicketsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    ),
    prisma,
  };
}

const BASE_TICKET = {
  id: 't1',
  batchNo: 'TKT-1',
  consumer: { id: 'c1', name: 'Consumer One', phone: '+923001234567' },
  service: {
    id: 's1',
    name: 'Case Files',
    category: 'judicial',
    type: 'case_files',
  },
  serviceCity: 'Lahore',
  caseType: 'Civil',
  intakeFlow: 'judicial_case_files',
  formPayload: null,
  status: 'ASSIGNED',
  clerkApprovalStatus: null,
  clerkReceiptUrl: null,
  serviceCost: 500,
  totalAmount: 700,
  amountPaid: 0,
  currency: 'PKR',
  fxRateToPkr: null,
  createdBy: null,
  remainderFinalizedAt: null,
  scheduledDate: null,
  nextDate: null,
  hearingType: null,
  deliveryStatus: null,
  trackingNo: null,
  clerkCost: 400,
  defaultClerkCost: null,
  dispatchProofUrl: null,
  deliveryCharges: 0,
  printingCharges: 0,
  attestedCharges: 0,
  nonAttestedCharges: 0,
  additionalCharges: 0,
  clerkAttestedCharges: null,
  clerkNonAttestedCharges: null,
  clerkPrintingCharges: null,
  clerkDeliveryCharges: null,
  assignments: [],
  history: [],
  case: null,
  invoiceItem: null,
  documents: [],
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('findAll — representative phone scoped to an ACTIVE/ACCEPTED assignment', () => {
  it('keeps the phone when the caller currently holds an ACTIVE/ACCEPTED assignment on this ticket', async () => {
    const { service } = makeService([BASE_TICKET], [{ ticketId: 't1' }]);
    const result = await service.findAll(
      { page: 1, limit: 20, representativeId: 'rep-A' } as never,
      { forConsumer: true, forRepresentative: true },
    );
    expect((result.items[0].consumer as any).phone).toBe('+923001234567');
  });

  it('strips the phone (keeping only id/name) when the caller has NO active assignment on this ticket', async () => {
    // The rep matched the WHERE clause (they have SOME assignment — e.g. a
    // REJECTED one) but assignment.findMany (status-filtered) returns
    // nothing for this ticket, so no ACTIVE/ACCEPTED assignment exists.
    const { service, prisma } = makeService([BASE_TICKET], []);
    const result = await service.findAll(
      { page: 1, limit: 20, representativeId: 'rep-A' } as never,
      { forConsumer: true, forRepresentative: true },
    );
    const consumer = result.items[0].consumer as Record<string, unknown>;
    expect(consumer).not.toHaveProperty('phone');
    expect(consumer).toEqual({ id: 'c1', name: 'Consumer One' });
    // And the status-filtered lookup was actually used to decide this.
    expect(prisma.assignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          representativeId: 'rep-A',
          status: { in: ['ACTIVE', 'ACCEPTED'] },
        }),
      }),
    );
  });

  it('a staff caller (not forRepresentative) always keeps the phone, no active-assignment lookup needed', async () => {
    const { service, prisma } = makeService([BASE_TICKET]);
    const result = await service.findAll({ page: 1, limit: 20 } as never, {
      forConsumer: false,
      forRepresentative: false,
    });
    expect((result.items[0].consumer as any).phone).toBe('+923001234567');
    expect(prisma.assignment.findMany).not.toHaveBeenCalled();
  });
});
