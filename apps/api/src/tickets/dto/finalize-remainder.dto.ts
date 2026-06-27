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
}
