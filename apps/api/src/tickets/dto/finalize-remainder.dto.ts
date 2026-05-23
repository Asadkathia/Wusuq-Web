import { IsNumber, IsOptional, Min } from 'class-validator';

export class FinalizeRemainderDto {
  @IsOptional() @IsNumber() @Min(0) attestedCharges?: number;
  @IsOptional() @IsNumber() @Min(0) nonAttestedCharges?: number;
  @IsOptional() @IsNumber() @Min(0) printingCharges?: number;
  @IsOptional() @IsNumber() @Min(0) deliveryCharges?: number;
  @IsOptional() @IsNumber() @Min(0) pdfCharges?: number;
}
