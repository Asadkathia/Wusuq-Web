# Consumer Login & Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the consumer email/password login with a phone-first OTP login (steps 1–2), with implicit account creation + name/city capture for first-time users (step 3). All SMS delivery and Google/Apple OAuth are mocked for v1; UI ships ready for later real integration.

**Architecture:** Backend adds an `OtpCode` table and three new endpoints (`/auth/otp/request`, `/auth/otp/verify`, `/auth/profile/complete`); the existing email login keeps working. Frontend replaces `apps/web/app/(auth)/consumer/login/page.tsx` with a centered single-card flow that swaps content per step using local state — no nested routes. Mocked SMS prints the code to the API stdout and returns it in the response in non-prod so the dev-mode UI auto-fills.

**Tech Stack:** NestJS 11, Prisma, Postgres, JWT (existing). Next.js 16 App Router, React 19, Tailwind 4. No new runtime deps.

**Spec:** `DOcs/superpowers/specs/2026-05-03-consumer-login-onboarding-design.md`

**Per-task gating:** Per the user's standing rule, **never run `git commit`** without explicit user approval. Each task ends with a "Halt — request commit permission" step instead of an auto-commit. The implementer leaves changes in the working tree and reports.

---

## File Structure

**Backend (apps/api):**

- Modify: `apps/api/prisma/schema.prisma` — add `OtpCode` model, set `User.email` and `User.name` and `User.passwordHash` to nullable, add `User.phoneVerified` boolean.
- Create: `apps/api/prisma/migrations/20260503000000_add_otp_codes_and_phone_user/migration.sql`
- Create: `apps/api/src/auth/otp.service.ts` — request + verify
- Create: `apps/api/src/auth/dto/otp-request.dto.ts`
- Create: `apps/api/src/auth/dto/otp-verify.dto.ts`
- Create: `apps/api/src/auth/dto/profile-complete.dto.ts`
- Modify: `apps/api/src/auth/auth.controller.ts` — add three endpoints
- Modify: `apps/api/src/auth/auth.module.ts` — register `OtpService`
- Modify: `apps/api/src/auth/auth.service.ts` — expose `issueTokensForUser` for OtpService to call

**Frontend (apps/web):**

- Move: `apps/web/app/(auth)/consumer/login/page.tsx` → `apps/web/app/(auth)/consumer/login/email/page.tsx` (preserve existing email/password form)
- Create: `apps/web/app/(auth)/consumer/login/page.tsx` — orchestrator (step 1/2/3)
- Create: `apps/web/app/(auth)/consumer/login/login-shell.tsx` — brand panel + card + step dots + footer
- Create: `apps/web/app/(auth)/consumer/login/steps/phone-step.tsx`
- Create: `apps/web/app/(auth)/consumer/login/steps/otp-step.tsx`
- Create: `apps/web/app/(auth)/consumer/login/steps/profile-step.tsx`
- Create: `apps/web/app/(auth)/consumer/login/hooks/use-otp-countdown.ts`
- Create: `apps/web/app/(auth)/consumer/login/hooks/use-login-flow.ts`
- Create: `apps/web/app/(auth)/consumer/login/api.ts` — typed wrappers for the three new endpoints
- Modify: `apps/web/app/(consumer)/consumer/dashboard/page.tsx` — add "Complete your profile" banner (only when `name` or `cityName` is missing)
- Replace: `apps/web/app/(consumer)/consumer/signup/page.tsx` (or `apps/web/app/(auth)/consumer/signup/page.tsx`, whichever exists) — single-line redirect to `/consumer/login`

**Tests:**

- Create: `apps/api/src/auth/otp.service.spec.ts`
- Create: `apps/web/e2e/consumer-login.spec.ts`

---

## Task 1: Schema migration — `OtpCode` table + nullable user fields

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260503000000_add_otp_codes_and_phone_user/migration.sql`

The current `User` model requires `email`, `name`, and `passwordHash`. Phone-first users have none of these initially. Make all three nullable, add a `phoneVerified Boolean @default(false)`, and add the `OtpCode` model.

- [ ] **Step 1: Update `apps/api/prisma/schema.prisma`**

Locate the `User` model (line 94) and change three fields:

```prisma
  name               String?
  email              String?     @unique
  passwordHash       String?
```

Add a new field directly after `phone`:

```prisma
  phoneVerified      Boolean     @default(false)
```

Append a new model at the end of the file (after the existing models):

```prisma
model OtpCode {
  id         String   @id @default(cuid())
  phone      String   @db.VarChar(20)
  code       String   @db.VarChar(6)
  expiresAt  DateTime
  attempts   Int      @default(0)
  consumed   Boolean  @default(false)
  createdAt  DateTime @default(now())

  @@index([phone, createdAt])
}
```

- [ ] **Step 2: Generate the migration SQL**

Run from `apps/api/`:

```
pnpm prisma migrate dev --name add_otp_codes_and_phone_user --create-only
```

Expected: a new directory `apps/api/prisma/migrations/<timestamp>_add_otp_codes_and_phone_user/` with `migration.sql`. Inspect the generated SQL — it should `ALTER TABLE "User"` to make `name`, `email`, `passwordHash` nullable, add `phoneVerified BOOLEAN NOT NULL DEFAULT false`, and `CREATE TABLE "OtpCode"` with the index.

If the timestamp differs from `20260503000000`, that's fine — Prisma's timestamp is what matters.

- [ ] **Step 3: Apply the migration to the local DB**

Run from `apps/api/`:

```
pnpm prisma migrate dev
```

Expected: "Database is in sync with your schema."

- [ ] **Step 4: Regenerate the Prisma client**

Run from `apps/api/`:

```
pnpm prisma:generate
```

- [ ] **Step 5: Typecheck**

Run from repo root:

```
pnpm typecheck
```

Expected: PASS. If the change to `User.email` / `User.name` / `User.passwordHash` from `string` to `string | null` breaks call sites elsewhere in the API, fix each by adding a non-null assertion (`user.email!`) or a guard at the call site. Common offenders: `auth.service.ts` (audit log calls that pass `user.email`), `users.service.ts`. Do not change behavior — only update types.

- [ ] **Step 6: Halt — request commit permission**

Tell the user: "Task 1 complete — schema migration applied locally. Want me to commit `prisma/schema.prisma` and the new migration directory?"

---

## Task 2: OTP DTOs

**Files:**
- Create: `apps/api/src/auth/dto/otp-request.dto.ts`
- Create: `apps/api/src/auth/dto/otp-verify.dto.ts`
- Create: `apps/api/src/auth/dto/profile-complete.dto.ts`

- [ ] **Step 1: Write `otp-request.dto.ts`**

```ts
// apps/api/src/auth/dto/otp-request.dto.ts
import { IsString, Matches } from 'class-validator';

export class OtpRequestDto {
  // Accept either +92XXXXXXXXXX or 03XXXXXXXXX; the service normalises to +92.
  @IsString()
  @Matches(/^(\+?92|0)?3\d{9}$/, { message: 'Invalid Pakistan phone number' })
  phone!: string;
}
```

- [ ] **Step 2: Write `otp-verify.dto.ts`**

```ts
// apps/api/src/auth/dto/otp-verify.dto.ts
import { IsString, Length, Matches } from 'class-validator';

export class OtpVerifyDto {
  @IsString()
  @Matches(/^(\+?92|0)?3\d{9}$/)
  phone!: string;

  @IsString()
  @Length(4, 4, { message: 'Code must be 4 digits' })
  @Matches(/^\d{4}$/, { message: 'Code must be 4 digits' })
  code!: string;
}
```

- [ ] **Step 3: Write `profile-complete.dto.ts`**

```ts
// apps/api/src/auth/dto/profile-complete.dto.ts
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ProfileCompleteDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  cityName?: string;
}
```

Note: the spec uses `cityId` but the existing `User` model stores city as a string (`city String?`). We use `cityName` here and write to `User.city` directly — consistent with the existing data shape.

- [ ] **Step 4: Typecheck**

Run from repo root:

```
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 5: Halt — request commit permission**

---

## Task 3: OtpService — request + verify

**Files:**
- Create: `apps/api/src/auth/otp.service.ts`
- Modify: `apps/api/src/auth/auth.service.ts` — add a public `issueTokensForUser` method
- Modify: `apps/api/src/auth/auth.module.ts` — register `OtpService`

The OtpService owns generation, storage, normalization, rate limiting, verification, and (mocked) dispatch. Issuing JWTs stays in `AuthService`; we expose a thin public wrapper for OtpService to call.

- [ ] **Step 1: Add `issueTokensForUser` to `AuthService`**

Open `apps/api/src/auth/auth.service.ts`. Locate the existing `private async issueTokens(payload: JwtUser): Promise<AuthTokens>` (around line 221). Below it, add a public wrapper that takes a User row and returns the same `{ accessToken, refreshToken, user }` shape that login returns, plus persists the hashed refresh token (matching the existing login behavior at lines 65-68):

```ts
async issueTokensForUser(user: { id: string; email: string | null; role: UserRole; name: string | null }) {
  const payload: JwtUser = {
    sub: user.id,
    email: user.email ?? '',
    role: mapPrismaRoleToShared(user.role),
  };
  const tokens = await this.issueTokens(payload);
  await this.prisma.user.update({
    where: { id: user.id },
    data: { hashedRefreshToken: await hash(tokens.refreshToken, 10) },
  });
  return {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: payload.role,
    },
  };
}
```

If `UserRole` is not already imported in this file, add `import { UserRole } from '@prisma/client';` at the top.

- [ ] **Step 2: Write `OtpService`**

```ts
// apps/api/src/auth/otp.service.ts
import { BadRequestException, Injectable, UnauthorizedException, GoneException, HttpException, HttpStatus } from '@nestjs/common';
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

    // Cooldown: 1 request per 30s per phone
    const lastRecent = await this.prisma.otpCode.findFirst({
      where: { phone, createdAt: { gte: new Date(Date.now() - PER_PHONE_COOLDOWN_MS) } },
      orderBy: { createdAt: 'desc' },
    });
    if (lastRecent) {
      const retryAfterSec = Math.ceil(
        (PER_PHONE_COOLDOWN_MS - (Date.now() - lastRecent.createdAt.getTime())) / 1000,
      );
      throw new HttpException(
        { error: 'too_many_requests', retryAfterSec },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Hourly cap: 5 per phone per hour
    const hourlyCount = await this.prisma.otpCode.count({
      where: { phone, createdAt: { gte: new Date(Date.now() - HOUR_MS) } },
    });
    if (hourlyCount >= PER_PHONE_HOURLY_LIMIT) {
      throw new HttpException(
        { error: 'too_many_requests', retryAfterSec: 3600 },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Invalidate any open OTPs for this phone
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
    // eslint-disable-next-line no-console
    console.log('[OTP MOCK] phone=%s code=%s', phone, code);
  }
}
```

- [ ] **Step 3: Register `OtpService` in `auth.module.ts`**

Open `apps/api/src/auth/auth.module.ts`. Add:

```ts
import { OtpService } from './otp.service';
```

and add `OtpService` to the `providers` array. If the module exports providers, add it to `exports` too.

- [ ] **Step 4: Typecheck**

Run from repo root:

```
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 5: Halt — request commit permission**

---

## Task 4: OtpService unit tests

**Files:**
- Create: `apps/api/src/auth/otp.service.spec.ts`

The API has Jest (`pnpm test` from `apps/api/`). Cover the rate-limit, expiry, invalid-code, attempt-lockout, and successful-verify paths.

- [ ] **Step 1: Write the test file**

```ts
// apps/api/src/auth/otp.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { HttpException, HttpStatus, UnauthorizedException } from '@nestjs/common';
import { OtpService } from './otp.service';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';

type Fake<T> = { [K in keyof T]: jest.Mock };

function makePrisma(): Fake<{ otpCode: Record<string, any>; user: Record<string, any> }> & {
  otpCode: Fake<{
    findFirst: any; count: any; create: any; update: any; updateMany: any;
  }>;
  user: Fake<{ findFirst: any; create: any; update: any }>;
} {
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
  } as any;
}

describe('OtpService', () => {
  let service: OtpService;
  let prisma: ReturnType<typeof makePrisma>;
  let auth: { issueTokensForUser: jest.Mock };

  beforeEach(async () => {
    prisma = makePrisma();
    auth = { issueTokensForUser: jest.fn().mockResolvedValue({ accessToken: 'a', refreshToken: 'r', user: {} }) };
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

    it('normalises 03XXXXXXXXX → +923XXXXXXXXX', async () => {
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
      expect(r.devCode).toMatch(/^\d{4}$/);
    });

    it('429s when called within 30s of last request', async () => {
      prisma.otpCode.findFirst.mockResolvedValue({ createdAt: new Date(Date.now() - 5000) });
      await expect(service.request('+923001234567')).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
      try { await service.request('+923001234567'); } catch (e: any) {
        expect(e.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      }
    });

    it('429s when phone has hit hourly cap', async () => {
      prisma.otpCode.findFirst.mockResolvedValue(null);
      prisma.otpCode.count.mockResolvedValue(5);
      try { await service.request('+923001234567'); fail('should throw'); } catch (e: any) {
        expect(e.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
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
      try { await service.verify('+923001234567', '1234'); fail('should throw'); } catch (e: any) {
        expect(e.getStatus()).toBe(HttpStatus.GONE);
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
      prisma.user.create.mockResolvedValue({ id: 'u1', phone: '+923001234567', phoneVerified: true, role: 'consumer', name: null, email: null });
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
      prisma.user.findFirst.mockResolvedValue({ id: 'u1', phone: '+923001234567', phoneVerified: true, role: 'consumer', name: 'Ali', email: null });
      const r = await service.verify('+923001234567', '1234');
      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(r.isNewUser).toBe(false);
    });
  });
});
```

- [ ] **Step 2: Run the test**

Run from `apps/api/`:

```
pnpm test -- --testPathPattern=otp.service
```

Expected: all tests pass. If a test fails because the prisma mock `update` was called twice (e.g., on both wrong-code increment and the verifications mark-consumed), tighten the assertion to the specific call (`expect(prisma.otpCode.update).toHaveBeenCalledWith(...)` rather than `toHaveBeenCalledTimes`).

- [ ] **Step 3: Halt — request commit permission**

---

## Task 5: Auth controller endpoints

**Files:**
- Modify: `apps/api/src/auth/auth.controller.ts`

- [ ] **Step 1: Read the existing controller**

Open `apps/api/src/auth/auth.controller.ts`. Note the existing imports of guards (`JwtAuthGuard` if present) and the existing `@Post('login')` and `@Post('signup')` decorators. You need to add three endpoints below them.

- [ ] **Step 2: Add the three new endpoints**

Add these imports at the top:

```ts
import { OtpService } from './otp.service';
import { OtpRequestDto } from './dto/otp-request.dto';
import { OtpVerifyDto } from './dto/otp-verify.dto';
import { ProfileCompleteDto } from './dto/profile-complete.dto';
import { Public } from './decorators/public.decorator'; // if a Public decorator exists; otherwise omit
```

Inject `OtpService` in the constructor next to `AuthService`.

Add inside the controller class:

```ts
@Public()
@Post('otp/request')
otpRequest(@Body() dto: OtpRequestDto) {
  return this.otpService.request(dto.phone);
}

@Public()
@Post('otp/verify')
otpVerify(@Body() dto: OtpVerifyDto) {
  return this.otpService.verify(dto.phone, dto.code);
}

@Post('profile/complete')
async profileComplete(@CurrentUser() user: JwtUser, @Body() dto: ProfileCompleteDto) {
  return this.authService.completeProfile(user.sub, dto);
}
```

If `@Public()` does not exist in your codebase, drop it — the existing `JwtAuthGuard` is global, and you'll need to either bypass it for OTP endpoints or list them in a public-route allowlist. Check whether `JwtAuthGuard` is registered globally in `app.module.ts` or via `APP_GUARD`. If it is and `@Public()` doesn't exist, create a minimal one:

```ts
// apps/api/src/auth/decorators/public.decorator.ts
import { SetMetadata } from '@nestjs/common';
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
```

…and update `JwtAuthGuard.canActivate` to short-circuit when the metadata flag is set. (Inspect `apps/api/src/auth/jwt-auth.guard.ts` first; if the existing login/signup endpoints are already accessible without auth, the guard already supports a public mechanism — use whatever pattern exists.)

If `@CurrentUser()` decorator doesn't exist either, use the standard NestJS `@Req()` and read `req.user.sub` from the JWT payload. Match the existing pattern in `auth.controller.ts` for `@Post('logout')` if it exists.

- [ ] **Step 3: Add `completeProfile` to `AuthService`**

Open `apps/api/src/auth/auth.service.ts`. Add a method:

```ts
async completeProfile(userId: string, dto: { name: string; cityName?: string }) {
  const user = await this.prisma.user.update({
    where: { id: userId },
    data: {
      name: dto.name,
      ...(dto.cityName ? { city: dto.cityName } : {}),
    },
  });
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    city: user.city,
  };
}
```

- [ ] **Step 4: Typecheck**

Run from repo root:

```
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 5: Manual smoke against the API**

Start the API: `pnpm dev:api`. From a separate terminal:

```
curl -s -X POST http://localhost:4000/api/auth/otp/request \
  -H 'Content-Type: application/json' \
  -d '{"phone":"03001234567"}'
```

Expected: `{"sent":true,"devCode":"1234"}` (4-digit code may differ). Capture the code, then:

```
curl -s -X POST http://localhost:4000/api/auth/otp/verify \
  -H 'Content-Type: application/json' \
  -d '{"phone":"03001234567","code":"<DEV_CODE>"}'
```

Expected: `{"accessToken":"...","refreshToken":"...","user":{...},"isNewUser":true}`. Run it again with a fresh OTP request — `isNewUser` should be `false` the second time.

- [ ] **Step 6: Halt — request commit permission**

---

## Task 6: Frontend — typed API wrappers

**Files:**
- Create: `apps/web/app/(auth)/consumer/login/api.ts`

- [ ] **Step 1: Write the API helper**

```ts
// apps/web/app/(auth)/consumer/login/api.ts
import { apiClient } from '@/lib/api-client';

export type OtpRequestResponse = { sent: true; devCode?: string };
export type OtpVerifyResponse = {
  accessToken: string;
  refreshToken: string;
  user: { id: string; name: string | null; email: string | null; role: string };
  isNewUser: boolean;
};
export type ProfileCompleteResponse = {
  id: string;
  name: string | null;
  email: string | null;
  city: string | null;
  role: string;
};

export function requestOtp(phone: string) {
  return apiClient.post<OtpRequestResponse>('/auth/otp/request', { phone });
}

export function verifyOtp(phone: string, code: string) {
  return apiClient.post<OtpVerifyResponse>('/auth/otp/verify', { phone, code });
}

export function completeProfile(name: string, cityName?: string) {
  return apiClient.post<ProfileCompleteResponse>('/auth/profile/complete', {
    name,
    ...(cityName ? { cityName } : {}),
  });
}
```

- [ ] **Step 2: Typecheck**

```
pnpm typecheck
```

- [ ] **Step 3: Halt — request commit permission**

---

## Task 7: Frontend — `use-otp-countdown` hook

**Files:**
- Create: `apps/web/app/(auth)/consumer/login/hooks/use-otp-countdown.ts`

- [ ] **Step 1: Write the hook**

```ts
// apps/web/app/(auth)/consumer/login/hooks/use-otp-countdown.ts
'use client';
import { useCallback, useEffect, useState } from 'react';

const DEFAULT_SECONDS = 30;

export function useOtpCountdown(initialSeconds: number = DEFAULT_SECONDS) {
  const [secondsLeft, setSecondsLeft] = useState(initialSeconds);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [secondsLeft]);

  const reset = useCallback((s: number = DEFAULT_SECONDS) => setSecondsLeft(s), []);

  const formatted = `${Math.floor(secondsLeft / 60)
    .toString()
    .padStart(1, '0')}:${(secondsLeft % 60).toString().padStart(2, '0')}`;

  return { secondsLeft, formatted, canResend: secondsLeft <= 0, reset };
}
```

- [ ] **Step 2: Typecheck**

```
pnpm typecheck
```

- [ ] **Step 3: Halt — request commit permission**

---

## Task 8: Frontend — `use-login-flow` hook

**Files:**
- Create: `apps/web/app/(auth)/consumer/login/hooks/use-login-flow.ts`

This hook owns the entire login state machine — phone, otp, name, city, current step, error, loading. It calls `requestOtp` / `verifyOtp` / `completeProfile`. It also writes tokens to localStorage on successful verify, exactly the way the existing email login does (`wusuq_access_token`, `wusuq_refresh_token`, `wusuq_user`).

- [ ] **Step 1: Write the hook**

```ts
// apps/web/app/(auth)/consumer/login/hooks/use-login-flow.ts
'use client';
import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { requestOtp, verifyOtp, completeProfile, type OtpVerifyResponse } from '../api';

export type LoginStep = 'phone' | 'otp' | 'profile';

export function useLoginFlow() {
  const router = useRouter();
  const [step, setStep] = useState<LoginStep>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [name, setName] = useState('');
  const [cityName, setCityName] = useState('');
  const [devCode, setDevCode] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function persist(tokens: OtpVerifyResponse) {
    try {
      localStorage.setItem('wusuq_access_token', tokens.accessToken);
      localStorage.setItem('wusuq_refresh_token', tokens.refreshToken);
      localStorage.setItem('wusuq_user', JSON.stringify(tokens.user));
    } catch {
      // localStorage unavailable
    }
  }

  const sendOtp = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const r = await requestOtp(phone);
      setDevCode(r.devCode);
      setOtp(r.devCode ?? '');
      setStep('otp');
    } catch (e) {
      const msg =
        (e as { response?: { error?: string; retryAfterSec?: number } })?.response?.error ??
        (e instanceof Error ? e.message : 'Failed to send code');
      setError(msg === 'too_many_requests' ? 'Too many requests. Try again shortly.' : msg);
    } finally {
      setLoading(false);
    }
  }, [phone]);

  const submitOtp = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const r = await verifyOtp(phone, otp);
      persist(r);
      if (r.isNewUser) {
        setStep('profile');
      } else {
        router.replace('/consumer/dashboard');
      }
    } catch (e) {
      const msg = (e as { response?: { error?: string } })?.response?.error;
      if (msg === 'code_expired') setError('Code expired. Tap Resend.');
      else if (msg === 'too_many_attempts') setError('Too many wrong attempts. Tap Resend.');
      else setError('Wrong code. Try again.');
    } finally {
      setLoading(false);
    }
  }, [phone, otp, router]);

  const submitProfile = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      await completeProfile(name, cityName || undefined);
    } catch {
      // Best-effort: even on failure, account exists; let the user into the dashboard.
    } finally {
      setLoading(false);
      router.replace('/consumer/dashboard');
    }
  }, [name, cityName, router]);

  const skipProfile = useCallback(() => {
    router.replace('/consumer/dashboard');
  }, [router]);

  const changePhone = useCallback(() => {
    setStep('phone');
    setOtp('');
    setError(null);
  }, []);

  return {
    step, phone, setPhone, otp, setOtp, name, setName, cityName, setCityName,
    error, loading, devCode,
    sendOtp, submitOtp, submitProfile, skipProfile, changePhone,
  };
}
```

- [ ] **Step 2: Typecheck**

```
pnpm typecheck
```

- [ ] **Step 3: Halt — request commit permission**

---

## Task 9: Frontend — `phone-step` component

**Files:**
- Create: `apps/web/app/(auth)/consumer/login/steps/phone-step.tsx`

- [ ] **Step 1: Write the component**

```tsx
// apps/web/app/(auth)/consumer/login/steps/phone-step.tsx
'use client';
import Link from 'next/link';

const PK_REGEX = /^(\+?92|0)?3\d{9}$/;

export function PhoneStep({
  phone,
  onPhoneChange,
  onSubmit,
  onMockedSocial,
  loading,
  error,
}: {
  phone: string;
  onPhoneChange: (v: string) => void;
  onSubmit: () => void;
  onMockedSocial: (provider: 'google' | 'apple') => void;
  loading: boolean;
  error: string | null;
}) {
  const valid = PK_REGEX.test(phone);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">Welcome back</h2>
        <p className="mt-1 text-sm text-slate-500">Enter your phone number to continue</p>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-slate-700">Phone number</span>
        <div className="flex items-stretch gap-2">
          <span className="flex items-center rounded-xl border border-border-soft bg-surface-muted/50 px-3 text-sm font-medium text-slate-700">+92</span>
          <input
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => onPhoneChange(e.target.value)}
            placeholder="300 1234567"
            className="block w-full rounded-xl border-0 px-3.5 py-2.5 text-slate-900 shadow-sm ring-1 ring-inset ring-border-soft placeholder:text-slate-400 focus:ring-2 focus:ring-brand-500/50"
            autoFocus
          />
        </div>
        {error ? <span className="text-xs text-rose-600">{error}</span> : null}
      </label>

      <button
        type="button"
        onClick={onSubmit}
        disabled={!valid || loading}
        className="rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-40"
      >
        {loading ? 'Sending…' : 'Continue →'}
      </button>

      <div className="flex items-center gap-3 text-xs text-slate-400">
        <span className="h-px flex-1 bg-border-soft" />
        or continue with
        <span className="h-px flex-1 bg-border-soft" />
      </div>

      <button
        type="button"
        onClick={() => onMockedSocial('google')}
        className="flex items-center justify-center gap-2 rounded-xl border border-border-soft bg-surface px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-surface-muted"
      >
        <span className="font-bold text-[#4285F4]">G</span> Continue with Google
      </button>
      <button
        type="button"
        onClick={() => onMockedSocial('apple')}
        className="flex items-center justify-center gap-2 rounded-xl border border-border-soft bg-surface px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-surface-muted"
      >
         Continue with Apple
      </button>

      <Link href="/consumer/login/email" className="text-center text-xs text-brand-600 hover:underline">
        Use email instead
      </Link>

      <p className="text-center text-[11px] text-slate-400">
        By continuing, you agree to our Terms and Privacy.
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```
pnpm typecheck
```

- [ ] **Step 3: Halt — request commit permission**

---

## Task 10: Frontend — `otp-step` component

**Files:**
- Create: `apps/web/app/(auth)/consumer/login/steps/otp-step.tsx`

- [ ] **Step 1: Write the component**

```tsx
// apps/web/app/(auth)/consumer/login/steps/otp-step.tsx
'use client';
import { useEffect, useRef } from 'react';
import { useOtpCountdown } from '../hooks/use-otp-countdown';

export function OtpStep({
  phone,
  otp,
  onOtpChange,
  onSubmit,
  onResend,
  onChangePhone,
  loading,
  error,
}: {
  phone: string;
  otp: string;
  onOtpChange: (v: string) => void;
  onSubmit: () => void;
  onResend: () => void;
  onChangePhone: () => void;
  loading: boolean;
  error: string | null;
}) {
  const { formatted, canResend, reset } = useOtpCountdown(30);
  const refs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ];
  const digits = (otp || '').padEnd(4, ' ').slice(0, 4).split('');

  useEffect(() => {
    refs[0].current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setDigit(i: number, v: string) {
    const sanitized = v.replace(/\D/g, '');
    if (sanitized.length === 4) {
      onOtpChange(sanitized);
      refs[3].current?.focus();
      return;
    }
    const ch = sanitized.slice(-1);
    const next = digits.slice();
    next[i] = ch || ' ';
    const joined = next.join('').replace(/\s/g, '');
    onOtpChange(joined);
    if (ch && i < 3) refs[i + 1].current?.focus();
  }

  function onKey(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[i].trim() && i > 0) {
      refs[i - 1].current?.focus();
    } else if (e.key === 'Enter' && otp.length === 4) {
      onSubmit();
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">Verify your number</h2>
        <p className="mt-1 text-sm text-slate-500">Enter the 4-digit code sent to {phone}</p>
      </div>

      <div className="flex justify-center gap-3">
        {[0, 1, 2, 3].map((i) => (
          <input
            key={i}
            ref={refs[i]}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={4}
            value={digits[i].trim()}
            onChange={(e) => setDigit(i, e.target.value)}
            onKeyDown={(e) => onKey(i, e)}
            className="h-14 w-12 rounded-xl border-0 text-center text-2xl font-semibold text-slate-900 shadow-sm ring-1 ring-inset ring-border-soft focus:ring-2 focus:ring-brand-500/50"
          />
        ))}
      </div>

      {error ? <p className="text-center text-xs text-rose-600">{error}</p> : null}

      <button
        type="button"
        onClick={onSubmit}
        disabled={otp.length !== 4 || loading}
        className="rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-40"
      >
        {loading ? 'Verifying…' : 'Verify →'}
      </button>

      <div className="flex justify-between text-xs text-slate-500">
        <button
          type="button"
          disabled={!canResend}
          onClick={() => { onResend(); reset(); }}
          className="text-brand-600 hover:underline disabled:text-slate-400 disabled:no-underline"
        >
          {canResend ? 'Resend code' : `Resend in ${formatted}`}
        </button>
        <button type="button" onClick={onChangePhone} className="hover:underline">
          Change number
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```
pnpm typecheck
```

- [ ] **Step 3: Halt — request commit permission**

---

## Task 11: Frontend — `profile-step` component

**Files:**
- Create: `apps/web/app/(auth)/consumer/login/steps/profile-step.tsx`

- [ ] **Step 1: Write the component**

The city field uses the existing `apiClient.get('/geo/cities')` data, rendered via the existing `Select` primitive at `apps/web/components/ui/select.tsx`.

```tsx
// apps/web/app/(auth)/consumer/login/steps/profile-step.tsx
'use client';
import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { Select } from '@/components/ui/select';

type CityRow = { id: string; name: string; district?: string; province?: string };

export function ProfileStep({
  name,
  onNameChange,
  cityName,
  onCityChange,
  onSubmit,
  onSkip,
  loading,
}: {
  name: string;
  onNameChange: (v: string) => void;
  cityName: string;
  onCityChange: (v: string) => void;
  onSubmit: () => void;
  onSkip: () => void;
  loading: boolean;
}) {
  const [cities, setCities] = useState<CityRow[]>([]);

  useEffect(() => {
    apiClient
      .get<CityRow[]>('/geo/cities')
      .then((rows) => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setCities(rows);
      })
      .catch(() => {
        // city is optional — silent fall-through
      });
  }, []);

  const cityOptions = cities.map((c) => ({
    value: c.name,
    label: c.name,
    description: [c.district, c.province].filter(Boolean).join(' · '),
  }));

  const valid = name.trim().length >= 2;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">Tell us about you</h2>
        <p className="mt-1 text-sm text-slate-500">This helps us serve you better.</p>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-slate-700">Full name *</span>
        <input
          type="text"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="Ali Raza"
          className="rounded-xl border-0 px-3.5 py-2.5 text-slate-900 shadow-sm ring-1 ring-inset ring-border-soft focus:ring-2 focus:ring-brand-500/50"
          autoFocus
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-slate-700">City (optional)</span>
        <Select
          value={cityName}
          onChange={onCityChange}
          options={cityOptions}
          placeholder="Search your city…"
          searchPlaceholder="Search city…"
          allowClear
          ariaLabel="City"
        />
      </label>

      <button
        type="button"
        onClick={onSubmit}
        disabled={!valid || loading}
        className="rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-40"
      >
        {loading ? 'Saving…' : 'Continue to dashboard →'}
      </button>

      <button
        type="button"
        onClick={onSkip}
        className="text-center text-xs text-slate-500 hover:underline"
      >
        I&apos;ll do this later
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```
pnpm typecheck
```

- [ ] **Step 3: Halt — request commit permission**

---

## Task 12: Frontend — `login-shell` component

**Files:**
- Create: `apps/web/app/(auth)/consumer/login/login-shell.tsx`

- [ ] **Step 1: Write the shell**

```tsx
// apps/web/app/(auth)/consumer/login/login-shell.tsx
'use client';
import type { ReactNode } from 'react';
import { Building2, ShieldCheck, Clock4, HeartHandshake } from 'lucide-react';

const TRUST_BADGES = [
  { icon: <Building2 className="h-4 w-4" />, title: 'Trusted by Thousands', subtitle: 'Across Pakistan' },
  { icon: <ShieldCheck className="h-4 w-4" />, title: '100% Secure', subtitle: 'Your data is protected' },
  { icon: <Clock4 className="h-4 w-4" />, title: 'Fast & Reliable', subtitle: 'We value your time' },
  { icon: <HeartHandshake className="h-4 w-4" />, title: 'Help When You Need', subtitle: 'Our support is here' },
];

export function LoginShell({
  step,
  totalSteps,
  children,
}: {
  step: number;
  totalSteps: number;
  children: ReactNode;
}) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-slate-50 px-4 py-10">
      <div className="flex items-center gap-2">
        {Array.from({ length: totalSteps }).map((_, i) => (
          <span
            key={i}
            className={`h-2 w-2 rounded-full transition-colors ${
              i + 1 === step ? 'bg-brand-600' : i + 1 < step ? 'bg-brand-300' : 'bg-slate-300'
            }`}
          />
        ))}
      </div>

      <section className="w-full max-w-md rounded-2xl border border-border-soft bg-surface p-6 shadow-elev-1 sm:p-8">
        {children}
      </section>

      <ul className="grid w-full max-w-3xl grid-cols-2 gap-3 sm:grid-cols-4">
        {TRUST_BADGES.map((b) => (
          <li
            key={b.title}
            className="flex items-center gap-2 rounded-xl border border-border-soft bg-surface p-3 text-left"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-500">
              {b.icon}
            </span>
            <div>
              <p className="text-xs font-semibold text-slate-900">{b.title}</p>
              <p className="text-[11px] text-slate-500">{b.subtitle}</p>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
```

- [ ] **Step 2: Typecheck**

```
pnpm typecheck
```

- [ ] **Step 3: Halt — request commit permission**

---

## Task 13: Frontend — orchestrator + email move

**Files:**
- Move (and preserve): existing `apps/web/app/(auth)/consumer/login/page.tsx` → `apps/web/app/(auth)/consumer/login/email/page.tsx`
- Create (replaces the moved file): `apps/web/app/(auth)/consumer/login/page.tsx`

- [ ] **Step 1: Read the existing email/password login**

Open `apps/web/app/(auth)/consumer/login/page.tsx`. Confirm it is a client component that posts email + password to `/api/auth/login`. We are preserving it verbatim — just moving the file.

- [ ] **Step 2: Move the file**

```
mkdir -p apps/web/app/\(auth\)/consumer/login/email
git mv apps/web/app/\(auth\)/consumer/login/page.tsx apps/web/app/\(auth\)/consumer/login/email/page.tsx
```

If `git mv` fails because the file isn't tracked yet (e.g., recent edits), do a plain `mv` instead.

- [ ] **Step 3: Write the new orchestrator at the original path**

```tsx
// apps/web/app/(auth)/consumer/login/page.tsx
'use client';
import { useState } from 'react';
import { LoginShell } from './login-shell';
import { PhoneStep } from './steps/phone-step';
import { OtpStep } from './steps/otp-step';
import { ProfileStep } from './steps/profile-step';
import { useLoginFlow } from './hooks/use-login-flow';

const STEP_INDEX = { phone: 1, otp: 2, profile: 3 } as const;

export default function ConsumerLoginPage() {
  const f = useLoginFlow();
  const [toast, setToast] = useState<string | null>(null);

  function handleMockedSocial(provider: 'google' | 'apple') {
    setToast(`${provider === 'google' ? 'Google' : 'Apple'} login coming soon`);
    setTimeout(() => setToast(null), 2500);
  }

  return (
    <>
      <LoginShell step={STEP_INDEX[f.step]} totalSteps={3}>
        {f.step === 'phone' ? (
          <PhoneStep
            phone={f.phone}
            onPhoneChange={f.setPhone}
            onSubmit={f.sendOtp}
            onMockedSocial={handleMockedSocial}
            loading={f.loading}
            error={f.error}
          />
        ) : null}
        {f.step === 'otp' ? (
          <OtpStep
            phone={f.phone}
            otp={f.otp}
            onOtpChange={f.setOtp}
            onSubmit={f.submitOtp}
            onResend={f.sendOtp}
            onChangePhone={f.changePhone}
            loading={f.loading}
            error={f.error}
          />
        ) : null}
        {f.step === 'profile' ? (
          <ProfileStep
            name={f.name}
            onNameChange={f.setName}
            cityName={f.cityName}
            onCityChange={f.setCityName}
            onSubmit={f.submitProfile}
            onSkip={f.skipProfile}
            loading={f.loading}
          />
        ) : null}
      </LoginShell>
      {toast ? (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-xl bg-slate-900 px-4 py-2 text-sm text-white shadow-elev-2">
          {toast}
        </div>
      ) : null}
    </>
  );
}
```

- [ ] **Step 4: Typecheck**

```
pnpm typecheck
```

- [ ] **Step 5: Halt — request commit permission**

---

## Task 14: Replace `/consumer/signup` with a redirect

**Files:**
- Modify (or replace): `apps/web/app/(auth)/consumer/signup/page.tsx`

- [ ] **Step 1: Replace the file with a single-line redirect**

```tsx
// apps/web/app/(auth)/consumer/signup/page.tsx
import { redirect } from 'next/navigation';

export default function Page() {
  redirect('/consumer/login');
}
```

- [ ] **Step 2: Typecheck**

```
pnpm typecheck
```

- [ ] **Step 3: Halt — request commit permission**

---

## Task 15: Dashboard "complete your profile" banner

**Files:**
- Modify: `apps/web/app/(consumer)/consumer/dashboard/page.tsx`

The banner shows whenever `name` or `city` is missing on the localStorage user. Tapping it deep-links to `/consumer/profile` (assume that route exists; if not, link to `/consumer/login` to redirect through the flow). Confirm the route at implementation time and adjust.

- [ ] **Step 1: Read the existing dashboard**

Open `apps/web/app/(consumer)/consumer/dashboard/page.tsx`. Note where the page heading lives — the banner goes directly under the heading, before any other content.

- [ ] **Step 2: Add a banner client component**

Create `apps/web/app/(consumer)/consumer/dashboard/profile-completion-banner.tsx`:

```tsx
'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { UserCircle2, X } from 'lucide-react';

export function ProfileCompletionBanner() {
  const [missing, setMissing] = useState<{ name: boolean; city: boolean } | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('wusuq_user');
      if (!raw) return;
      const u = JSON.parse(raw) as { name?: string | null; city?: string | null };
      const m = { name: !u.name, city: !u.city };
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (m.name || m.city) setMissing(m);
    } catch {
      // localStorage unavailable
    }
  }, []);

  if (!missing || dismissed) return null;

  const parts: string[] = [];
  if (missing.name) parts.push('your name');
  if (missing.city) parts.push('your city');
  const what = parts.join(' and ');

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <div className="flex items-center gap-3">
        <UserCircle2 className="h-5 w-5 shrink-0" />
        <span>
          Complete your profile — add {what} so we can serve you better.{' '}
          <Link href="/consumer/profile" className="font-semibold underline">
            Complete now
          </Link>
        </span>
      </div>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="text-amber-700 hover:text-amber-900"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Mount the banner at the top of the dashboard page**

Open `apps/web/app/(consumer)/consumer/dashboard/page.tsx`. Add at the top:

```tsx
import { ProfileCompletionBanner } from './profile-completion-banner';
```

…and render `<ProfileCompletionBanner />` directly under the page heading. Keep all existing content untouched.

- [ ] **Step 4: Typecheck**

```
pnpm typecheck
```

- [ ] **Step 5: Halt — request commit permission**

---

## Task 16: Manual smoke test (full flow)

No code changes — just walk it.

- [ ] **Step 1: Start both apps**

```
pnpm dev
```

- [ ] **Step 2: Navigate to `/consumer/login`**

Confirm: 3 progress dots, brand card, phone input prefixed `+92`, Google + Apple buttons, "Use email instead" link, trust-badge footer.

- [ ] **Step 3: Tap Google or Apple**

Confirm: a toast appears saying "Google login coming soon" / "Apple login coming soon". No navigation.

- [ ] **Step 4: Enter `03001234567` and tap Continue**

Confirm: progress dot 2 lights up, OTP step appears, the 4-digit input is autofilled with the dev code (since `NODE_ENV !== 'production'`).

Confirm in the API server log (`pnpm dev:api` terminal): a line like `[OTP MOCK] phone=+923001234567 code=NNNN`.

- [ ] **Step 5: Tap Verify**

Confirm: redirected to step 3 (because this is a first-time user).

- [ ] **Step 6: Enter "Test User" and pick a city; tap Continue**

Confirm: redirected to `/consumer/dashboard`. The "Complete your profile" banner does NOT appear (both fields are filled).

- [ ] **Step 7: Log out**

Use whatever logout exists (or clear `wusuq_*` keys from localStorage manually).

- [ ] **Step 8: Repeat steps 2 and 4 with the same phone number**

Confirm: after tapping Verify, you go straight to `/consumer/dashboard` (NOT step 3) — because `isNewUser` is now `false`.

- [ ] **Step 9: Test "I'll do this later"**

Use a fresh phone number (e.g. `03001234568`). Walk to step 3, tap "I'll do this later". Confirm: lands on dashboard, banner appears asking to complete name and city.

- [ ] **Step 10: Halt — report results to user**

If anything fails, capture the failure (terminal output, network response, screenshot) and report. Don't auto-fix; present findings and let the user decide.

---

## Task 17: Playwright E2E

**Files:**
- Create: `apps/web/e2e/consumer-login.spec.ts`

- [ ] **Step 1: Confirm Playwright is set up**

Run from repo root:

```
pnpm e2e --version
```

Expected: a Playwright version prints. If it errors, check `apps/web/playwright.config.ts` exists and `@playwright/test` is in devDependencies.

- [ ] **Step 2: Write the spec**

```ts
// apps/web/e2e/consumer-login.spec.ts
import { test, expect } from '@playwright/test';

test('consumer phone-first login (first-time user)', async ({ page }) => {
  // Use a phone unlikely to collide with prior test data.
  const phone = `0300${Math.floor(1000000 + Math.random() * 8999999)}`;

  // Capture devCode from the response.
  let devCode: string | null = null;
  page.on('response', async (resp) => {
    if (resp.url().includes('/auth/otp/request') && resp.status() === 200) {
      const json = await resp.json();
      if (json?.devCode) devCode = json.devCode;
    }
  });

  await page.goto('/consumer/login');
  await expect(page.getByText('Welcome back')).toBeVisible();

  await page.getByPlaceholder('300 1234567').fill(phone);
  await page.getByRole('button', { name: /Continue/ }).click();

  await expect(page.getByText('Verify your number')).toBeVisible();

  // Wait until devCode lands.
  await expect.poll(() => devCode, { timeout: 5000 }).not.toBeNull();
  // The hook auto-fills devCode in dev, but in case it hasn't yet:
  const inputs = page.locator('input[inputmode="numeric"]');
  await inputs.first().focus();
  await page.keyboard.type(devCode!);

  await page.getByRole('button', { name: /Verify/ }).click();
  await expect(page.getByText('Tell us about you')).toBeVisible();

  await page.getByPlaceholder('Ali Raza').fill('E2E Test User');
  await page.getByRole('button', { name: /Continue to dashboard/ }).click();

  await expect(page).toHaveURL(/\/consumer\/dashboard/);
});

test('consumer phone-first login (returning user skips profile)', async ({ page }) => {
  const phone = '03001112222';

  // First login: register
  let devCode: string | null = null;
  page.on('response', async (resp) => {
    if (resp.url().includes('/auth/otp/request') && resp.status() === 200) {
      const json = await resp.json();
      if (json?.devCode) devCode = json.devCode;
    }
  });

  await page.goto('/consumer/login');
  await page.getByPlaceholder('300 1234567').fill(phone);
  await page.getByRole('button', { name: /Continue/ }).click();
  await expect.poll(() => devCode, { timeout: 5000 }).not.toBeNull();
  await page.locator('input[inputmode="numeric"]').first().focus();
  await page.keyboard.type(devCode!);
  await page.getByRole('button', { name: /Verify/ }).click();

  if (await page.getByText('Tell us about you').isVisible()) {
    await page.getByPlaceholder('Ali Raza').fill('Returning Test User');
    await page.getByRole('button', { name: /Continue to dashboard/ }).click();
  }

  // Logout-equivalent: clear localStorage.
  await page.evaluate(() => localStorage.clear());

  // Second login: returning user — no profile step.
  devCode = null;
  await page.goto('/consumer/login');
  await page.getByPlaceholder('300 1234567').fill(phone);
  await page.getByRole('button', { name: /Continue/ }).click();
  await expect.poll(() => devCode, { timeout: 5000 }).not.toBeNull();
  await page.locator('input[inputmode="numeric"]').first().focus();
  await page.keyboard.type(devCode!);
  await page.getByRole('button', { name: /Verify/ }).click();

  await expect(page).toHaveURL(/\/consumer\/dashboard/);
  await expect(page.getByText('Tell us about you')).toBeHidden();
});
```

- [ ] **Step 3: Run the spec**

```
pnpm e2e -- --grep consumer-login
```

Expected: both tests pass.

- [ ] **Step 4: Halt — request commit permission for the spec file**

---

## Self-Review

**Spec coverage:**

| Spec section | Implemented in |
|---|---|
| §2 Goal — phone-first 3-step login | Tasks 5, 8, 9, 10, 11, 13 |
| §3 Decisions table | Reflected in tasks 9 (social mocks), 13 (single card), 8 (data flow) |
| §4 User journey + 4.1 returning + 4.2 first-time + 4.3 email-instead | Tasks 8 (isNewUser branching), 9 (Use email link), 13 (orchestrator) |
| §5 Frontend architecture (one route, local state machine, components, hooks) | Tasks 6–13 |
| §6 Backend (DTOs, OtpCode, OtpService, profile-complete) | Tasks 1, 2, 3, 5 |
| §7 Data flow | Tasks 5, 8 |
| §8 Mock behavior table (SMS, Google, Apple) | Tasks 3 (`dispatchSms` console.log + devCode), 9 + 13 (`handleMockedSocial`) |
| §9 Error handling (rate-limit, expired, wrong, lockout, network) | Task 8 (`use-login-flow` error mapping), Task 10 (OTP UI errors), Task 3 (rate-limit + lockout) |
| §10 Testing | Tasks 4 (unit), 16 (smoke), 17 (E2E) |
| §11 Migration (move email login, redirect signup) | Tasks 13 (move), 14 (redirect) |
| §12 Plan-time questions | Dashboard banner: covered in Task 15. Pakistan-only restriction: enforced in DTO regex (Task 2) and OtpService normalize (Task 3). Staff login: explicitly out of scope. |

**Placeholder scan:** No `TBD` / `TODO` / vague handlers in any task body. Mocks are documented as the v1 contract, not as placeholders.

**Type consistency:** `OtpVerifyResponse` shape in Task 6 matches the return type built in Task 3 (`accessToken`, `refreshToken`, `user`, `isNewUser`). `ProfileCompleteResponse` in Task 6 matches the shape returned by `AuthService.completeProfile` in Task 5. The hook's `useLoginFlow` (Task 8) consumes those types. `cityName` is the consistent identifier across DTO (Task 2), service (Task 5), API helper (Task 6), hook (Task 8), and UI (Task 11).

**Known caveats called out at task time:**

- Task 5: the `@Public()` decorator may or may not exist; the task tells the implementer to inspect first and create a minimal one if missing.
- Task 15: assumes a `/consumer/profile` route exists for the banner CTA; the task tells the implementer to confirm at execution time and adjust if not.
- Task 1: the migration loosens column nullability on `User`. Existing email/password users keep all current values; only newly-created phone-first rows have `email = null`. No data migration needed.
