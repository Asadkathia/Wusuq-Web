import { USER_ROLES } from '@wusuq/shared';
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
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
