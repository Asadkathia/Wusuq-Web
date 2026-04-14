import { IsIn, IsOptional, IsString } from 'class-validator';
import { TICKET_STATUSES } from '@wusuq/shared';

export class UpdateTicketStatusDto {
  @IsIn(TICKET_STATUSES)
  status!: (typeof TICKET_STATUSES)[number];

  @IsOptional()
  @IsString()
  note?: string;
}
