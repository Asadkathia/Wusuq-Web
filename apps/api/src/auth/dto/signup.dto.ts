import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { CONSUMER_KINDS, type ConsumerKind } from '@wusuq/shared';

export class SignupDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  // Required: the phone's dial code is the region signal that sets billing
  // currency (PK → PKR, else → USD). OTP verification is deferred to v2, so the
  // number is saved but not verified.
  @IsString()
  @MinLength(7)
  phone!: string;

  // Required account/user type — Civilian / Lawyer / Company (labels), stored as
  // the ConsumerKind enum (NON_LAWYER / LAWYER / CORPORATE).
  @IsIn(CONSUMER_KINDS)
  consumerKind!: ConsumerKind;

  @IsOptional()
  @IsString()
  @MaxLength(2)
  country?: string; // ISO code from the signup country picker (e.g. 'PK', 'GB')
}
