import { Transform } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { PAYMENT_MODES } from '@wusuq/shared';

export class ReconcilePaymentDto {
  @Transform(({ value }) => Number(value))
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0.01)
  amount!: number;

  @IsIn(PAYMENT_MODES)
  paymentMode!: (typeof PAYMENT_MODES)[number];

  // No `currency` field (task 7): the server derives it from the ticket
  // being reconciled, never from the client. `main.ts`'s whitelist
  // ValidationPipe strips a stray client value rather than 400ing.

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsString()
  receiptUrl?: string;
}
