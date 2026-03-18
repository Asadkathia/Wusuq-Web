import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { JwtUser } from '../../auth/types/jwt-user.type';
import { RequirePermissions } from '../../roles-permissions/decorators/permissions.decorator';
import { CreateServiceCostRuleDto } from '../dto/create-service-cost-rule.dto';
import { ResolveCostDto } from '../dto/resolve-cost.dto';
import { UpdateServiceCostRuleDto } from '../dto/update-service-cost-rule.dto';
import { ServiceCostsService } from './service-costs.service';

@Controller('service-costs')
export class ServiceCostsController {
  constructor(private readonly serviceCostsService: ServiceCostsService) {}

  @RequirePermissions('costs.read')
  @Get()
  list() {
    return this.serviceCostsService.list();
  }

  @RequirePermissions('costs.write')
  @Post()
  create(
    @Body() payload: CreateServiceCostRuleDto,
    @CurrentUser() actor: JwtUser | undefined,
  ) {
    return this.serviceCostsService.create(payload, {
      actorUserId: actor?.sub,
      actorEmail: actor?.email,
    });
  }

  @RequirePermissions('costs.write')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() payload: UpdateServiceCostRuleDto,
    @CurrentUser() actor: JwtUser | undefined,
  ) {
    return this.serviceCostsService.update(id, payload, {
      actorUserId: actor?.sub,
      actorEmail: actor?.email,
    });
  }

  @RequirePermissions('costs.read')
  @Get('resolve')
  resolve(@Query() query: ResolveCostDto) {
    return this.serviceCostsService.resolve(query);
  }
}
