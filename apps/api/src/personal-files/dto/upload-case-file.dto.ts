import {
  IsNumberString,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * Multipart form fields supplied alongside `file` to
 * POST /personal-files/case-files. The `file` itself is consumed by
 * the FileInterceptor and not part of this DTO.
 */
export class UploadCaseFileDto {
  @IsString()
  @MaxLength(120)
  serviceId!: string;

  @IsString()
  @MaxLength(40)
  cityId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  cityName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  courtName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  courtType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  attachedTicketId?: string;

  /** Optional per-file caption (Petition / Power of Attorney / etc.). */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  caption?: string;

  // ─── Intake-style case metadata ────────────────────────────────────────────
  // These mirror the intake-wizard payload field names so consumers can tag
  // each upload with the case it belongs to without re-entering the full form.

  @IsOptional()
  @IsString()
  @MaxLength(80)
  caseNo?: string;

  /** Four-digit year, sent as a string from the multipart form. */
  @IsOptional()
  @IsNumberString()
  @MaxLength(4)
  caseYear?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  caseTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  courtLevel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  caseType?: string;
}
