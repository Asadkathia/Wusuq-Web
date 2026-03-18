import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateCandidateDto {
  @IsString()
  position!: string;

  @IsString()
  memberName!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  votes?: number;
}
