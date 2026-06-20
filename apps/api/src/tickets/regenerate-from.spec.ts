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
    paymentRemainderDue: jest.fn().mockResolvedValue(undefined),
    caseDriftDetected: jest.fn().mockResolvedValue(undefined),
  };
}

// Use POA — the shortest required-field list so validation doesn't block us
// from reaching tx.ticket.create (the focus of this spec).
const POA_PAYLOAD = {
  select_service: 'Lower Court',
  select_court: 'Power of Attorney',
  select_court_city: 'Lahore',
  case_petition_no: '456',
  case_year: '2023',
  case_type: 'Civil',
  case_title: 'X vs Y',
};

// Task B2: createIntakeTicket should stamp regeneratedFromTicketId when supplied.
describe('createIntakeTicket regeneratedFromTicketId stamping (B2)', () => {
  function buildHarness() {
    const created = {
      id: 'tkt-regen-1',
      batchNo: 'TKT-REGEN-1',
      intakeRequestId: null,
    };
    const ticketCreate = jest.fn().mockResolvedValue(created);
    const prisma: Record<string, unknown> = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: 'c-2' }),
      },
      service: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'svc-2', category: 'judicial' }),
      },
      ticket: {
        create: ticketCreate,
        findUnique: jest.fn().mockResolvedValue(created),
      },
      ticketStatusHistory: { create: jest.fn().mockResolvedValue({}) },
      ticketIntakeDraft: {
        delete: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn(async (arg: unknown) =>
        typeof arg === 'function'
          ? (arg as (tx: unknown) => unknown)(prisma)
          : Promise.all(arg as Promise<unknown>[]),
      ),
    };

    // Mock a matched digital result (judicial_case_information is ONE_TIME/digital)
    const pricingService = {
      resolve: jest.fn().mockResolvedValue({
        matched: true,
        available: true,
        rulesExistForFlow: true,
        basePrice: 3000,
        pdfSurcharge: 0,
        deliveryFee: 0,
        titleSurcharge: 0,
        ageSurcharge: 0,
        bundleSurcharge: 0,
        searchBothSurcharge: 0,
        cityCount: 1,
        clerkBaseCost: null,
        attestedCharge: 0,
        nonAttestedCharge: 0,
        deliveryCharge: 0,
        serviceCost: 3000,
        total: 3000,
      }),
    };

    const service = new TicketsService(
      prisma as never,
      { create: jest.fn().mockResolvedValue({}) } as never,
      pricingService as never,
      { resolveProvinceByCity: jest.fn() } as never,
      makeDispatcher() as never,
      { settleTicketsForUser: jest.fn() } as never,
    );

    return { service, prisma, ticketCreate };
  }

  it('stamps regeneratedFromTicketId on the created ticket when supplied', async () => {
    const { service, ticketCreate } = buildHarness();

    await service.createIntakeTicket(
      {
        flow: 'judicial_power_of_attorney',
        consumerId: 'c-2',
        serviceId: 'svc-2',
        payload: POA_PAYLOAD,
        regeneratedFromTicketId: 'src-1',
      } as never,
      { actorUserId: 'c-2', actorEmail: 'c2@x.com' },
    );

    expect(ticketCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ regeneratedFromTicketId: 'src-1' }),
      }),
    );
  });

  it('stores null for regeneratedFromTicketId when not supplied', async () => {
    const { service, ticketCreate } = buildHarness();

    await service.createIntakeTicket(
      {
        flow: 'judicial_power_of_attorney',
        consumerId: 'c-2',
        serviceId: 'svc-2',
        payload: POA_PAYLOAD,
        // no regeneratedFromTicketId
      } as never,
      { actorUserId: 'c-2', actorEmail: 'c2@x.com' },
    );

    const callData = (
      ticketCreate.mock.calls[0] as [{ data: Record<string, unknown> }]
    )[0].data;
    // Must be null (not undefined) when omitted, consistent with
    // other nullable pointer fields (intakeRequestId, caseId, etc.)
    expect(callData.regeneratedFromTicketId).toBeNull();
  });
});
