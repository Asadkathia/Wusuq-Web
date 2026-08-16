/**
 * Batch-5 D: `generateNextHearing` is the SERVER twin of the consumer's
 * "Order Future Tickets" (`buildFutureTicketsPayload` in the web app), reached
 * from the admin per-row "Next Hearing" button. Both must produce the same
 * payload shape from the same input.
 *
 * It used to write `case_date = parent.scheduledDate` and never set
 * `future_date` — i.e. it treated the parent's UPCOMING hearing as the new
 * ticket's PREVIOUS one. That is exactly what the client reported as wrong
 * ("the 12th, the upcoming one, should come here"). Fixing only the consumer
 * path would have left the admin path broken and the two payload shapes
 * silently disagreeing.
 */
import { jest } from '@jest/globals';
import { TicketsService } from './tickets.service';

function makeService(parent: Record<string, unknown>) {
  const create = jest.fn().mockResolvedValue({ id: 'child', batchNo: 'TKT-2' });
  const prisma: any = {
    ticket: {
      findUnique: jest.fn().mockResolvedValue(parent),
      create,
    },
    ticketStatusHistory: { create: jest.fn().mockResolvedValue({}) },
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
  return { svc, create };
}

const PARENT = {
  id: 'parent',
  batchNo: 'TKT-1',
  consumerId: 'c1',
  serviceId: 's1',
  caseId: null,
  serviceCity: 'Lahore',
  caseType: 'Civil',
  intakeFlow: 'judicial_case_files',
  currency: 'PKR',
  serviceCost: 1000,
  totalAmount: 1000,
  formPayload: { city: 'Lahore', case_no: '123', case_date: '2026-01-01' },
  scheduledDate: new Date('2026-08-12T00:00:00.000Z'),
  previousHearingDate: new Date('2026-07-30T00:00:00.000Z'),
};

const payloadOf = (create: jest.Mock) =>
  (
    create.mock.calls[0] as [{ data: { formPayload: Record<string, unknown> } }]
  )[0].data.formPayload;

describe('generateNextHearing — hearing-date semantics', () => {
  it("puts the parent's upcoming hearing in future_date, not case_date", async () => {
    const { svc, create } = makeService(PARENT);

    await svc.generateNextHearing('parent');

    const payload = payloadOf(create);
    expect(payload.future_date).toBe('2026-08-12');
    // The old code wrote the upcoming hearing here. It must not anymore.
    expect(payload.case_date).not.toBe('2026-08-12');
  });

  it("carries the parent's previousHearingDate into case_date", async () => {
    const { svc, create } = makeService(PARENT);

    await svc.generateNextHearing('parent');

    expect(payloadOf(create).case_date).toBe('2026-07-30');
  });

  it('omits case_date entirely when the parent was never rescheduled', async () => {
    // `case_date` is deliberately NOT in FUTURE_COPIED_KEYS, so with no
    // previousHearingDate there is simply nothing truthful to put there —
    // better than the old confidently-wrong value. The consumer fills it in.
    const { svc, create } = makeService({
      ...PARENT,
      previousHearingDate: null,
    });

    await svc.generateNextHearing('parent');

    const payload = payloadOf(create);
    expect(payload.future_date).toBe('2026-08-12');
    expect(payload.case_date).toBeUndefined();
  });

  it('still resets case_status and stamps lineage', async () => {
    const { svc, create } = makeService(PARENT);

    await svc.generateNextHearing('parent');

    const payload = payloadOf(create);
    expect(payload.case_status).toBe('Pending Case');
    expect(payload.parent_ticket_id).toBe('parent');
  });
});
