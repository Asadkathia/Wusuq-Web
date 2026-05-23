import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class AssignBulkDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  ticketIds!: string[];

  @IsString()
  representativeId!: string;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  forceAssign?: boolean;
}
