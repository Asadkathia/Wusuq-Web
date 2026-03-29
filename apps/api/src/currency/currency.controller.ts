import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { RequirePermissions } from '../roles-permissions/decorators/permissions.decorator';
import { CurrencyService } from './currency.service';
import { UpsertRateDto } from './dto/upsert-rate.dto';

@Controller('currency')
export class CurrencyController {
  constructor(private readonly currencyService: CurrencyService) {}

  @RequirePermissions('finance.read')
  @Get('rates')
  listRates() {
    return this.currencyService.listRates();
  }

  @RequirePermissions('finance.read')
  @Get('rate')
  getRate(@Query('from') from: string, @Query('to') to: string) {
    return this.currencyService.getLatestRate(from, to);
  }

  @RequirePermissions('finance.write')
  @Post('rates')
  upsertRate(@Body() dto: UpsertRateDto) {
    return this.currencyService.upsertRate(
      dto.fromCurrency,
      dto.toCurrency,
      dto.rate,
      dto.effectiveAt ? new Date(dto.effectiveAt) : undefined,
    );
  }
}
