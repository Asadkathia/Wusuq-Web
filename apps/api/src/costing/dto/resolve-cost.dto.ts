import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class ResolveCostDto {
  @IsString()
  serviceId!: string;

  @IsString()
  category!: string;

  @IsOptional()
  @IsString()
  caseType?: string;

  @IsOptional()
  @IsString()
  province?: string;

  @IsOptional()
  @IsString()
  audience?: string;

  @IsOptional()
  @IsInt()
  @Min(1900)
  year?: number;
}
