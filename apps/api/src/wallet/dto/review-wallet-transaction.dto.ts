import { IsOptional, IsString } from 'class-validator';

export class ReviewWalletTransactionDto {
  @IsOptional()
  @IsString()
  note?: string;
}
