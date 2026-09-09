import { IsIn, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { PAYMENT_MODES } from '@wusuq/shared';

/**
 * Batch-7 2.6 — recording a payout to a representative.
 *
 * "Now you can see the earning of this account. We will see how to send money
 *  to this account. Just like we are sending money to the client, we will also
 *  send money to the representative — his 800, via JazzCash or EasyPaisa."
 *
 * NOTE: this records the payout in the AUDIT TRAIL, not in a payout ledger.
 * WalletTransactionType has no PAYOUT member and adding one is a migration
 * that has to be applied to Neon by hand (see CLAUDE.md), so a full ledger
 * with reconciliation/status is deliberately left for an owner decision. What
 * is here is complete and honest: an immutable, queryable record of who was
 * paid, how much, by which rail, and by whom.
 */
export class RecordPayoutDto {
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsIn(PAYMENT_MODES)
  method!: (typeof PAYMENT_MODES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
