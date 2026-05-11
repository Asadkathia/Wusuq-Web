import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class FilesAvailableDto {
  @IsOptional()
  @IsBoolean()
  attested?: boolean;

  @IsOptional()
  @IsBoolean()
  nonAttested?: boolean;

  @IsOptional()
  @IsBoolean()
  both?: boolean;
}

export class SubmitClerkCostsDto {
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0)
  deliveryCharges?: number;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0)
  printingCharges?: number;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0)
  attestedCharges?: number;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0)
  nonAttestedCharges?: number;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0)
  additionalCharges?: number;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0)
  noOfPages?: number;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0)
  costPerPage?: number;

  @IsOptional()
  @IsString()
  rejectionReason?: string;

  // ── Clerk file-availability report (PDF "Clerk Side") ─────────────────────
  // The clerk reports which document sets the court can actually produce
  // (attested, non-attested, or both), the per-page rates that apply, and
  // any partial-completion / unavailability notes. The pricing engine prefers
  // these clerk-reported rates over the global PricingSettings defaults when
  // computing the consumer-facing total.

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => FilesAvailableDto)
  filesAvailable?: FilesAvailableDto;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0)
  perPageRateAttested?: number;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0)
  perPageRateNonAttested?: number;

  @IsOptional()
  @IsString()
  unavailableReason?: string;

  @IsOptional()
  @IsBoolean()
  partialCompletion?: boolean;
}
