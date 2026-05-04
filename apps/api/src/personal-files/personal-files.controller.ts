import {
  BadRequestException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtUser } from '../auth/types/jwt-user.type';
import { PersonalFilesService } from './personal-files.service';
import { ListPersonalFilesDto } from './dto/list-personal-files.dto';

function assertConsumer(user: JwtUser): void {
  if (user.role !== 'consumer') {
    throw new ForbiddenException({ error: 'staff_cannot_access_personal_files' });
  }
}

@Controller('personal-files')
export class PersonalFilesController {
  constructor(private readonly service: PersonalFilesService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 11 * 1024 * 1024 } }))
  upload(
    @CurrentUser() user: JwtUser,
    @UploadedFile() file: { buffer: Buffer; originalname: string; mimetype: string } | undefined,
  ) {
    assertConsumer(user);
    if (!file) throw new BadRequestException({ error: 'no_file' });
    return this.service.upload(user.sub, user.email ?? null, {
      buffer: file.buffer,
      originalName: file.originalname,
      declaredMime: file.mimetype,
    });
  }

  @Get()
  list(@CurrentUser() user: JwtUser, @Query() query: ListPersonalFilesDto) {
    assertConsumer(user);
    return this.service.list(user.sub, {
      search: query.search,
      sort: query.sort,
      includeDeleted: query.includeDeleted === 'true',
    });
  }

  @Get('quota')
  quota(@CurrentUser() user: JwtUser) {
    assertConsumer(user);
    return this.service.quota(user.sub);
  }

  @Get(':id/download')
  async download(@CurrentUser() user: JwtUser, @Param('id') id: string, @Res() res: Response) {
    assertConsumer(user);
    const url = await this.service.signDownload(user.sub, user.email ?? null, id);
    res.redirect(302, url);
  }

  @Delete(':id')
  @HttpCode(204)
  async softDelete(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    assertConsumer(user);
    await this.service.softDelete(user.sub, user.email ?? null, id);
  }

  @Post(':id/restore')
  restore(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    assertConsumer(user);
    return this.service.restore(user.sub, user.email ?? null, id);
  }
}
