import { IsString, IsOptional, IsArray, ArrayNotEmpty } from 'class-validator';

export class PricingAvailabilityDto {
  @IsString() flow!: string;
  @IsOptional() @IsString() courtLevel?: string;
  @IsOptional() @IsString() caseStatus?: string;
  @IsOptional() @IsString() yearBand?: string;
  @IsOptional() @IsString() region?: string;
  @IsOptional() @IsString() province?: string;
  // Preferred region source — selected GeoCity id (see #26). `city` is fallback.
  @IsOptional() @IsString() cityId?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() currency?: string;
  @IsArray() @ArrayNotEmpty() @IsString({ each: true }) options!: string[];
}
