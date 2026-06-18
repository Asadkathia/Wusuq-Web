import { jest } from '@jest/globals';
import { isBaseCovered } from '@wusuq/shared';
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
    paymentRemainderDue: jest.fn().mockResolvedValue(undefined),
    caseDriftDetected: jest.fn().mockResolvedValue(undefined),
  };
}

// Audit 1.2 clobber site: assign() recomputes totalAmount from the stored
// component columns. With the resolver fix, serviceCost carries the full
// multiplied Case Search amount, so the recompute must preserve the billed
// total instead of collapsing it to the single-city price.
describe('assign() preserves the Case Search multiplied total (audit 1.2)', () => {
  it('a 3-city both-method search keeps totalAmount = 9,000 through assignment', async () => {
    // Post-fix persisted shape: serviceCost === totalAmount === 9,000.
    const ticket = {
      id: 'ticket-1',
      status: 'PAID',
      serviceCity: null,
      serviceCost: 9000,
      deliveryCharges: 0,
      printingCharges: 0,
      attestedCharges: 0,
      nonAttestedCharges: 0,
      additionalCharges: 0,
      additionalServiceCost: 0,
      discountPrice: 0,
      totalAmount: 9000,
      intakeFlow: 'judicial_case_search',
      service: { id: 'svc-1', category: 'judicial' },
    };
    const ticketUpdate = jest.fn().mockResolvedValue({ count: 1 });
    const prisma: Record<string, any> = {
      ticket: {
        findUnique: jest.fn().mockResolvedValue(ticket),
        updateMany: ticketUpdate,
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'rep-1',
          role: 'representative',
          isActive: true,
          city: null,
          courtCity: null,
        }),
      },
      assignment: {
        findFirst: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn().mockResolvedValue({ id: 'asg-1' }),
      },
      ticketStatusHistory: { create: jest.fn().mockResolvedValue({}) },
    };
    prisma.$transaction = jest.fn(async (arg: any) =>
      typeof arg === 'function' ? arg(prisma) : Promise.all(arg),
    );
    const service = new TicketsService(
      prisma as never,
      { create: jest.fn().mockResolvedValue({}) } as never,
      { resolve: jest.fn() } as never,
      { resolveProvinceByCity: jest.fn() } as never,
      makeDispatcher() as never,
      { settleTicketsForUser: jest.fn() } as never,
    );

    await service.assign('ticket-1', { representativeId: 'rep-1' });

    expect(ticketUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ totalAmount: 9000 }),
      }),
    );
  });

  it('the PAID gate requires the full multiplied amount', () => {
    // With serviceCost = full intake-billed amount, a single-city payment can
    // no longer flip a 3-city search to PAID.
    expect(isBaseCovered({ amountPaid: 3000, serviceCost: 9000 })).toBe(false);
    expect(isBaseCovered({ amountPaid: 9000, serviceCost: 9000 })).toBe(true);
  });
});
