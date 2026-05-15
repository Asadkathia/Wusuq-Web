import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';

const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_LENGTH = 4;
const MAX_ATTEMPTS = 3;
const PER_PHONE_COOLDOWN_MS = 30 * 1000;
const PER_PHONE_HOURLY_LIMIT = 5;
const HOUR_MS = 60 * 60 * 1000;

function normalizePhone(input: string): string {
  // Strip whitespace, leading +, leading 0; require 92XXXXXXXXXX after.
  const digits = input.replace(/\s+/g, '').replace(/^\+/, '').replace(/^0/, '');
  if (/^3\d{9}$/.test(digits)) return `+92${digits}`;
  if (/^923\d{9}$/.test(digits)) return `+${digits}`;
  throw new BadRequestException('Invalid Pakistan phone number');
}

function generateCode(): string {
  const min = Math.pow(10, OTP_LENGTH - 1);
  const max = Math.pow(10, OTP_LENGTH) - 1;
  return String(Math.floor(min + Math.random() * (max - min + 1)));
}

@Injectable()
export class OtpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {}

  async request(rawPhone: string) {
    const phone = normalizePhone(rawPhone);

    const lastRecent = await this.prisma.otpCode.findFirst({
      where: {
        phone,
        createdAt: { gte: new Date(Date.now() - PER_PHONE_COOLDOWN_MS) },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (lastRecent) {
      const retryAfterSec = Math.ceil(
        (PER_PHONE_COOLDOWN_MS -
          (Date.now() - lastRecent.createdAt.getTime())) /
          1000,
      );
      throw new HttpException(
        { error: 'too_many_requests', retryAfterSec },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const hourlyCount = await this.prisma.otpCode.count({
      where: { phone, createdAt: { gte: new Date(Date.now() - HOUR_MS) } },
    });
    if (hourlyCount >= PER_PHONE_HOURLY_LIMIT) {
      throw new HttpException(
        { error: 'too_many_requests', retryAfterSec: 3600 },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    await this.prisma.otpCode.updateMany({
      where: { phone, consumed: false },
      data: { consumed: true },
    });

    const code = generateCode();
    await this.prisma.otpCode.create({
      data: {
        phone,
        code,
        expiresAt: new Date(Date.now() + OTP_TTL_MS),
      },
    });

    this.dispatchSms(phone, code);

    const isProd = process.env.NODE_ENV === 'production';
    return { sent: true, ...(isProd ? {} : { devCode: code }) };
  }

  async verify(rawPhone: string, code: string) {
    const phone = normalizePhone(rawPhone);

    const otp = await this.prisma.otpCode.findFirst({
      where: { phone, consumed: false },
      orderBy: { createdAt: 'desc' },
    });
    if (!otp) {
      throw new UnauthorizedException({ error: 'invalid_code' });
    }
    if (otp.expiresAt.getTime() < Date.now()) {
      throw new HttpException({ error: 'code_expired' }, HttpStatus.GONE);
    }
    if (otp.attempts >= MAX_ATTEMPTS) {
      throw new UnauthorizedException({ error: 'too_many_attempts' });
    }
    if (otp.code !== code) {
      await this.prisma.otpCode.update({
        where: { id: otp.id },
        data: { attempts: { increment: 1 } },
      });
      throw new UnauthorizedException({ error: 'invalid_code' });
    }

    await this.prisma.otpCode.update({
      where: { id: otp.id },
      data: { consumed: true },
    });

    let user = await this.prisma.user.findFirst({ where: { phone } });
    let isNewUser = false;
    if (!user) {
      user = await this.prisma.user.create({
        data: {
          phone,
          phoneVerified: true,
          role: 'consumer',
          isActive: true,
        },
      });
      isNewUser = true;
    } else if (!user.phoneVerified) {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { phoneVerified: true },
      });
    }

    const tokens = await this.authService.issueTokensForUser(user);
    return { ...tokens, isNewUser };
  }

  private dispatchSms(phone: string, code: string) {
    // MOCK: replace with Twilio (or chosen provider) call when wiring real SMS.
    // The single function that needs to swap.

    console.log('[OTP MOCK] phone=%s code=%s', phone, code);
  }
}
