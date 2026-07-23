import { COURT_TIERS, PAYMENT_MODES, USER_ROLES } from '@wusuq/shared';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  phone?: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;

  @IsOptional()
  @IsIn(USER_ROLES)
  role?: (typeof USER_ROLES)[number];

  @IsOptional()
  @IsBoolean()
  verified?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  // Address / geo + CNIC — a consumer supplies these at onboarding and they are
  // returned by serializeUser, so an admin must be able to edit them here. Were
  // previously absent, so the whitelist ValidationPipe silently stripped them
  // and admin address edits were a no-op (batch-3 H2).
  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  province?: string;

  @IsOptional()
  @IsString()
  district?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  postalCode?: string;

  @IsOptional()
  @IsString()
  cnic?: string;

  // Same 7 representative fields as CreateRepresentativeDto (C4/C5) — mirrored
  // here so an existing rep can be edited via PATCH /users/:id. Payout fields
  // are staff-only PII (see users.service.ts serializeUser / route guards).
  @IsOptional()
  @IsIn(COURT_TIERS)
  courtLevel?: string;

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
}
