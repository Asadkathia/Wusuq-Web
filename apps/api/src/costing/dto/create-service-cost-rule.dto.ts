import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateServiceCostRuleDto {
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

  @IsInt()
  @Min(1900)
  yearFrom!: number;

  @IsInt()
  @Min(1900)
  yearTo!: number;

  @IsNumber()
  @Min(0)
  amount!: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
