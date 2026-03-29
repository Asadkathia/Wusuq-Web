import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { JwtUser } from '../../auth/types/jwt-user.type';
import { RequirePermissions } from '../../roles-permissions/decorators/permissions.decorator';
import { UpsertServiceBaseCostDto } from '../dto/upsert-service-base-cost.dto';
import { UpdateServiceBaseCostDto } from '../dto/update-service-base-cost.dto';
import { ServiceBaseCostsService } from './service-base-costs.service';

@Controller('service-base-costs')
export class ServiceBaseCostsController {
  constructor(private readonly service: ServiceBaseCostsService) {}

  @RequirePermissions('costs.read')
  @Get()
  list() {
    return this.service.list();
  }

  @RequirePermissions('costs.write')
  @Post()
  upsert(
    @Body() dto: UpsertServiceBaseCostDto,
    @CurrentUser() actor: JwtUser | undefined,
  ) {
    return this.service.upsert(dto, { actorUserId: actor?.sub, actorEmail: actor?.email });
  }

  @RequirePermissions('costs.write')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateServiceBaseCostDto,
    @CurrentUser() actor: JwtUser | undefined,
  ) {
    return this.service.update(id, dto, { actorUserId: actor?.sub, actorEmail: actor?.email });
  }

  @RequirePermissions('costs.write')
  @Delete(':id')
  remove(
    @Param('id') id: string,
    @CurrentUser() actor: JwtUser | undefined,
  ) {
    return this.service.remove(id, { actorUserId: actor?.sub, actorEmail: actor?.email });
  }
}
