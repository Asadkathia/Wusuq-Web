import { IsString, IsOptional, IsInt, IsNumber, Min } from 'class-validator';

export class ResolvePricingDto {
  @IsString() flow!: string;
  @IsOptional() @IsString() courtLevel?: string;
  @IsOptional() @IsString() caseStatus?: string;
  @IsOptional() @IsInt() @Min(1900) caseYear?: number;
  @IsOptional() @IsString() setType?: string;
  @IsOptional() @IsNumber() @Min(0) attestedQty?: number;
  @IsOptional() @IsNumber() @Min(0) nonAttestedQty?: number;
  @IsOptional() @IsString() region?: string;   // 'Punjab' | 'other'
  @IsOptional() @IsString() province?: string; // raw province name — service derives region
  @IsOptional() @IsString() city?: string;     // city name — fallback if province unknown
}
