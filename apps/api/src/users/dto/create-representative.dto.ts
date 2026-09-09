import { COURT_TIERS, PAYMENT_MODES } from '@wusuq/shared';
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class CreateRepresentativeDto {
  @IsString()
  name!: string;

  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  // Batch-7 5.9: MaxLength alone let short numbers through — the client found
  // +9230012345 in the representative list ("it works in 9 digits too"). Plain
  // E.164 does NOT catch that: +9230012345 is a legal E.164 string, just not a
  // legal Pakistani one. So +92 is pinned to the real rule (3 then 9 digits)
  // and every other country falls back to generic E.164 length.
  // Review finding 3: `@IsOptional()` skips null/undefined but NOT `''`, and
  // both admin forms PATCH `phone: ''` for a user with no stored number — so a
  // bare @Matches made every field on those forms unsaveable, and made the very
  // numbers this rule exists to catch (e.g. a legacy 9-digit one)
  // uncorrectable through the UI. Allow the empty string explicitly; the
  // service treats it as "no phone".
  @ValidateIf((_o, v) => v !== undefined && v !== null && v !== '')
  @Matches(/^\+(?:923\d{9}|(?!92)[1-9]\d{6,13})$/, {
    message: 'phone must be a valid international number, e.g. +923001234567',
  })
  phone?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  serviceFocus?: string;

  @IsOptional()
  @IsString()
  court?: string;

  @IsOptional()
  @IsString()
  courtCity?: string;

  // Machine-readable court tier derived server/client-side from the picked
  // court's type (a @wusuq/shared CourtTier) — drives tier-scoped assignment
  // (C3). See CLAUDE.md "Owner walkthrough round 2" / Workstream E.
  @IsOptional()
  @IsIn(COURT_TIERS)
  courtLevel?: string;

  // Payout details = how admin pays this rep their earnings. Staff-only PII
  // (see users.service.ts serializeUser / users.controller.ts route guards).
  @IsOptional()
  @IsIn(PAYMENT_MODES)
  payoutMethod?: string;

  @IsOptional()
  @IsString()
  payoutBankName?: string;

  @IsOptional()
  @IsString()
  payoutAccountTitle?: string;

  @IsOptional()
  @IsString()
  payoutAccountNumber?: string;

  @IsOptional()
  @IsString()
  payoutJazzCash?: string;

  @IsOptional()
  @IsString()
  payoutEasyPaisa?: string;

  @IsOptional()
  @IsString()
  province?: string;

  @IsOptional()
  @IsString()
  district?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsString()
  @MinLength(6)
  password!: string;
}
