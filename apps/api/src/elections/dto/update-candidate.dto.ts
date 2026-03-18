import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class UpdateCandidateDto {
  @IsOptional()
  @IsString()
  position?: string;

  @IsOptional()
  @IsString()
  memberName?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  votes?: number;
}
