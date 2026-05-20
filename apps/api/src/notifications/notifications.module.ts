import { Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationDispatcher } from './notification-dispatcher.service';
import { SseService } from './sse.service';

@Module({
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    EmailService,
    SseService,
    NotificationDispatcher,
  ],
  exports: [NotificationsService, NotificationDispatcher],
})
export class NotificationsModule {}
