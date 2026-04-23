import { IsString, IsNumber, IsOptional, IsIn, Min } from 'class-validator';

export class UpdatePricingSettingsDto {
  @IsOptional() @IsString() @IsIn(['legacy', 'custom']) pricingMode?: string;
  @IsOptional() @IsNumber() @Min(0) attestedPricePerSet?: number;
  @IsOptional() @IsNumber() @Min(0) nonAttestedPricePerSet?: number;
}
