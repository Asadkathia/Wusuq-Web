/** Body of PUT /tours/progress/:tourId — validated by the global whitelist ValidationPipe. */
import { IsIn, IsInt, Min } from 'class-validator';
import type { TourStatusValue } from '@wusuq/shared';

export class SaveTourProgressDto {
  @IsInt()
  @Min(1)
  version!: number;

  @IsIn(['COMPLETED', 'DISMISSED'])
  status!: TourStatusValue;
}
