import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
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

  @RequirePermissions('wallet.write')
  @Throttle({ auth: { limit: 20, ttl: 60_000 } })
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
  @Throttle({ auth: { limit: 30, ttl: 60_000 } })
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
  @Throttle({ auth: { limit: 30, ttl: 60_000 } })
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
}
