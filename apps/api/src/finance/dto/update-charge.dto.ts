import { Transform } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class UpdateChargeDto {
  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? Number(value) : undefined))
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  amount?: number;

  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? Number(value) : undefined))
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  serviceCost?: number;

  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? Number(value) : undefined))
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  deliveryCharges?: number;

  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? Number(value) : undefined))
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  printingCharges?: number;

  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? Number(value) : undefined))
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  attestedCharges?: number;

  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? Number(value) : undefined))
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  nonAttestedCharges?: number;

  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? Number(value) : undefined))
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  additionalCharges?: number;

  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? Number(value) : undefined))
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  additionalServiceCost?: number;

  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? Number(value) : undefined))
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  discountPrice?: number;

  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? Number(value) : undefined))
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  promoDiscount?: number;

  @IsOptional()
  @IsString()
  note?: string;
}
