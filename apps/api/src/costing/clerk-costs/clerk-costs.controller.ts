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
import { CreateClerkCostRuleDto } from '../dto/create-clerk-cost-rule.dto';
import { ResolveCostDto } from '../dto/resolve-cost.dto';
import { UpdateClerkCostRuleDto } from '../dto/update-clerk-cost-rule.dto';
import { ClerkCostsService } from './clerk-costs.service';

@Controller('clerk-costs')
export class ClerkCostsController {
  constructor(private readonly clerkCostsService: ClerkCostsService) {}

  @RequirePermissions('costs.read')
  @Get()
  list() {
    return this.clerkCostsService.list();
  }

  @RequirePermissions('costs.write')
  @Post()
  create(
    @Body() payload: CreateClerkCostRuleDto,
    @CurrentUser() actor: JwtUser | undefined,
  ) {
    return this.clerkCostsService.create(payload, {
      actorUserId: actor?.sub,
      actorEmail: actor?.email,
    });
  }

  @RequirePermissions('costs.write')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() payload: UpdateClerkCostRuleDto,
    @CurrentUser() actor: JwtUser | undefined,
  ) {
    return this.clerkCostsService.update(id, payload, {
      actorUserId: actor?.sub,
      actorEmail: actor?.email,
    });
  }

  @RequirePermissions('costs.read')
  @Get('resolve')
  resolve(@Query() query: ResolveCostDto) {
    return this.clerkCostsService.resolve(query);
  }
}
