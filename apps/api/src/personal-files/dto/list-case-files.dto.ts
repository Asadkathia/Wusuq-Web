import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ListCaseFilesDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  serviceId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  cityId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  courtName?: string;
}
