import { USER_ROLES, type UserRole } from '@wusuq/shared';
import { IsIn, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

// I1: an optional exact-role filter for GET /users, so the admin "Manage
// Users" role dropdown can filter server-side instead of fetching every role
// and hiding the rest client-side (which silently truncates a 200-row page
// when it's mostly one other role). Validated against the shared UserRole
// list (hyphenated form, e.g. 'manager-admin') — the SAME enum
// CreateUserDto/UpdateUserDto already validate `role` against, so a value
// that round-trips through create/edit also round-trips through this filter.
export class ListUsersDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(USER_ROLES)
  role?: UserRole;
}
