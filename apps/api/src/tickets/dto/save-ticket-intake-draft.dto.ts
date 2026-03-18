import { IsInt, IsObject, IsOptional, IsString, Min } from 'class-validator';

export class SaveTicketIntakeDraftDto {
  @IsOptional()
  @IsString()
  draftId?: string;

  @IsString()
  flow!: string;

  @IsString()
  consumerId!: string;

  @IsOptional()
  @IsString()
  serviceId?: string;

  @IsInt()
  @Min(1)
  step!: number;

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}
