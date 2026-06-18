import { Transform } from 'class-transformer';
import { IsNumber, IsString, Min } from 'class-validator';

export class ValidatePromoDto {
  @IsString()
  code!: string;

  @IsString()
  flow!: string;

  @Transform(({ value }) => Number(value))
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  subtotal!: number;
}
