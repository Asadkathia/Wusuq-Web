import {
  IsDateString,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateTicketIntakeDto {
  @IsString()
  flow!: string;

  // Client-supplied idempotency key (one UUID per submit attempt). Stored on
  // the unique Ticket.intakeRequestId column; a replay (double-click, network
  // retry) returns the already-created ticket instead of duplicating it.
  @IsOptional()
  @IsString()
  @MaxLength(64)
  requestId?: string;

  @IsString()
  consumerId!: string;

  @IsString()
  serviceId!: string;

  @IsOptional()
  @IsString()
  serviceCity?: string;

  @IsOptional()
  @IsString()
  caseType?: string;

  @IsOptional()
  @IsString()
  province?: string;

  @IsOptional()
  @IsString()
  audience?: string;

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;

  // Optional case linkage. When provided, the ticket is attached to the
  // case in the same prisma.ticket.create call (atomic, single audit entry).
  @IsOptional()
  @IsString()
  caseId?: string;

  // Optional scheduling/outcome fields. Replace the deleted Hearing model:
  // a ticket that involves a court appearance carries its scheduling here.
  @IsOptional()
  @IsDateString()
  scheduledDate?: string;

  @IsOptional()
  @IsString()
  hearingType?: string;
}
