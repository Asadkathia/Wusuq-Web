import { Body, Controller, Post, Param, ForbiddenException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import type { JwtUser } from './types/jwt-user.type';
import { AuthService } from './auth.service';
import { OtpService } from './otp.service';
import { LoginDto } from './dto/login.dto';
import { OtpRequestDto } from './dto/otp-request.dto';
import { OtpVerifyDto } from './dto/otp-verify.dto';
import { ProfileCompleteDto } from './dto/profile-complete.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { SignupDto } from './dto/signup.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly otpService: OtpService,
  ) {}

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

  @Public()
  @Throttle({ auth: { limit: 5, ttl: 60_000 } })
  @Post('signup')
  signup(@Body() dto: SignupDto) {
    return this.authService.signup(dto);
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

  @Public()
  @Throttle({ auth: { limit: 5, ttl: 60_000 } })
  @Post('otp/request')
  otpRequest(@Body() dto: OtpRequestDto) {
    return this.otpService.request(dto.phone);
  }

  @Public()
  @Throttle({ auth: { limit: 10, ttl: 60_000 } })
  @Post('otp/verify')
  otpVerify(@Body() dto: OtpVerifyDto) {
    return this.otpService.verify(dto.phone, dto.code);
  }

  @Post('profile/complete')
  profileComplete(
    @CurrentUser() user: JwtUser,
    @Body() dto: ProfileCompleteDto,
  ) {
    return this.authService.completeProfile(user.sub, dto);
  }
}
