import { jest } from '@jest/globals';
import { BadRequestException } from '@nestjs/common';
import { TOUR_AUTO_OFF_ID, TOUR_META } from '@wusuq/shared';
import { ToursService } from './tours.service';

function build() {
  const rows = [{ tourId: 'consumer.wallet', version: 1, status: 'COMPLETED' }];
  const prisma = {
    userTourProgress: {
      findMany: jest.fn(async (_args: unknown) => rows),
      upsert: jest.fn(
        async (args: {
          create: { tourId: string; version: number; status: string };
        }) => ({
          tourId: args.create.tourId,
          version: args.create.version,
          status: args.create.status,
        }),
      ),
      deleteMany: jest.fn(async (_args: unknown) => ({ count: 1 })),
    },
  };
  return { svc: new ToursService(prisma as never), prisma };
}

describe('ToursService', () => {
  it('lists only the caller rows, selecting the public fields', async () => {
    const { svc, prisma } = build();
    await svc.list('user-a');
    expect(prisma.userTourProgress.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-a' },
      select: { tourId: true, version: true, status: true },
    });
  });

  it('upserts on the (userId, tourId) compound key of the caller', async () => {
    const { svc, prisma } = build();
    const v = TOUR_META['consumer.wallet'].version;
    await svc.save('user-a', 'consumer.wallet', {
      version: v,
      status: 'DISMISSED',
    });
    expect(prisma.userTourProgress.upsert).toHaveBeenCalledWith({
      where: { userId_tourId: { userId: 'user-a', tourId: 'consumer.wallet' } },
      create: {
        userId: 'user-a',
        tourId: 'consumer.wallet',
        version: v,
        status: 'DISMISSED',
      },
      update: { version: v, status: 'DISMISSED' },
      select: { tourId: true, version: true, status: true },
    });
  });

  it('accepts the auto-off preference at version 1', async () => {
    const { svc, prisma } = build();
    await svc.save('user-a', TOUR_AUTO_OFF_ID, {
      version: 1,
      status: 'DISMISSED',
    });
    expect(prisma.userTourProgress.upsert).toHaveBeenCalledTimes(1);
  });

  it('rejects an unknown tour id without touching the DB', async () => {
    const { svc, prisma } = build();
    await expect(
      svc.save('user-a', 'consumer.nope', { version: 1, status: 'COMPLETED' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.userTourProgress.upsert).not.toHaveBeenCalled();
  });

  it('rejects a version that is not the current registry version', async () => {
    const { svc, prisma } = build();
    const v = TOUR_META['consumer.wallet'].version;
    await expect(
      svc.save('user-a', 'consumer.wallet', {
        version: v + 1,
        status: 'COMPLETED',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.userTourProgress.upsert).not.toHaveBeenCalled();
  });

  it("removes only the caller's own row", async () => {
    const { svc, prisma } = build();
    await expect(svc.remove('user-a', TOUR_AUTO_OFF_ID)).resolves.toEqual({
      deleted: true,
    });
    expect(prisma.userTourProgress.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-a', tourId: TOUR_AUTO_OFF_ID },
    });
  });

  it('rejects removing an unknown id', async () => {
    const { svc } = build();
    await expect(svc.remove('user-a', 'nope')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
