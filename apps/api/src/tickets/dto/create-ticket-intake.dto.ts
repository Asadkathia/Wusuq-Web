import { IsObject, IsOptional, IsString } from 'class-validator';

export class CreateTicketIntakeDto {
  @IsString()
  flow!: string;

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
}
