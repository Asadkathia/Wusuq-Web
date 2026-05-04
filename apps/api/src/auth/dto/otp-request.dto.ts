import { IsString, Matches } from 'class-validator';

export class OtpRequestDto {
  // Accept either +92XXXXXXXXXX or 03XXXXXXXXX; the service normalises to +92.
  @IsString()
  @Matches(/^(\+?92|0)?3\d{9}$/, { message: 'Invalid Pakistan phone number' })
  phone!: string;
}
