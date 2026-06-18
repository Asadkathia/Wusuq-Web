import { IsOptional, IsString } from 'class-validator';

export class UpdateTicketDto {
  @IsOptional()
  @IsString()
  serviceCity?: string;

  // Audit 4.4: consumerPhone / consumerAddress removed — Ticket has no such
  // columns, so any request supplying them blew up the spread into
  // prisma.ticket.update with a PrismaClientValidationError.

  @IsOptional()
  @IsString()
  caseType?: string;
}
