// apps/api/src/auth/otp.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus, UnauthorizedException } from '@nestjs/common';
import { OtpService } from './otp.service';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';

function makePrisma() {
  return {
    otpCode: {
      findFirst: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    user: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };
}

describe('OtpService', () => {
  let service: OtpService;
  let prisma: ReturnType<typeof makePrisma>;
  let auth: { issueTokensForUser: jest.Mock };

  beforeEach(async () => {
    prisma = makePrisma();
    auth = {
      issueTokensForUser: jest.fn().mockResolvedValue({
        accessToken: 'a',
        refreshToken: 'r',
        user: {},
      }),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OtpService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuthService, useValue: auth },
      ],
    }).compile();
    service = module.get(OtpService);
  });

  describe('request', () => {
    it('rejects malformed phone', async () => {
      await expect(service.request('not-a-phone')).rejects.toThrow();
    });

    it('normalises 03XXXXXXXXX -> +923XXXXXXXXX', async () => {
      prisma.otpCode.findFirst.mockResolvedValue(null);
      prisma.otpCode.count.mockResolvedValue(0);
      prisma.otpCode.updateMany.mockResolvedValue({});
      prisma.otpCode.create.mockResolvedValue({});
      await service.request('03001234567');
      const arg = prisma.otpCode.create.mock.calls[0][0].data;
      expect(arg.phone).toBe('+923001234567');
    });

    it('returns devCode in non-production', async () => {
      prisma.otpCode.findFirst.mockResolvedValue(null);
      prisma.otpCode.count.mockResolvedValue(0);
      prisma.otpCode.updateMany.mockResolvedValue({});
      prisma.otpCode.create.mockResolvedValue({});
      const r = await service.request('+923001234567');
      expect(r.sent).toBe(true);
      expect((r as { devCode?: string }).devCode).toMatch(/^\d{4}$/);
    });

    it('429s when called within 30s of last request', async () => {
      prisma.otpCode.findFirst.mockResolvedValue({ createdAt: new Date(Date.now() - 5000) });
      try {
        await service.request('+923001234567');
        throw new Error('should have thrown');
      } catch (e) {
        const err = e as { getStatus: () => number };
        expect(err.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      }
    });

    it('429s when phone has hit hourly cap', async () => {
      prisma.otpCode.findFirst.mockResolvedValue(null);
      prisma.otpCode.count.mockResolvedValue(5);
      try {
        await service.request('+923001234567');
        throw new Error('should have thrown');
      } catch (e) {
        const err = e as { getStatus: () => number };
        expect(err.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      }
    });
  });

  describe('verify', () => {
    it('401s when no open OTP exists', async () => {
      prisma.otpCode.findFirst.mockResolvedValue(null);
      await expect(service.verify('+923001234567', '1234')).rejects.toThrow(UnauthorizedException);
    });

    it('410s when OTP expired', async () => {
      prisma.otpCode.findFirst.mockResolvedValue({
        id: 'o1', code: '1234', expiresAt: new Date(Date.now() - 1000), attempts: 0,
      });
      try {
        await service.verify('+923001234567', '1234');
        throw new Error('should have thrown');
      } catch (e) {
        const err = e as { getStatus: () => number };
        expect(err.getStatus()).toBe(HttpStatus.GONE);
      }
    });

    it('locks out after MAX_ATTEMPTS', async () => {
      prisma.otpCode.findFirst.mockResolvedValue({
        id: 'o1', code: '1234', expiresAt: new Date(Date.now() + 60000), attempts: 3,
      });
      await expect(service.verify('+923001234567', '0000')).rejects.toMatchObject({
        response: { error: 'too_many_attempts' },
      });
    });

    it('increments attempts on wrong code', async () => {
      prisma.otpCode.findFirst.mockResolvedValue({
        id: 'o1', code: '1234', expiresAt: new Date(Date.now() + 60000), attempts: 0,
      });
      await expect(service.verify('+923001234567', '0000')).rejects.toThrow(UnauthorizedException);
      expect(prisma.otpCode.update).toHaveBeenCalledWith({
        where: { id: 'o1' },
        data: { attempts: { increment: 1 } },
      });
    });

    it('creates a new user with phoneVerified=true on first successful verify', async () => {
      prisma.otpCode.findFirst.mockResolvedValue({
        id: 'o1', code: '1234', expiresAt: new Date(Date.now() + 60000), attempts: 0,
      });
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({
        id: 'u1', phone: '+923001234567', phoneVerified: true, role: 'consumer', name: null, email: null,
      });
      const r = await service.verify('+923001234567', '1234');
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: { phone: '+923001234567', phoneVerified: true, role: 'consumer', isActive: true },
      });
      expect(r.isNewUser).toBe(true);
    });

    it('returns isNewUser=false for an already-registered user', async () => {
      prisma.otpCode.findFirst.mockResolvedValue({
        id: 'o1', code: '1234', expiresAt: new Date(Date.now() + 60000), attempts: 0,
      });
      prisma.user.findFirst.mockResolvedValue({
        id: 'u1', phone: '+923001234567', phoneVerified: true, role: 'consumer', name: 'Ali', email: null,
      });
      const r = await service.verify('+923001234567', '1234');
      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(r.isNewUser).toBe(false);
    });
  });
});
