import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NOTIFICATION_TYPES } from '@wusuq/shared';

/**
 * Batch-7 9.2 — the recurring nudge the client asked for by name:
 *
 *   "we need a notification again and again, so that the representative also
 *    knows the next date has to be announced. The next date of EVERY pending
 *    case has to be announced."
 *
 * Preceded by 9.1 (the on-screen "Pending · next hearing not set" marker) and
 * 11.5 (the admin can fill it in at Review & Complete). This job is the part
 * that reaches someone who is not looking at the screen.
 *
 * Deliberately conservative:
 *  - Only OPEN work (ASSIGNED / IN_PROGRESS / WAITING_APPROVAL). A completed
 *    ticket must not advertise a hearing — that was batch-4 C.
 *  - Only tickets whose intake recorded a PENDING case status; a decided case
 *    has no next hearing by definition.
 *  - Addressed to the ACTIVE assignee, because they are the one who can
 *    actually record it.
 *  - Best-effort per ticket: one bad row must not stop the sweep.
 */
@Injectable()
export class NextHearingReminderJob {
  private readonly logger = new Logger(NextHearingReminderJob.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async remindMissingNextHearing(): Promise<void> {
    const candidates = await this.prisma.ticket.findMany({
      where: {
        archivedAt: null,
        scheduledDate: null,
        status: { in: ['ASSIGNED', 'IN_PROGRESS', 'WAITING_APPROVAL'] },
        assignments: { some: { status: 'ACTIVE' } },
      },
      select: {
        id: true,
        batchNo: true,
        formPayload: true,
        assignments: {
          where: { status: 'ACTIVE' },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { representativeId: true },
        },
      },
    });

    let sent = 0;
    for (const ticket of candidates) {
      const caseStatus = String(
        ((ticket.formPayload ?? {}) as Record<string, unknown>).case_status ?? '',
      );
      if (!/pending/i.test(caseStatus)) continue;

      const representativeId = ticket.assignments[0]?.representativeId;
      if (!representativeId) continue;

      try {
        await this.notifications.create({
          userId: representativeId,
          title: `Next hearing date needed — ${ticket.batchNo}`,
          body: `${ticket.batchNo} is a pending case with no next hearing date recorded. Please add it so the consumer knows when to expect the next update.`,
          type: NOTIFICATION_TYPES.TICKET_STATUS_CHANGED,
          metadata: { ticketId: ticket.id, batchNo: ticket.batchNo },
        });
        sent += 1;
      } catch (error) {
        this.logger.warn(
          `Next-hearing reminder failed for ${ticket.batchNo}: ${String(error)}`,
        );
      }
    }

    if (sent > 0) {
      this.logger.log(`Sent ${sent} next-hearing reminder(s).`);
    }
  }
}
