import { IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';

export class CreateCaseTicketDto {
  @IsString()
  @IsNotEmpty()
  serviceId!: string;

  @IsString()
  @IsOptional()
  flow?: string;

  @IsObject()
  @IsOptional()
  overrides?: Record<string, unknown>;
}
