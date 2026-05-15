import {
  IsString,
  IsOptional,
  IsInt,
  IsBoolean,
  IsNumber,
  Min,
} from 'class-validator';

export class CreatePricingRuleDto {
  @IsString() name!: string;
  @IsString() flow!: string;
  @IsOptional() @IsString() courtLevel?: string;
  @IsOptional() @IsString() caseStatus?: string;
  @IsOptional() @IsInt() @Min(1900) yearFrom?: number;
  @IsOptional() @IsInt() @Min(1900) yearTo?: number;
  @IsOptional() @IsString() setType?: string;
  @IsOptional() @IsString() region?: string;
  @IsOptional() @IsBoolean() isLegacy?: boolean;
  @IsNumber() @Min(0) basePrice!: number;
  @IsNumber() @Min(0) attestedPricePerSet!: number;
  @IsNumber() @Min(0) nonAttestedPricePerSet!: number;
  @IsNumber() @Min(0) deliveryCharge!: number;
  @IsInt() @Min(0) priority!: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
