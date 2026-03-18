import { IsNumber, IsOptional, IsString } from 'class-validator';

export class AssignTicketDto {
  @IsString()
  representativeId!: string;

  @IsOptional()
  @IsNumber()
  clerkCost?: number;
}
