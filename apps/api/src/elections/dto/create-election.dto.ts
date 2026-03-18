import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateElectionDto {
  @IsString()
  name!: string;

  @IsString()
  bodyName!: string;

  @IsOptional()
  @IsString()
  province?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsInt()
  @Min(1900)
  year!: number;

  @IsString()
  tenure!: string;
}
