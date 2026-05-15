import {
  IsString,
  IsOptional,
  IsInt,
  IsBoolean,
  IsNumber,
  Min,
} from 'class-validator';

export class UpdatePricingRuleDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() flow?: string;
  @IsOptional() @IsString() courtLevel?: string;
  @IsOptional() @IsString() caseStatus?: string;
  @IsOptional() @IsInt() @Min(1900) yearFrom?: number;
  @IsOptional() @IsInt() @Min(1900) yearTo?: number;
  @IsOptional() @IsString() setType?: string;
  @IsOptional() @IsNumber() @Min(0) basePrice?: number;
  @IsOptional() @IsNumber() @Min(0) attestedPricePerSet?: number;
  @IsOptional() @IsNumber() @Min(0) nonAttestedPricePerSet?: number;
  @IsOptional() @IsNumber() @Min(0) deliveryCharge?: number;
  @IsOptional() @IsInt() @Min(0) priority?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
