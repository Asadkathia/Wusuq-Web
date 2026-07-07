import { COURT_TIERS, PAYMENT_MODES } from '@wusuq/shared';
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateRepresentativeDto {
  @IsString()
  name!: string;

  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
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
