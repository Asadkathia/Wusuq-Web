import { Transform } from 'class-transformer';
import { IsBoolean, IsNumber, Max, Min } from 'class-validator';

export class UpdateTaxDto {
  @Transform(({ value }) => Number(value))
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  @Max(1)
  rate!: number;

  @IsBoolean()
  enabled!: boolean;
}
