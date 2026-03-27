import { IsString } from 'class-validator';

export class CastVoteDto {
  @IsString() candidateId!: string;
  @IsString() position!: string;
}
