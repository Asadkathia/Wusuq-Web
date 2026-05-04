import { IsBooleanString, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class ListPersonalFilesDto {
  @IsOptional() @IsString() @MaxLength(120)
  search?: string;

  @IsOptional() @IsIn(['newest', 'oldest', 'name', 'largest'])
  sort?: 'newest' | 'oldest' | 'name' | 'largest';

  @IsOptional() @IsBooleanString()
  includeDeleted?: string;
}
