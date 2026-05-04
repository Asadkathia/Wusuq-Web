import { CaseStatus, ServiceType } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class FilterCasesDto extends PaginationQueryDto {
  @IsEnum(CaseStatus)
  @IsOptional()
  status?: CaseStatus;

  @IsEnum(ServiceType)
  @IsOptional()
  type?: ServiceType;

  /** When true, only returns cases with at least one active recommendation. */
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  hasRecommendations?: boolean;
}
