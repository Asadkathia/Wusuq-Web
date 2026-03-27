import { Transform } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { PAYMENT_MODES } from '@wusuq/shared';

export class TopupWalletDto {
  @IsString()
  userId!: string;

  @Transform(({ value }) => Number(value))
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0.01)
  amount!: number;

  @IsIn(PAYMENT_MODES)
  paymentMode!: (typeof PAYMENT_MODES)[number];

  @IsString()
  currency!: string;

  @IsOptional()
  @IsString()
  receiptUrl?: string;
}
