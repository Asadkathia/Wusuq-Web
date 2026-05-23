import { Body, Controller, Get, Put, Req } from '@nestjs/common';
import { RequirePermissions } from '../roles-permissions/decorators/permissions.decorator';
import { PaymentSettingsService } from './payment-settings.service';
import { UpdatePaymentSettingsDto } from './dto/update-payment-settings.dto';

@Controller('payment-settings')
export class PaymentSettingsController {
  constructor(private readonly service: PaymentSettingsService) {}

  @Get()
  get() {
    return this.service.get();
  }

  @RequirePermissions('finance.write')
  @Put()
  update(
    @Body() dto: UpdatePaymentSettingsDto,
    @Req() req: { user?: { userId?: string } },
  ) {
    return this.service.update(dto, req.user?.userId);
  }
}
