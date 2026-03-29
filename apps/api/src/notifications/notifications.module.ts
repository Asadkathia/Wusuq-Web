import { Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { SseService } from './sse.service';

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, EmailService, SseService],
  exports: [NotificationsService],
})
export class NotificationsModule {}

