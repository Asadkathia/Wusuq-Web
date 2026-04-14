import { CaseStatus, ServiceType } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class FilterCasesDto extends PaginationQueryDto {
  @IsEnum(CaseStatus)
  @IsOptional()
  status?: CaseStatus;

  @IsEnum(ServiceType)
  @IsOptional()
  type?: ServiceType;
}
