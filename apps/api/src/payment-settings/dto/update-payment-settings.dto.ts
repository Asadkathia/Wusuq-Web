import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdatePaymentSettingsDto {
  @IsString() @MaxLength(120) bankName!: string;
  @IsString() @MaxLength(120) accountTitle!: string;
  @IsString() @MaxLength(60) accountNumber!: string;
  @IsOptional() @IsString() @MaxLength(60) iban?: string;
  @IsOptional() @IsString() @MaxLength(60) jazzCash?: string;
  @IsOptional() @IsString() @MaxLength(60) easyPaisa?: string;
  @IsOptional() @IsString() @MaxLength(2000) instructions?: string;
}
