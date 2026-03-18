import { IsIn, IsNumber, IsOptional, IsString } from 'class-validator';
import { PAYMENT_MODES } from '@wusuq/shared';

export class TopupWalletDto {
  @IsString()
  userId!: string;

  @IsNumber()
  amount!: number;

  @IsIn(PAYMENT_MODES)
  paymentMode!: (typeof PAYMENT_MODES)[number];

  @IsString()
  currency!: string;

  @IsOptional()
  @IsString()
  receiptUrl?: string;
}
