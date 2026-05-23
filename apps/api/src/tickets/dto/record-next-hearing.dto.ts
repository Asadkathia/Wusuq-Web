import { IsDateString, IsOptional, IsString } from 'class-validator';

export class RecordNextHearingDto {
  @IsDateString()
  scheduledDate!: string;

  @IsOptional()
  @IsString()
  hearingType?: string;
}
