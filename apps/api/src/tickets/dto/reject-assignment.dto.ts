import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class RejectAssignmentDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  reason!: string;
}
