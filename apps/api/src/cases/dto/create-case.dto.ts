import { ServiceType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateCaseDto {
  @IsString()
  @IsNotEmpty()
  consumerId!: string;

  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsEnum(ServiceType)
  @IsIn(['JUDICIAL', 'NON_JUDICIAL'])
  @IsNotEmpty()
  type!: ServiceType;

  // Judicial context
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

  // Non-judicial context
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

  // Parties
  @IsString()
  @IsOptional()
  petitioner?: string;

  @IsString()
  @IsOptional()
  respondent?: string;

  // Meta
  @IsString()
  @IsOptional()
  notes?: string;
}
