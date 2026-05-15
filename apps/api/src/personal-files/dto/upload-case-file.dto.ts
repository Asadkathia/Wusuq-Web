import { IsOptional, IsString, MaxLength } from 'class-validator';

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
}
