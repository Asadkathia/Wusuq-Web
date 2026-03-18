import { Controller, Get, Query } from '@nestjs/common';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { RequirePermissions } from '../roles-permissions/decorators/permissions.decorator';
import { DocumentsService } from './documents.service';

@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @RequirePermissions('documents.read')
  @Get()
  list(@Query() query: PaginationQueryDto) {
    return this.documentsService.list(query);
  }
}
