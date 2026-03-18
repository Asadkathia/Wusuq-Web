import { Controller, Get, Query } from '@nestjs/common';
import { RequirePermissions } from '../roles-permissions/decorators/permissions.decorator';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { AuditLogsService } from './audit-logs.service';

@Controller('audit-logs')
export class AuditLogsController {
  constructor(private readonly auditLogsService: AuditLogsService) {}

  @RequirePermissions('audit.read')
  @Get()
  findAll(@Query() query: PaginationQueryDto) {
    return this.auditLogsService.findAll(query);
  }
}
