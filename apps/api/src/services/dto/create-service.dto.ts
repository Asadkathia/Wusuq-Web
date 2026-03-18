import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class CreateServiceDto {
  @IsString()
  name!: string;

  @IsString()
  type!: string;

  @IsString()
  category!: string;

  @IsOptional()
  @IsString()
  courtLevel?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
