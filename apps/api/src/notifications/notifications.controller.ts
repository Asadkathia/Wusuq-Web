import {
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtUser } from '../auth/types/jwt-user.type';
import { NotificationsService } from './notifications.service';
import { SseService } from './sse.service';

@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly sseService: SseService,
  ) {}

  @Get('stream')
  stream(@CurrentUser() user: JwtUser, @Res() res: Response) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    this.sseService.addClient(user.sub, res);
  }

  @Get()
  findAll(@CurrentUser() user: JwtUser, @Query('limit') limit?: string) {
    return this.notificationsService.findAll(
      user.sub,
      limit ? Number(limit) : 20,
    );
  }

  @Get('unread-count')
  unreadCount(@CurrentUser() user: JwtUser) {
    return this.notificationsService.unreadCount(user.sub);
  }

  @Patch(':id/read')
  markRead(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.notificationsService.markRead(id, user.sub);
  }

  @Post('mark-all-read')
  markAllRead(@CurrentUser() user: JwtUser) {
    return this.notificationsService.markAllRead(user.sub);
  }
}
