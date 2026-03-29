import { Transform } from 'class-transformer';
import { IsDateString, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class UpsertRateDto {
  @IsString()
  fromCurrency!: string;

  @IsString()
  toCurrency!: string;

  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0)
  rate!: number;

  @IsOptional()
  @IsDateString()
  effectiveAt?: string;
}
