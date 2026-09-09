import { USER_ROLES } from '@wusuq/shared';
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateUserDto {
  @IsString()
  name!: string;

  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  // Batch-7 5.9: MaxLength alone let 9-digit numbers through — the client
  // found +9230012345 saved in the representative list. E.164 requires a
  // leading + and 8-15 digits, which is the real contract the composed
  // `+<dial><local>` value must satisfy.
  @Matches(/^\+[1-9]\d{7,14}$/, {
    message: 'phone must be a valid international number, e.g. +923001234567',
  })
  phone?: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsIn(USER_ROLES)
  role!: (typeof USER_ROLES)[number];

  @IsOptional()
  @IsString()
  cnic?: string;

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
}
