import { IsString, Length, Matches } from 'class-validator';

export class OtpVerifyDto {
  @IsString()
  @Matches(/^(\+?92|0)?3\d{9}$/)
  phone!: string;

  @IsString()
  @Length(4, 4, { message: 'Code must be 4 digits' })
  @Matches(/^\d{4}$/, { message: 'Code must be 4 digits' })
  code!: string;
}
