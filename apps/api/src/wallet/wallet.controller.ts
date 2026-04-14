import { Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtUser } from '../auth/types/jwt-user.type';
import { RequirePermissions } from '../roles-permissions/decorators/permissions.decorator';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { ReviewWalletTransactionDto } from './dto/review-wallet-transaction.dto';
import { TopupWalletDto } from './dto/topup-wallet.dto';
import { WalletService } from './wallet.service';

@Controller('wallet')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @RequirePermissions('wallet.read')
  @Get()
  list(@Query() query: PaginationQueryDto) {
    return this.walletService.list(query);
  }

  @RequirePermissions('wallet.read')
  @Get('me')
  getMyWallet(@CurrentUser() user: JwtUser) {
    return this.walletService.getMyWallet(user.sub);
  }

  @RequirePermissions('wallet.write')
  @Throttle({ upload: { limit: 30, ttl: 60_000 } })
  @Post('topup')
  topup(
    @Body() dto: TopupWalletDto,
    @CurrentUser() actor: JwtUser | undefined,
  ) {
    return this.walletService.topup(dto, {
      actorUserId: actor?.sub,
      actorEmail: actor?.email,
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
    return this.walletService.verifyTopup(id, dto, {
      actorUserId: actor?.sub,
      actorEmail: actor?.email,
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
    return this.walletService.rejectTopup(id, dto, {
      actorUserId: actor?.sub,
      actorEmail: actor?.email,
    });
  }

  @RequirePermissions('wallet.read')
  @Get(':userId/transactions')
  history(@Param('userId') userId: string) {
    return this.walletService.history(userId);
  }

  @RequirePermissions('wallet.read')
  @Get('export')
  async export(@Query('format') format: string, @Res() res: Response) {
    const data = await this.walletService.list({ page: 1, limit: 5000 } as any);
    const rows = (data as any).items ?? [];

    if (format === 'csv') {
      const header = 'User,Email,Balance,Transactions';
      const lines = rows.map((r: any) =>
        [r.name ?? '', r.email ?? '', r.walletBalance ?? 0, r.transactionCount ?? 0]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(','),
      );
      const csv = [header, ...lines].join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="wallet-export.csv"');
      return res.send(csv);
    }

    res.json(data);
  }
}
