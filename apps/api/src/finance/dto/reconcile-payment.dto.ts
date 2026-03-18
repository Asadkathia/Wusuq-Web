import { IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { PAYMENT_MODES } from '@wusuq/shared';

export class ReconcilePaymentDto {
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsIn(PAYMENT_MODES)
  paymentMode!: (typeof PAYMENT_MODES)[number];

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  note?: string;
}
