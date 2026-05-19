import { IsString } from 'class-validator';

export class InitiatePaymentDto {
  @IsString()
  ticketId!: string;
}
