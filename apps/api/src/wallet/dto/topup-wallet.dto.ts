import { Transform } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, IsString, IsUrl, Min } from 'class-validator';
import { PAYMENT_MODES } from '@wusuq/shared';

export class TopupWalletDto {
  // Admin-side roles may pass a target userId for manual top-ups. Consumer /
  // lawyer / company callers are forced to their own JWT sub by the
  // controller — anything sent here is ignored for those roles.
  @IsOptional()
  @IsString()
  userId?: string;

  @Transform(({ value }) => Number(value))
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0.01)
  amount!: number;

  @IsIn(PAYMENT_MODES)
  paymentMode!: (typeof PAYMENT_MODES)[number];

  @IsString()
  currency!: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  receiptUrl?: string;
}
