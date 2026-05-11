import { IsString, IsOptional, IsInt, IsNumber, IsBoolean, Min } from 'class-validator';

export class ResolvePricingDto {
  @IsString() flow!: string;
  @IsOptional() @IsString() courtLevel?: string;
  @IsOptional() @IsString() caseStatus?: string;
  @IsOptional() @IsInt() @Min(1900) caseYear?: number;
  @IsOptional() @IsString() setType?: string;
  // v2: canonical year-band key. When omitted, the resolver derives it from
  // caseYear (or defaults to 'current').
  @IsOptional() @IsString() yearBand?: string;
  @IsOptional() @IsNumber() @Min(0) attestedQty?: number;
  @IsOptional() @IsNumber() @Min(0) nonAttestedQty?: number;
  @IsOptional() @IsString() region?: string;   // 'Punjab' | 'other'
  @IsOptional() @IsString() province?: string; // raw province name — service derives region
  @IsOptional() @IsString() city?: string;     // city name — fallback if province unknown

  // v2 surcharge toggles.
  @IsOptional() @IsBoolean() wantPdf?: boolean;
  @IsOptional() @IsString() deliveryMethod?: string; // 'tcs' | 'pickup' | etc

  // When a ticket already has a clerk-side report
  // (TicketClerkReport.perPageRate{Attested,NonAttested}), pass the ticket id
  // so the pricing engine prefers the clerk-reported rate over the global
  // PricingSettings defaults. Falls back silently if no report exists.
  @IsOptional() @IsString() ticketId?: string;
}
