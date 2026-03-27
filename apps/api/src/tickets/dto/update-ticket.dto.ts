import { IsOptional, IsString } from 'class-validator';

export class UpdateTicketDto {
  @IsOptional()
  @IsString()
  serviceCity?: string;

  @IsOptional()
  @IsString()
  consumerPhone?: string;

  @IsOptional()
  @IsString()
  consumerAddress?: string;

  @IsOptional()
  @IsString()
  caseType?: string;
}
