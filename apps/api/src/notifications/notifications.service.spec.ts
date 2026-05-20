import { jest } from '@jest/globals';
import { NotificationsService } from './notifications.service';

function build() {
  const prisma = {
    notification: {
      create: jest.fn().mockResolvedValue({
        id: 'n1',
        userId: 'u1',
        title: 'T',
        body: 'B',
        type: 'system',
        createdAt: new Date(),
      }),
    },
    user: { findUnique: jest.fn() },
  };
  const emailService = { send: jest.fn().mockResolvedValue(undefined) };
  const sseService = { push: jest.fn() };
  const service = new NotificationsService(
    prisma as never,
    emailService as never,
    sseService as never,
  );
  return { service, prisma, emailService, sseService };
}

describe('NotificationsService', () => {
  it('writes a DB row and pushes SSE but does NOT email on create()', async () => {
    const { service, prisma, emailService, sseService } = build();

    await service.create({ userId: 'u1', title: 'T', body: 'B' });

    expect(prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'u1',
          title: 'T',
          type: 'system',
        }),
      }),
    );
    expect(sseService.push).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ id: 'n1' }),
    );
    expect(emailService.send).not.toHaveBeenCalled();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('sendEmail() still delegates to EmailService', async () => {
    const { service, emailService } = build();
    await service.sendEmail('a@b.com', 'subj', '<p>x</p>');
    expect(emailService.send).toHaveBeenCalledWith(
      'a@b.com',
      'subj',
      '<p>x</p>',
    );
  });
});
