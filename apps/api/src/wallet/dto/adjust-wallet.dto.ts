import { IsNumber, IsString, MaxLength } from 'class-validator';

export class AdjustWalletDto {
  @IsNumber() amount!: number;
  @IsString() @MaxLength(500) note!: string;
}
