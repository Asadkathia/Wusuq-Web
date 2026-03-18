import { IsArray, IsIn, IsString } from 'class-validator';

const ACTIONS = [
  'complete',
  'immature',
  'delete',
  'assign',
  'download-invoice',
  'send-invoice',
] as const;

export class BulkTicketActionDto {
  @IsIn(ACTIONS)
  action!: (typeof ACTIONS)[number];

  @IsArray()
  @IsString({ each: true })
  ticketIds!: string[];
}
