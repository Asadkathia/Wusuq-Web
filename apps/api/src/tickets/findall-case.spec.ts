import { jest } from '@jest/globals';
import { TicketsService } from './tickets.service';

function makeService(rows: any[]) {
  const prisma: any = {
    ticket: {
      findMany: jest.fn().mockResolvedValue(rows),
      count: jest.fn().mockResolvedValue(rows.length),
    },
  };
  prisma.$transaction = jest.fn(async (arg: any) =>
    typeof arg === 'function' ? arg(prisma) : Promise.all(arg),
  );
  return new TicketsService(
    prisma as never,
    {} as never, // auditLogsService
    {} as never, // pricingService
    {} as never, // geoService
    {} as never, // dispatcher
    {} as never, // walletService
  );
}

const BASE_TICKET = {
  id: 't1',
  batchNo: 'TKT-1',
  consumer: { id: 'c1', name: 'Alice' },
  service: { id: 's1', name: 'Case Files', category: 'judicial', type: 'case_files' },
  serviceCity: 'Karachi',
  caseType: 'Civil',
  intakeFlow: 'judicial_case_files',
  formPayload: null,
  status: 'PAID',
  clerkApprovalStatus: 'PENDING',
  clerkReceiptUrl: null,
  serviceCost: 1000,
  totalAmount: 1000,
  amountPaid: 0,
  createdBy: null,
  remainderFinalizedAt: null,
  scheduledDate: null,
  nextDate: null,
  hearingType: null,
  deliveryStatus: null,
  trackingNo: null,
  clerkCost: null,
  defaultClerkCost: null,
  dispatchProofUrl: null,
  deliveryCharges: null,
  printingCharges: null,
  attestedCharges: null,
  nonAttestedCharges: null,
  additionalCharges: null,
  createdAt: new Date(),
};

describe('findAll – case relation and assignmentStatus', () => {
  it('exposes case (caseNo/court/caseYear) and assignmentStatus when both are present', async () => {
    const rows = [
      {
        ...BASE_TICKET,
        case: { caseNo: 'C-1', court: 'X Court', caseYear: 2020 },
        assignments: [
          { status: 'ACCEPTED', representative: { id: 'r1', name: 'Bob' } },
        ],
      },
    ];
    const svc = makeService(rows);
    const result = await svc.findAll({ page: 1, limit: 10 });
    const row = result.items[0] as any;
    expect(row.case).toEqual({ caseNo: 'C-1', court: 'X Court', caseYear: 2020 });
    expect(row.assignmentStatus).toBe('ACCEPTED');
    expect(row.assignedRepresentative).toEqual({ id: 'r1', name: 'Bob' });
  });

  it('maps case:null and assignmentStatus:null when no case and no assignment', async () => {
    const rows = [
      {
        ...BASE_TICKET,
        case: null,
        assignments: [],
      },
    ];
    const svc = makeService(rows);
    const result = await svc.findAll({ page: 1, limit: 10 });
    const row = result.items[0] as any;
    expect(row.case).toBeNull();
    expect(row.assignmentStatus).toBeNull();
  });
});
