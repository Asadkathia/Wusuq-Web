import { Controller, Get } from '@nestjs/common';
import { RequirePermissions } from '../roles-permissions/decorators/permissions.decorator';
import { CabinetService } from './cabinet.service';

@Controller('cabinet')
export class CabinetController {
  constructor(private readonly cabinetService: CabinetService) {}

  @RequirePermissions('elections.read')
  @Get()
  list() {
    return this.cabinetService.list();
  }
}
