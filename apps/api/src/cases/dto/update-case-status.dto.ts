import { CaseStatus } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdateCaseStatusDto {
  @IsEnum(CaseStatus)
  @IsNotEmpty()
  status!: CaseStatus;

  @IsString()
  @IsOptional()
  notes?: string;
}
