import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class CompanySettingsDto {
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @IsString() @MinLength(1) @MaxLength(120) country!: string;
  @IsString() @MinLength(1) @MaxLength(40) phone!: string;
  @IsEmail() @MaxLength(160) email!: string;
}
