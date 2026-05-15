import { NotFoundException } from '@nestjs/common';
import { ElectionsService } from './elections.service';

describe('ElectionsService', () => {
  it('rejects candidate update when candidate is not in election', async () => {
    const prisma = {
      election: {
        findUnique: jest.fn().mockResolvedValue({ id: 'election-1' }),
      },
      candidate: {
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
      },
    };
    const auditLogsService = { create: jest.fn() };
    const service = new ElectionsService(
      prisma as never,
      auditLogsService as never,
    );

    await expect(
      service.updateCandidate(
        'election-1',
        'candidate-1',
        { memberName: 'Updated Name' },
        { actorUserId: 'actor-1', actorEmail: 'actor@example.com' },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.candidate.update).not.toHaveBeenCalled();
  });
});
