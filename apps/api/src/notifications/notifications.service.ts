import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from './email.service';
import { SseService } from './sse.service';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly sseService: SseService,
  ) {}

  async create(data: {
    userId: string;
    title: string;
    body?: string;
    type?: string;
    metadata?: Record<string, unknown>;
  }) {
    const notification = await this.prisma.notification.create({
      data: {
        userId: data.userId,
        title: data.title,
        body: data.body,
        type: data.type ?? 'system',
        metadata: (data.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });

    // Push real-time SSE event to connected clients
    this.sseService.push(data.userId, {
      id: notification.id,
      title: notification.title,
      body: notification.body,
      type: notification.type,
      createdAt: notification.createdAt,
    });

    const user = await this.prisma.user.findUnique({
      where: { id: data.userId },
      select: { email: true },
    });
    if (user?.email) {
      await this.emailService.send(
        user.email,
        data.title,
        `<p>${data.body ?? data.title}</p>`,
      );
    }

    return notification;
  }

  async sendEmail(to: string, subject: string, html: string) {
    await this.emailService.send(to, subject, html);
  }

  async findAll(userId: string, limit = 20) {
    const notifications = await this.prisma.notification.findMany({
      where: { userId },
      orderBy: [{ isRead: 'asc' }, { createdAt: 'desc' }],
      take: limit,
    });
    return { items: notifications, total: notifications.length };
  }

  async unreadCount(userId: string) {
    const count = await this.prisma.notification.count({
      where: { userId, isRead: false },
    });
    return { count };
  }

  async markRead(id: string) {
    return this.prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
    return { success: true };
  }
}
