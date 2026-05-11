import { Controller, Get, Post, Patch, Delete, Body, Param } from '@nestjs/common';
import { PricingService } from './pricing.service';
import { CreatePricingRuleDto } from './dto/create-pricing-rule.dto';
import { UpdatePricingRuleDto } from './dto/update-pricing-rule.dto';
import { ResolvePricingDto } from './dto/resolve-pricing.dto';
import { UpdatePricingSettingsDto } from './dto/pricing-settings.dto';
import { PricingAvailabilityDto } from './dto/pricing-availability.dto';

@Controller('pricing-rules')
export class PricingController {
  constructor(private readonly pricingService: PricingService) {}

  @Get() list() { return this.pricingService.list(); }
  @Post() create(@Body() dto: CreatePricingRuleDto) { return this.pricingService.create(dto); }
  @Post('resolve') resolve(@Body() dto: ResolvePricingDto) { return this.pricingService.resolve(dto); }
  @Post('availability') availability(@Body() dto: PricingAvailabilityDto) { return this.pricingService.availabilityFor(dto); }
  @Get('settings') getSettings() { return this.pricingService.getSettings(); }
  @Patch('settings') updateSettings(@Body() dto: UpdatePricingSettingsDto) { return this.pricingService.updateSettings(dto); }
  @Patch(':id') update(@Param('id') id: string, @Body() dto: UpdatePricingRuleDto) { return this.pricingService.update(id, dto); }
  @Delete(':id') remove(@Param('id') id: string) { return this.pricingService.remove(id); }
}
