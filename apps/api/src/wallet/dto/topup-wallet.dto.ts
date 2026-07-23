import { Transform } from 'class-transformer';
import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
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

  // No `currency` field (task 7): the server ALWAYS derives it from the
  // target user (`WalletService.topup`), never from the client — a
  // client-supplied currency was silently trusted and persisted as-is,
  // which is exactly how a staff top-up for a USD user could be mislabelled
  // PKR. `main.ts`'s whitelist ValidationPipe (no forbidNonWhitelisted)
  // strips a stray client `currency` rather than 400ing, so this removal is
  // safe for any caller that still sends one.

  // The receipt is uploaded via POST /wallet/receipt, which returns an
  // app-relative path `/wallet/receipt/<file>`. Validate that exact shape (not
  // a bare string) so empty/garbage/oversized values are rejected at the API
  // boundary rather than persisted into WalletTransaction.receiptUrl. (Full
  // URLs are not used here; the admin reconcile DTO takes the same path.)
  @IsOptional()
  @IsString()
  @MaxLength(512)
  @Matches(/^\/wallet\/receipt\/[^/?#]+$/, {
    message: 'receiptUrl must be an uploaded /wallet/receipt/<file> path',
  })
  receiptUrl?: string;

  // When present, this top-up is a payment toward a specific ticket: it is
  // tagged TICKET_PAYMENT (vs a generic TOPUP) and routes the admin
  // payment-approval notification instead of the wallet-topup one.
  @IsOptional()
  @IsString()
  ticketId?: string;
}
