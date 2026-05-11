import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { CONSUMER_KINDS, type ConsumerKind } from '@wusuq/shared';

export class ProfileCompleteDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  cityName?: string;

  @IsOptional()
  @IsIn(CONSUMER_KINDS as unknown as string[])
  consumerKind?: ConsumerKind;
}
