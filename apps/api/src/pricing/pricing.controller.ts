import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
} from '@nestjs/common';
import { RequirePermissions } from '../roles-permissions/decorators/permissions.decorator';
import { PricingService } from './pricing.service';
import { CreatePricingRuleDto } from './dto/create-pricing-rule.dto';
import { UpdatePricingRuleDto } from './dto/update-pricing-rule.dto';
import { ResolvePricingDto } from './dto/resolve-pricing.dto';
import { UpdatePricingSettingsDto } from './dto/pricing-settings.dto';
import { PricingAvailabilityDto } from './dto/pricing-availability.dto';

// Hardening: the mutating rate-admin routes must be staff-only (settings.write)
// and the rule/settings reads staff-only (settings.read). Before this, the whole
// controller had NO @RequirePermissions, so any authenticated user — including a
// consumer — could POST/PATCH/DELETE the live price list. `resolve`/`availability`
// deliberately stay permission-less: they are the consumer intake checkout preview
// (authenticated-only, no mutation).
@Controller('pricing-rules')
export class PricingController {
  constructor(private readonly pricingService: PricingService) {}

  @RequirePermissions('settings.read')
  @Get()
  list() {
    return this.pricingService.list();
  }
  @RequirePermissions('settings.write')
  @Post()
  create(@Body() dto: CreatePricingRuleDto) {
    return this.pricingService.create(dto);
  }
  @Post('resolve') resolve(@Body() dto: ResolvePricingDto) {
    return this.pricingService.resolve(dto);
  }
  @Post('availability') availability(@Body() dto: PricingAvailabilityDto) {
    return this.pricingService.availabilityFor(dto);
  }
  @RequirePermissions('settings.read')
  @Get('settings')
  getSettings() {
    return this.pricingService.getSettings();
  }
  @RequirePermissions('settings.write')
  @Patch('settings')
  updateSettings(@Body() dto: UpdatePricingSettingsDto) {
    return this.pricingService.updateSettings(dto);
  }
  @RequirePermissions('settings.write')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePricingRuleDto) {
    return this.pricingService.update(id, dto);
  }
  @RequirePermissions('settings.write')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.pricingService.remove(id);
  }
}
