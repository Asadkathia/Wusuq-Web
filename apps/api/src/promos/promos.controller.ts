import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtUser } from '../auth/types/jwt-user.type';
import { RequirePermissions } from '../roles-permissions/decorators/permissions.decorator';
import { CreatePromoDto } from './dto/create-promo.dto';
import { ValidatePromoDto } from './dto/validate-promo.dto';
import { PromosService } from './promos.service';

@Controller('promos')
export class PromosController {
  constructor(private readonly promos: PromosService) {}

  @Post('validate')
  @RequirePermissions('tickets.create')
  validate(
    @Body() dto: ValidatePromoDto,
    @CurrentUser() actor: JwtUser | undefined,
  ) {
    return this.promos.validate({
      code: dto.code,
      userId: actor?.sub ?? '',
      flow: dto.flow,
      subtotal: dto.subtotal,
    });
  }

  @Get()
  @RequirePermissions('promos.write')
  list() {
    return this.promos.list();
  }

  @Post()
  @RequirePermissions('promos.write')
  create(
    @Body() dto: CreatePromoDto,
    @CurrentUser() actor: JwtUser | undefined,
  ) {
    return this.promos.create(dto, actor?.sub);
  }

  @Post(':id/deactivate')
  @RequirePermissions('promos.write')
  deactivate(@Param('id') id: string) {
    return this.promos.deactivate(id);
  }
}
