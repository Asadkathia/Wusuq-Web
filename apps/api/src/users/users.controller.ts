import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtUser } from '../auth/types/jwt-user.type';
import { RequirePermissions } from '../roles-permissions/decorators/permissions.decorator';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { CreateRepresentativeDto } from './dto/create-representative.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @RequirePermissions('users.read')
  @Get()
  findAll(@Query() query: PaginationQueryDto) {
    return this.usersService.findAll(query);
  }

  @RequirePermissions('users.read')
  @Get('roles')
  roles() {
    return this.usersService.roles();
  }

  @RequirePermissions('users.read')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @RequirePermissions('users.write')
  @Post()
  create(
    @Body() dto: CreateUserDto,
    @CurrentUser() actor: JwtUser | undefined,
  ) {
    return this.usersService.create(dto, {
      actorUserId: actor?.sub,
      actorEmail: actor?.email,
    });
  }

  @RequirePermissions('users.write')
  @Post('representatives')
  createRepresentative(
    @Body() dto: CreateRepresentativeDto,
    @CurrentUser() actor: JwtUser | undefined,
  ) {
    return this.usersService.createRepresentative(dto, {
      actorUserId: actor?.sub,
      actorEmail: actor?.email,
    });
  }

  @RequirePermissions('users.write')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() actor: JwtUser | undefined,
  ) {
    return this.usersService.update(id, dto, {
      actorUserId: actor?.sub,
      actorEmail: actor?.email,
    });
  }

  @RequirePermissions('users.write')
  @Delete(':id')
  deactivate(
    @Param('id') id: string,
    @CurrentUser() actor: JwtUser | undefined,
  ) {
    return this.usersService.deactivate(id, {
      actorUserId: actor?.sub,
      actorEmail: actor?.email,
    });
  }

  @RequirePermissions('users.write')
  @Post(':id/activate')
  activate(
    @Param('id') id: string,
    @CurrentUser() actor: JwtUser | undefined,
  ) {
    return this.usersService.activate(id, {
      actorUserId: actor?.sub,
      actorEmail: actor?.email,
    });
  }

  @RequirePermissions('users.write')
  @Post(':id/deactivate')
  deactivateByPost(
    @Param('id') id: string,
    @CurrentUser() actor: JwtUser | undefined,
  ) {
    return this.usersService.deactivate(id, {
      actorUserId: actor?.sub,
      actorEmail: actor?.email,
    });
  }

  @RequirePermissions('users.read')
  @Get(':id/tickets')
  userTickets(@Param('id') id: string) {
    return this.usersService.userTickets(id);
  }
}
