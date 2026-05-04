import { Controller, Get, Param, Res, NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { LocalDiskFileStorage } from './local-disk-file-storage';
import { Public } from '../auth/decorators/public.decorator';

@Controller('files')
export class LocalFilesController {
  constructor(private readonly storage: LocalDiskFileStorage) {}

  @Public()
  @Get('personal/:token')
  async streamPersonal(@Param('token') token: string, @Res() res: Response) {
    const meta = this.storage.consumeToken(token);
    if (!meta) throw new NotFoundException();

    const fullPath = this.storage.resolveKey(meta.key);
    let size: number;
    try {
      const s = await stat(fullPath);
      size = s.size;
    } catch {
      throw new NotFoundException();
    }

    res.setHeader('Content-Type', meta.mimeType || 'application/octet-stream');
    res.setHeader('Content-Length', String(size));
    if (meta.downloadName) {
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${encodeURIComponent(meta.downloadName)}"`,
      );
    }
    createReadStream(fullPath).pipe(res);
  }
}
