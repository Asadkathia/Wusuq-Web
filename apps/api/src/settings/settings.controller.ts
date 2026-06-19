import { Body, Controller, Get, Put } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtUser } from '../auth/types/jwt-user.type';
import { RequirePermissions } from '../roles-permissions/decorators/permissions.decorator';
import { SettingsService } from './settings.service';
import { UpdateTaxDto } from './dto/update-tax.dto';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @RequirePermissions('settings.read')
  @Get('tax')
  getTax() {
    return this.settings.getTaxConfig();
  }

  /** Consumer-readable endpoint: returns only the effective rate (0 when tax is disabled). */
  @RequirePermissions('tickets.create')
  @Get('tax/rate')
  async getEffectiveTaxRate() {
    return { rate: await this.settings.getTaxRate() };
  }

  @RequirePermissions('settings.write')
  @Put('tax')
  setTax(@Body() dto: UpdateTaxDto, @CurrentUser() actor: JwtUser | undefined) {
    return this.settings.setTaxConfig(dto.rate, dto.enabled, actor?.sub);
  }
}
