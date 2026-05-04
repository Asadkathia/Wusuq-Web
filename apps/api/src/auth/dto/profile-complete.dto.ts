import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ProfileCompleteDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  cityName?: string;
}
