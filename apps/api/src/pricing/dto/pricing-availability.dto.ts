import { IsString, IsOptional, IsArray, ArrayNotEmpty } from 'class-validator';

export class PricingAvailabilityDto {
  @IsString() flow!: string;
  @IsOptional() @IsString() courtLevel?: string;
  @IsOptional() @IsString() caseStatus?: string;
  @IsOptional() @IsString() yearBand?: string;
  @IsOptional() @IsString() region?: string;
  @IsOptional() @IsString() province?: string;
  @IsOptional() @IsString() city?: string;
  @IsArray() @ArrayNotEmpty() @IsString({ each: true }) options!: string[];
}
