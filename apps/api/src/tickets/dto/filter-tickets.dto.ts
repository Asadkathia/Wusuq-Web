import { IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { TICKET_STATUSES } from '@wusuq/shared';

export class FilterTicketsDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(TICKET_STATUSES)
  status?: (typeof TICKET_STATUSES)[number];

  @IsOptional()
  @IsString()
  consumerId?: string;

  @IsOptional()
  @IsString()
  representativeId?: string;

}
