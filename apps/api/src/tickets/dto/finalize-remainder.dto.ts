import { IsNumber, IsOptional, Min } from 'class-validator';

export class FinalizeRemainderDto {
  @IsOptional() @IsNumber() @Min(0) attestedCharges?: number;
  @IsOptional() @IsNumber() @Min(0) nonAttestedCharges?: number;
  @IsOptional() @IsNumber() @Min(0) printingCharges?: number;
  @IsOptional() @IsNumber() @Min(0) deliveryCharges?: number;
  @IsOptional() @IsNumber() @Min(0) pdfCharges?: number;
  // Admin-editable "Additional Cost" at Review & Complete (Task 4.1). Defaults
  // to the persisted clerk-entered column when omitted, never to 0.
  @IsOptional() @IsNumber() @Min(0) additionalCharges?: number;

  // Editable page counts (B11) — recomputed via computePageCharges(pages,
  // rate) when the corresponding lump charge above is omitted, mirroring the
  // clerk cost-entry precedence: explicit lump wins, then pages × rate, then
  // the persisted value.
  @IsOptional() @IsNumber() @Min(0) noOfPages?: number;
  @IsOptional() @IsNumber() @Min(0) costPerPage?: number;
  @IsOptional() @IsNumber() @Min(0) attestedPages?: number;
  @IsOptional() @IsNumber() @Min(0) attestedCostPerPage?: number;
  @IsOptional() @IsNumber() @Min(0) nonAttestedPages?: number;
  @IsOptional() @IsNumber() @Min(0) nonAttestedCostPerPage?: number;
}
