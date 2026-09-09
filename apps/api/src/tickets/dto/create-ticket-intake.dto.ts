import {
  IsBoolean,
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

  /**
   * Batch-7 2.2 (owner decision 2026-09-09): apply the consumer's prepaid
   * wallet credit to this ticket. OPT-IN — "ask the user if he wants to use
   * wallet balance or pay separately."
   *
   * Absent/false leaves the credit untouched; the ticket simply stays unpaid
   * until they pay it, and the existing settlement triggers (top-up
   * verification, admin adjustment, remainder finalize) behave as before.
   */
  @IsOptional()
  @IsBoolean()
  useWalletBalance?: boolean;

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

  @IsOptional()
  @IsString()
  promoCode?: string;

  // When set, stamps the lineage pointer Ticket.regeneratedFromTicketId so
  // staff can trace which ticket this regeneration originated from (B2).
  @IsOptional()
  @IsString()
  regeneratedFromTicketId?: string;
}
