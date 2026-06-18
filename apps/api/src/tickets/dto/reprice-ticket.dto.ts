import { Type } from 'class-transformer';
import { IsNumber, IsObject, IsOptional, Min } from 'class-validator';

class RepriceOverridesDto {
  @IsOptional() @IsNumber() @Min(0) printingCharges?: number;
  @IsOptional() @IsNumber() @Min(0) attestedCharges?: number;
  @IsOptional() @IsNumber() @Min(0) nonAttestedCharges?: number;
  @IsOptional() @IsNumber() @Min(0) deliveryCharges?: number;
  @IsOptional() @IsNumber() @Min(0) additionalCharges?: number;
  @IsOptional() @IsNumber() @Min(0) additionalServiceCost?: number;
}

export class RepriceTicketDto {
  @IsOptional() @IsObject()
  payload?: Record<string, string>;

  @IsOptional() @Type(() => RepriceOverridesDto)
  overrides?: RepriceOverridesDto;

  @IsOptional() @IsNumber() @Min(0)
  discountPrice?: number;
}
