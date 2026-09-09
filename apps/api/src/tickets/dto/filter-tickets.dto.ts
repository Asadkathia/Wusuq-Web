import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { TICKET_STATUSES } from '@wusuq/shared';

export class FilterTicketsDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(TICKET_STATUSES)
  status?: (typeof TICKET_STATUSES)[number];

  @IsOptional()
  @IsString()
  serviceCity?: string;

  @IsOptional()
  @IsString()
  representativeId?: string;

  // NOTE (batch-7 3.3/3.6): `consumerId` is inherited from PaginationQueryDto,
  // so staff CAN already filter by it. It is safe from a consumer-class
  // caller because the controller overwrites it with `user.sub` before the
  // query reaches the service, and forces `representativeId` for
  // representatives — neither can widen their own scope with it.


  // Restore/unarchive follow-up: when true, findAll returns ONLY archived
  // tickets (archivedAt not null) instead of the default non-archived list.
  // Staff-only — the controller strips this for consumer/representative
  // callers regardless of what the query string carries.
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  archived?: boolean;
}
