import { Body, Controller, Post, Param, ForbiddenException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import type { JwtUser } from './types/jwt-user.type';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Throttle({ auth: { limit: 5, ttl: 60_000 } })
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Public()
  @Throttle({ auth: { limit: 10, ttl: 60_000 } })
  @Post('refresh')
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @Post('logout')
  logout(@CurrentUser() user: JwtUser | undefined) {
    return this.authService.logout(user?.sub);
  }

  @Post('impersonate/:id')
  impersonate(
    @Param('id') targetId: string,
    @CurrentUser() actor: JwtUser | undefined,
  ) {
    if (actor?.role !== 'super-admin') {
      throw new ForbiddenException('Only super admin can impersonate');
    }
    return this.authService.impersonate(targetId, actor);
  }
}
