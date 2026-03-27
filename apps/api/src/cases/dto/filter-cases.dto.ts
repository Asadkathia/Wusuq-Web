import { CaseStatus, ServiceType } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class FilterCasesDto extends PaginationQueryDto {
  @IsEnum(CaseStatus)
  @IsOptional()
  status?: CaseStatus;

  @IsString()
  @IsOptional()
  consumerId?: string;

  @IsEnum(ServiceType)
  @IsOptional()
  type?: ServiceType;
}
