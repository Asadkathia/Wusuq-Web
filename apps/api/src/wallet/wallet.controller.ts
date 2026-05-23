import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Res,
  UnauthorizedException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { diskStorage } from 'multer';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtUser } from '../auth/types/jwt-user.type';
import {
  UPLOADS_BUCKETS,
  getUploadsBucketAbsoluteDir,
  getUploadsBucketDir,
} from '../config/uploads';
import { RequirePermissions } from '../roles-permissions/decorators/permissions.decorator';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { ReviewWalletTransactionDto } from './dto/review-wallet-transaction.dto';
import { TopupWalletDto } from './dto/topup-wallet.dto';
import { AdjustWalletDto } from './dto/adjust-wallet.dto';
import { isAdminWalletRole } from './wallet-roles';
import { WalletService } from './wallet.service';

const RECEIPT_MAX_BYTES = 10 * 1024 * 1024;
const RECEIPT_ALLOWED_EXTS = new Set(['.pdf', '.jpg', '.jpeg', '.png']);
const RECEIPT_ALLOWED_MIMES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
]);

@Controller('wallet')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  // Admin-only: list every wallet + pending top-ups. Consumer/lawyer/company
  // also carry wallet.read (so they can hit /wallet/me) — guard explicitly
  // by role here.
  @RequirePermissions('wallet.read')
  @Get()
  list(
    @Query() query: PaginationQueryDto,
    @CurrentUser() actor: JwtUser | undefined,
  ) {
    if (!actor) throw new UnauthorizedException();
    if (!isAdminWalletRole(actor.role)) {
      throw new ForbiddenException('Admin role required to list wallets');
    }
    return this.walletService.list(query);
  }

  @RequirePermissions('wallet.read')
  @Get('me')
  getMyWallet(@CurrentUser() user: JwtUser) {
    return this.walletService.getMyWallet(user.sub);
  }

  @RequirePermissions('wallet.topup')
  @Throttle({ upload: { limit: 30, ttl: 60_000 } })
  @Post('topup')
  topup(
    @Body() dto: TopupWalletDto,
    @CurrentUser() actor: JwtUser | undefined,
  ) {
    if (!actor) throw new UnauthorizedException();
    // Non-admin callers always top up their own wallet — ignore any client
    // userId. Admin callers may target a different user.
    const targetUserId = isAdminWalletRole(actor.role)
      ? (dto.userId ?? actor.sub)
      : actor.sub;
    return this.walletService.topup(
      { ...dto, userId: targetUserId },
      { actorUserId: actor.sub, actorEmail: actor.email },
    );
  }

  @RequirePermissions('wallet.topup')
  @Throttle({ upload: { limit: 30, ttl: 60_000 } })
  @Post('receipt')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) =>
          cb(null, getUploadsBucketDir(UPLOADS_BUCKETS.walletReceipts)),
        filename: (_req, file, callback) => {
          const sanitized = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
          const ext = extname(sanitized);
          callback(
            null,
            `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`,
          );
        },
      }),
      limits: { fileSize: RECEIPT_MAX_BYTES },
      fileFilter: (_req, file, callback) => {
        const ext = extname(file.originalname).toLowerCase();
        if (
          !RECEIPT_ALLOWED_MIMES.has(file.mimetype) ||
          !RECEIPT_ALLOWED_EXTS.has(ext)
        ) {
          callback(
            new BadRequestException(
              'Allowed formats: JPG, PNG, PDF · max 10MB',
            ),
            false,
          );
          return;
        }
        callback(null, true);
      },
    }),
  )
  uploadReceipt(
    @UploadedFile()
    file: { filename: string; mimetype: string; path: string } | undefined,
    @CurrentUser() actor: JwtUser | undefined,
  ) {
    if (!actor) throw new UnauthorizedException();
    if (!file) throw new BadRequestException('File is required');
    return this.walletService.recordReceiptUpload(file, {
      actorUserId: actor.sub,
      actorEmail: actor.email,
    });
  }

  // Serves a previously-uploaded wallet receipt by filename. Admins can
  // fetch any receipt; consumers can fetch their own (owner is resolved by
  // looking up the WalletTransaction row that references the URL).
  @RequirePermissions('wallet.read')
  @Get('receipt/:filename')
  async downloadReceipt(
    @Param('filename') filename: string,
    @Res() res: Response,
    @CurrentUser() actor: JwtUser | undefined,
  ) {
    if (!actor) throw new UnauthorizedException();

    // Defensive path resolution: only allow files inside the receipts dir.
    const baseDir =
      getUploadsBucketAbsoluteDir(UPLOADS_BUCKETS.walletReceipts) + sep;
    const target = resolve(join(baseDir, normalize(filename)));
    if (!target.startsWith(baseDir)) {
      throw new BadRequestException('Invalid filename');
    }

    if (!isAdminWalletRole(actor.role)) {
      const isOwner = await this.walletService.isReceiptOwnedBy(
        filename,
        actor.sub,
      );
      if (!isOwner) {
        throw new ForbiddenException('Cannot read this receipt');
      }
    }

    const ext = extname(target).toLowerCase();
    const contentType =
      ext === '.pdf'
        ? 'application/pdf'
        : ext === '.png'
          ? 'image/png'
          : ext === '.jpg' || ext === '.jpeg'
            ? 'image/jpeg'
            : 'application/octet-stream';

    return new Promise<void>((resolveFn, rejectFn) => {
      res.sendFile(
        target,
        { headers: { 'Content-Type': contentType } },
        (err) => {
          if (err) {
            if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
              rejectFn(new NotFoundException('Receipt not found'));
              return;
            }
            rejectFn(err);
            return;
          }
          resolveFn();
        },
      );
    });
  }

  @RequirePermissions('wallet.write')
  @Throttle({ upload: { limit: 30, ttl: 60_000 } })
  @Post('transactions/:id/verify')
  verify(
    @Param('id') id: string,
    @Body() dto: ReviewWalletTransactionDto,
    @CurrentUser() actor: JwtUser | undefined,
  ) {
    if (!actor) throw new UnauthorizedException();
    if (!isAdminWalletRole(actor.role)) {
      throw new ForbiddenException('Admin role required to verify top-ups');
    }
    return this.walletService.verifyTopup(id, dto, {
      actorUserId: actor.sub,
      actorEmail: actor.email,
    });
  }

  @RequirePermissions('wallet.write')
  @Throttle({ upload: { limit: 30, ttl: 60_000 } })
  @Post('transactions/:id/reject')
  reject(
    @Param('id') id: string,
    @Body() dto: ReviewWalletTransactionDto,
    @CurrentUser() actor: JwtUser | undefined,
  ) {
    if (!actor) throw new UnauthorizedException();
    if (!isAdminWalletRole(actor.role)) {
      throw new ForbiddenException('Admin role required to reject top-ups');
    }
    return this.walletService.rejectTopup(id, dto, {
      actorUserId: actor.sub,
      actorEmail: actor.email,
    });
  }

  @RequirePermissions('finance.write')
  @Post(':userId/adjust')
  adjust(
    @Param('userId') userId: string,
    @Body() dto: AdjustWalletDto,
    @CurrentUser() actor: JwtUser | undefined,
  ) {
    if (!actor) throw new UnauthorizedException();
    if (!isAdminWalletRole(actor.role)) {
      throw new ForbiddenException('Admin role required to adjust wallet');
    }
    return this.walletService.adjustWallet(
      userId,
      dto.amount,
      dto.note,
      actor.sub,
    );
  }

  // Admin-side roles can read any user's transactions. Consumer/lawyer/company
  // are restricted to their own.
  @RequirePermissions('wallet.read')
  @Get(':userId/transactions')
  history(
    @Param('userId') userId: string,
    @CurrentUser() actor: JwtUser | undefined,
  ) {
    if (!actor) throw new UnauthorizedException();
    if (!isAdminWalletRole(actor.role) && actor.sub !== userId) {
      throw new ForbiddenException('Cannot read another user’s transactions');
    }
    return this.walletService.history(userId);
  }

  @RequirePermissions('wallet.read')
  @Get('export')
  async export(
    @Query('format') format: string,
    @Res() res: Response,
    @CurrentUser() actor: JwtUser | undefined,
  ) {
    if (!actor) throw new UnauthorizedException();
    if (!isAdminWalletRole(actor.role)) {
      throw new ForbiddenException('Admin role required to export wallets');
    }
    const data = await this.walletService.list({
      page: 1,
      limit: 5000,
    } as PaginationQueryDto);
    const rows = data.items;

    if (format === 'csv') {
      const header = 'User,Balance,Transactions,CreatedAt';
      const lines = rows.map((r) =>
        [
          r.consumerName ?? '',
          r.accountBalance ?? 0,
          r.totalTransactions ?? 0,
          r.createdAt ? new Date(r.createdAt).toISOString() : '',
        ]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(','),
      );
      const csv = [header, ...lines].join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="wallet-export.csv"',
      );
      return res.send(csv);
    }

    res.json(data);
  }
}
