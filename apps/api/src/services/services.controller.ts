import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { RequirePermissions } from '../roles-permissions/decorators/permissions.decorator';
import { CreateServiceDto } from './dto/create-service.dto';
import { ServicesService } from './services.service';

@Controller('services')
export class ServicesController {
  constructor(private readonly servicesService: ServicesService) {}

  @RequirePermissions('tickets.read')
  @Get()
  findAll(@Query('type') type?: string) {
    return this.servicesService.findAll(type);
  }

  @RequirePermissions('tickets.write')
  @Post()
  create(@Body() dto: CreateServiceDto) {
    return this.servicesService.create(dto);
  }

  @RequirePermissions('tickets.read')
  @Get('flows')
  flows() {
    return this.servicesService.flows();
  }
}
