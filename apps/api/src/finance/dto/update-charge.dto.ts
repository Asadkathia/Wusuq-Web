import { Transform } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class UpdateChargeDto {
  @Transform(({ value }) => Number(value))
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  amount!: number;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  nonAttestedCharges?: number;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  discountPrice?: number;

  @IsOptional()
  @IsString()
  note?: string;
}
