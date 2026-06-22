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

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  province?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  district?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  postalCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2)
  country?: string; // ISO code from the profile country picker (e.g. 'PK', 'GB')
}
