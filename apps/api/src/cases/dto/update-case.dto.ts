import { ServiceType } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class UpdateCaseDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsEnum(ServiceType)
  @IsOptional()
  type?: ServiceType;

  @IsString()
  @IsOptional()
  courtLevel?: string;

  @IsString()
  @IsOptional()
  court?: string;

  @IsString()
  @IsOptional()
  courtCity?: string;

  @IsString()
  @IsOptional()
  caseNo?: string;

  @IsInt()
  @Min(1900)
  @IsOptional()
  @Type(() => Number)
  caseYear?: number;

  @IsString()
  @IsOptional()
  caseCategory?: string;

  @IsString()
  @IsOptional()
  courtCaseStatus?: string;

  @IsString()
  @IsOptional()
  judgeDesignation?: string;

  @IsString()
  @IsOptional()
  province?: string;

  @IsString()
  @IsOptional()
  district?: string;

  @IsString()
  @IsOptional()
  policeStation?: string;

  @IsString()
  @IsOptional()
  firNo?: string;

  @IsString()
  @IsOptional()
  offence?: string;

  @IsString()
  @IsOptional()
  docNo?: string;

  @IsString()
  @IsOptional()
  officeCity?: string;

  @IsString()
  @IsOptional()
  petitioner?: string;

  @IsString()
  @IsOptional()
  respondent?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
