/**
 * Batch-4 D: recordNextHearing must roll the OUTGOING scheduledDate into
 * previousHearingDate before overwriting it.
 *
 * Before this, rescheduling destroyed the prior hearing outright — the client's
 * "the previous date got erased" — leaving the case card with only a Next row
 * and no way back to the date the hearing had actually moved from.
 */
import { jest } from '@jest/globals';
import { TicketsService } from './tickets.service';

function makeService(existingScheduled: Date | null) {
  const update = jest
    .fn()
    .mockImplementation(({ data }: any) => ({ id: 't1', ...data }));
  const prisma: any = {
    ticket: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ id: 't1', scheduledDate: existingScheduled }),
      findFirst: jest.fn().mockResolvedValue({ id: 't1' }),
      update,
    },
  };
  const svc = new TicketsService(
    prisma as never,
    { create: jest.fn() } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  // Bypass the existence + clerk-assignment guards; this spec is about the
  // date roll-forward, which those guards gate but don't influence.
  (svc as any).ensureTicketExists = jest.fn().mockResolvedValue(undefined);
  (svc as any).ensureClerkActionAllowed = jest
    .fn()
    .mockResolvedValue(undefined);
  return { svc, update };
}

const dataOf = (update: jest.Mock) =>
  (update.mock.calls[0] as [{ data: any }])[0].data;

describe('recordNextHearing — previousHearingDate roll-forward', () => {
  it('moves the outgoing scheduledDate into previousHearingDate', async () => {
    const { svc, update } = makeService(new Date('2026-07-18T00:00:00.000Z'));

    await svc.recordNextHearing('t1', {
      scheduledDate: '2026-07-30T00:00:00.000Z',
    });

    const data = dataOf(update);
    expect(data.scheduledDate).toEqual(new Date('2026-07-30T00:00:00.000Z'));
    // The date the hearing moved AWAY from must survive.
    expect(data.previousHearingDate).toEqual(
      new Date('2026-07-18T00:00:00.000Z'),
    );
  });

  it('does not set previousHearingDate on the first ever scheduling', async () => {
    const { svc, update } = makeService(null);

    await svc.recordNextHearing('t1', {
      scheduledDate: '2026-07-30T00:00:00.000Z',
    });

    // Nothing to roll forward — leave the column alone so the case card keeps
    // falling back to the intake-time payload.case_date.
    expect(dataOf(update)).not.toHaveProperty('previousHearingDate');
  });

  it('does not overwrite a real previous when the date is re-submitted unchanged', async () => {
    const same = '2026-07-30T00:00:00.000Z';
    const { svc, update } = makeService(new Date(same));

    await svc.recordNextHearing('t1', { scheduledDate: same });

    // A same-date re-submit (or a hearingType-only edit) must not clobber the
    // previous hearing with the current one.
    expect(dataOf(update)).not.toHaveProperty('previousHearingDate');
  });

  it('still rolls forward when only the hearingType also changes', async () => {
    const { svc, update } = makeService(new Date('2026-07-18T00:00:00.000Z'));

    await svc.recordNextHearing('t1', {
      scheduledDate: '2026-07-31T00:00:00.000Z',
      hearingType: 'Arguments',
    });

    const data = dataOf(update);
    expect(data.previousHearingDate).toEqual(
      new Date('2026-07-18T00:00:00.000Z'),
    );
    expect(data.hearingType).toBe('Arguments');
  });
});
