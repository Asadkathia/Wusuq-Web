import { IsIn } from 'class-validator';
import { TICKET_STATUSES, type TicketStatus } from '@wusuq/shared';

export class StatusOverrideDto {
  @IsIn(TICKET_STATUSES as unknown as string[])
  status!: TicketStatus;
}
