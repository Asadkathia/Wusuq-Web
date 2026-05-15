import {
  IsString,
  IsOptional,
  IsInt,
  IsNumber,
  IsBoolean,
  Min,
} from 'class-validator';

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
  @IsOptional() @IsString() region?: string; // 'Punjab' | 'other'
  @IsOptional() @IsString() province?: string; // raw province name — service derives region
  @IsOptional() @IsString() city?: string; // city name — fallback if province unknown

  // v2 surcharge toggles.
  @IsOptional() @IsBoolean() wantPdf?: boolean;
  @IsOptional() @IsString() deliveryMethod?: string; // 'tcs' | 'pickup' | etc

  // When a ticket already has a clerk-side report
  // (TicketClerkReport.perPageRate{Attested,NonAttested}), pass the ticket id
  // so the pricing engine prefers the clerk-reported rate over the global
  // PricingSettings defaults. Falls back silently if no report exists.
  @IsOptional() @IsString() ticketId?: string;

  // PDF #14: when the case title is "State vs <X>" (state is the plaintiff,
  // criminal cases), the resolver adds a flat Rs 1,000 surcharge on top of
  // whatever the rule-based pricing produces. Optional — callers that omit
  // it (or pass an unrelated title) get a 0 surcharge.
  @IsOptional() @IsString() caseTitle?: string;

  // PDF #36 (Case Search multi-city): consumer can select 1..N cities. The
  // resolver multiplies (base + searchBothSurcharge + titleSurcharge +
  // pdfSurcharge + deliveryFee) by this count for `judicial_case_search`
  // only. Other flows ignore the multiplier. Defaults to 1.
  @IsOptional() @IsInt() @Min(1) cityCount?: number;

  // PDF #37 (Case Search search-method tabs). One of 'cnic' | 'details' |
  // 'both'. Only consulted for `judicial_case_search`; 'both' adds a
  // Rs 1,000 per-city surcharge.
  @IsOptional() @IsString() searchMethod?: string;
}
