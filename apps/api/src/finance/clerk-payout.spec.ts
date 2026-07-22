import { jest } from '@jest/globals';
import { computeClerkEarnings } from '@wusuq/shared';
import { FinanceService } from './finance.service';

// Task 6: unify finance's clerkPayout with the shared, capped definition.
// The two pre-existing definitions disagreed: finance hand-rolled a
// six-term sum that (a) counted additionalCharges toward clerk pay and
// (b) never added the PDF clerk fee. Per owner decision, both surfaces
// now agree on computeClerkEarnings.

function build(ticket: Record<string, unknown>) {
  const prisma = {
    ticket: {
      findMany: jest.fn(async () => [ticket]),
      count: jest.fn(async () => 1),
      findUnique: jest.fn(async () => ticket),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        ...ticket,
        ...data,
      })),
    },
    $transaction: jest.fn(async (ops: unknown) =>
      Array.isArray(ops) ? Promise.all(ops) : (ops as CallableFunction)(),
    ),
  };
  const auditLogsService = { create: jest.fn() };
  return {
    service: new FinanceService(prisma as never, auditLogsService as never),
    prisma,
  };
}

const BASE_TICKET = {
  id: 't1',
  status: 'COMPLETED',
  consumer: { id: 'c1', name: 'Consumer' },
  service: { id: 's1', name: 'Service', category: 'x', type: 'y' },
  batchNo: 'B1',
  serviceCity: 'Lahore',
  caseType: 'Civil',
  serviceCost: 1000,
  deliveryCharges: 0,
  printingCharges: 0,
  attestedCharges: 0,
  nonAttestedCharges: 0,
  additionalCharges: 0,
  additionalServiceCost: 0,
  discountPrice: 0,
  promoDiscount: 0,
  taxRate: 0,
  taxAmount: 0,
  totalAmount: 1000,
  amountPaid: 1000,
  clerkCost: 0,
  formPayload: null,
  clerkAttestedCharges: null,
  clerkNonAttestedCharges: null,
  clerkPrintingCharges: null,
  clerkDeliveryCharges: null,
};

describe('finance clerkPayout uses the shared capped earnings', () => {
  it('the shared fn caps an admin markup at what the clerk submitted', () => {
    const ticket = {
      clerkCost: 400,
      attestedCharges: 0,
      nonAttestedCharges: 500, // admin marked up
      clerkNonAttestedCharges: 250, // clerk actually submitted
      printingCharges: 0,
      deliveryCharges: 200,
      clerkDeliveryCharges: 200,
      additionalCharges: 999, // excluded from clerk pay by definition
    };
    expect(computeClerkEarnings(ticket)).toBe(850);
  });

  it('findAll: caps a marked-up non-attested charge and drops additionalCharges', async () => {
    const { service } = build({
      ...BASE_TICKET,
      clerkCost: 400,
      nonAttestedCharges: 500,
      clerkNonAttestedCharges: 250,
      deliveryCharges: 200,
      clerkDeliveryCharges: 200,
      additionalCharges: 999,
    });

    const result = await service.findAll({ page: 1, limit: 10 } as never);

    // 400 (clerkCost) + 250 (capped non-attested) + 200 (delivery) = 850.
    // The old hand-rolled sum produced 2099 for this fixture — it summed the
    // admin-overwritten 500 non-attested instead of the clerk's 250, and added
    // the 999 additionalCharges. This assertion fails against that formula.
    expect(result.items[0].clerkPayout).toBe(850);
  });

  it('findAll: adds the PDF clerk fee when the ticket purchased a PDF', async () => {
    const { service } = build({
      ...BASE_TICKET,
      clerkCost: 400,
      formPayload: { want_pdf_before_dispatch: 'Yes' },
    });

    const result = await service.findAll({ page: 1, limit: 10 } as never);

    // 400 (clerkCost) + 100 (PDF clerk fee) = 500. The old hand-rolled sum
    // never added a PDF fee — this assertion fails against that formula.
    expect(result.items[0].clerkPayout).toBe(500);
  });

  it('findAll: omits the PDF clerk fee when no PDF was purchased', async () => {
    const { service } = build({
      ...BASE_TICKET,
      clerkCost: 400,
      formPayload: { want_pdf_before_dispatch: 'No' },
    });

    const result = await service.findAll({ page: 1, limit: 10 } as never);

    expect(result.items[0].clerkPayout).toBe(400);
  });

  it('findAll: falls back to the final columns when no clerk submission was recorded (null clerk* columns)', async () => {
    const { service } = build({
      ...BASE_TICKET,
      clerkCost: 400,
      attestedCharges: 300,
      nonAttestedCharges: 200,
      printingCharges: 150,
      deliveryCharges: 100,
      // clerk* snapshot columns all null → fall back to final columns.
      clerkAttestedCharges: null,
      clerkNonAttestedCharges: null,
      clerkPrintingCharges: null,
      clerkDeliveryCharges: null,
    });

    const result = await service.findAll({ page: 1, limit: 10 } as never);

    expect(result.items[0].clerkPayout).toBe(400 + 300 + 200 + 150 + 100);
  });

  it('updateCharge: matches the shared capped definition and excludes additionalCharges', async () => {
    const { service } = build({
      ...BASE_TICKET,
      clerkCost: 400,
      nonAttestedCharges: 500,
      clerkNonAttestedCharges: 250,
      deliveryCharges: 200,
      clerkDeliveryCharges: 200,
      additionalCharges: 999,
      amountPaid: 0,
    });

    const result = await service.updateCharge('t1', {} as never);

    // Old hand-rolled sum: 400 + 200(delivery) + 0(printing) + 999(additional)
    // + 0(attested) + 500(non-attested, uncapped) = 2099. Shared/capped: 850.
    expect(result.clerkPayout).toBe(850);
  });

  it('updateCharge: adds the PDF clerk fee when the ticket purchased a PDF', async () => {
    const { service } = build({
      ...BASE_TICKET,
      clerkCost: 400,
      formPayload: { want_pdf_before_dispatch: 'Yes' },
      amountPaid: 0,
    });

    const result = await service.updateCharge('t1', {} as never);

    expect(result.clerkPayout).toBe(500);
  });
});
