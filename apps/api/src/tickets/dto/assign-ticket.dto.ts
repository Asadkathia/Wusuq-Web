import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class AssignTicketDto {
  @IsString()
  representativeId!: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0)
  clerkCost?: number;

  // Batch-7 2.5: "where will the cost be edited from? Every time I have to do
  // this here — give a 'save for future' option." When true, the entered
  // clerkCost is also written back to the PricingRule this ticket priced
  // against, so the next ticket for the same (currency x region x court x
  // flow x band x set type) prefills it.
  @IsOptional()
  @IsBoolean()
  saveClerkCostAsDefault?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  forceAssign?: boolean;
}
