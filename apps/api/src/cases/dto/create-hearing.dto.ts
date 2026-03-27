import { Type } from 'class-transformer';
import { IsDate, IsOptional, IsString } from 'class-validator';

export class CreateHearingDto {
  @IsDate()
  @Type(() => Date)
  scheduledDate!: Date;

  @IsString()
  @IsOptional()
  hearingType?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsDate()
  @IsOptional()
  @Type(() => Date)
  nextDate?: Date;
}
