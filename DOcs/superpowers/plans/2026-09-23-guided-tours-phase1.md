# Guided Tours — Phase 1 (Consumer) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the shared tour engine (DB + API + web) and the 12 consumer tours: a getting-started tour that plays once on the first consumer page, and one module tour per consumer page that plays the first time that page is opened, replayable from a top-bar "?" menu.

**Architecture:** `@wusuq/shared` owns the list of valid tour ids + versions + audience. A new `UserTourProgress` table (one upserted row per user per tour) is exposed through a self-scoped NestJS `tours` module. The web app wraps `driver.js` in a `TourProvider` (mounted in the consumer layout) and pure, unit-tested helpers (`shouldAutoPlay`, `resolveSteps`, `normalizeProgress`); tour content is plain data in `lib/tours/consumer/*.ts`, and pages opt in with one `useModuleTour(tourId, { ready })` call against `data-tour="…"` attributes.

**Tech Stack:** NestJS 11 + Prisma (Neon Postgres), Next.js 16 / React 19, `driver.js@^1.8.0` (MIT), Jest (api + web node env), Playwright.

Spec: `DOcs/superpowers/specs/2026-09-23-guided-tours-design.md`.

## Global Constraints

- TypeScript strict, `noUncheckedIndexedAccess`, **no `any`**.
- Every new module starts with a docblock saying what it is for and what it assumes.
- No source file over 300 lines — split instead.
- Tour targets are **`data-tour="<id>"` attributes only** — never CSS classes or text.
- Tour ids + versions live **only** in `packages/shared/src/tours.ts`. Never restate a tour id list elsewhere.
- The API binds everything to `actor.sub`. No route takes a user id.
- The Prisma migration is applied to Neon with `prisma db execute` + `prisma migrate resolve --applied` — **never `prisma migrate dev`**. This repo's `.env` points at the **production** Neon DB: applying the migration requires explicit owner confirmation (controller step, not an implementer step).
- Progress that cannot be loaded (network error, non-array body) means **do not auto-play** (fail closed). This also keeps every existing Playwright spec — whose catch-all mocks return `{}` — free of tour overlays.
- React 19 lint rule `react-hooks/set-state-in-effect`: never disable it; wrap synchronous setState inside effects in `startTransition`.
- Web unit tests run as ESM in a node env: use `dirname(fileURLToPath(import.meta.url))`, never `__dirname`. Source-level guard tests must match JSX usage (`data-tour="x"`), not bare strings, and must be mutation-tested.
- Commit with explicit paths: `git commit -m "…" -- <paths>` (no preceding bare `git add -A`). End every commit message with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- Tour copy is plain English, second person, ≤ 2 short sentences per step body.

---

## File map

| File | Responsibility |
|---|---|
| `packages/shared/src/tours.ts` (new) | `TOUR_IDS`, `TOUR_META`, `TOUR_AUTO_OFF_ID`, `isKnownTourId`, `tourAppliesToRole` |
| `packages/shared/src/index.ts` (modify) | `export * from './tours';` |
| `apps/api/prisma/schema.prisma` (modify) | `TourStatus` enum, `UserTourProgress` model, `User.tourProgress` relation |
| `apps/api/prisma/migrations/20260923000000_add_user_tour_progress/migration.sql` (new) | additive DDL |
| `apps/api/src/tours/{tours.module,tours.controller,tours.service}.ts` + `dto/save-tour-progress.dto.ts` (new) | self-scoped progress API |
| `apps/api/src/tours/*.spec.ts` (new) | service + controller + registry tests |
| `apps/api/src/app.module.ts` (modify) | register `ToursModule` |
| `apps/web/lib/tours/types.ts` | `TourStep`, `TourDefinition`, `TourProgressRow` |
| `apps/web/lib/tours/auto-play.ts` | pure `shouldAutoPlay`, `isTourSeen` |
| `apps/web/lib/tours/resolve-steps.ts` | pure `resolveSteps` (optional/required/mobile) |
| `apps/web/lib/tours/progress.ts` | `normalizeProgress`, pending-write queue helpers, API calls |
| `apps/web/lib/tours/browser-state.ts` | `isImpersonating`, `isDialogOpen`, `isMobileViewport`, `isTargetVisible`, `readStoredRole`, `prefersReducedMotion` |
| `apps/web/lib/tours/registry.ts` | `TOUR_DEFINITIONS: Record<TourId, TourDefinition>` |
| `apps/web/lib/tours/consumer/*.ts` | one data file per consumer tour |
| `apps/web/lib/tours/tour-theme.css` | driver.js overrides using `globals.css` tokens |
| `apps/web/components/tours/tour-context.ts` | React context + `useTours()` |
| `apps/web/components/tours/tour-provider.tsx` | loads progress, runs driver, persistence, queue, chaining |
| `apps/web/components/tours/run-tour.ts` | builds + drives a driver.js instance for one tour (no React) |
| `apps/web/components/tours/use-module-tour.ts` | `useModuleTour(tourId, { ready })` |
| `apps/web/components/tours/module-tour.tsx` | `<ModuleTour tourId ready? />` for server-component pages |
| `apps/web/components/tours/tour-menu.tsx` | top-bar "?" menu |
| `apps/web/lib/tours/*.test.ts` | unit + registry-integrity guard tests |
| `tests/e2e/guided-tours.spec.ts` | Playwright |

---

### Task 1: Shared tour registry + DB model + self-scoped progress API

**Files:**
- Create: `packages/shared/src/tours.ts`
- Modify: `packages/shared/src/index.ts` (append one export line at the end)
- Modify: `apps/api/prisma/schema.prisma` (new enum + model; relation field on `model User`)
- Create: `apps/api/prisma/migrations/20260923000000_add_user_tour_progress/migration.sql`
- Create: `apps/api/src/tours/tours.module.ts`, `tours.controller.ts`, `tours.service.ts`, `dto/save-tour-progress.dto.ts`
- Create: `apps/api/src/tours/tour-registry.spec.ts`, `tours.service.spec.ts`, `tours.controller.spec.ts`
- Modify: `apps/api/src/app.module.ts` (import + register `ToursModule`)

**Interfaces:**
- Produces (shared): `type TourId`, `TOUR_IDS: readonly TourId[]`, `TOUR_META: Record<TourId, TourMeta>`, `interface TourMeta { version: number; audience: 'consumer' | 'staff'; permission?: Permission }`, `TOUR_AUTO_OFF_ID = 'tours.auto-off'`, `isKnownTourId(id: string): boolean` (true for every `TourId` **and** `TOUR_AUTO_OFF_ID`), `expectedTourVersion(id: string): number | null` (auto-off → 1), `tourAppliesToRole(id: TourId, role: string | null | undefined): boolean`, `type TourStatusValue = 'COMPLETED' | 'DISMISSED'`.
- Produces (API): `GET /tours/progress` → `{ tourId: string; version: number; status: TourStatusValue }[]`; `PUT /tours/progress/:tourId` body `{ version, status }` → the saved row (same shape); `DELETE /tours/progress/:tourId` → `{ deleted: boolean }`.

- [ ] **Step 1: Write `packages/shared/src/tours.ts`**

```ts
/**
 * Guided-tour registry — the ONLY list of valid tour ids.
 *
 * The API validates `PUT /tours/progress/:tourId` against this list (so a
 * client cannot create junk rows) and the web tour registry is typed against
 * `TourId` (so a tour data file cannot reference an unknown tour).
 *
 * Bump a tour's `version` when its content changes materially: every user who
 * saw an older version sees it once more.
 */
import { ROLE_PERMISSIONS, isConsumerRole, isStaffRole, type Permission, type UserRole } from './index';

export const TOUR_IDS = [
  'consumer.getting-started',
  'consumer.dashboard',
  'consumer.services',
  'consumer.intake',
  'consumer.my-tickets',
  'consumer.pay',
  'consumer.wallet',
  'consumer.drafts',
  'consumer.case-files',
  'consumer.documents',
  'consumer.invoices',
  'consumer.profile',
] as const;

export type TourId = (typeof TOUR_IDS)[number];
export type TourStatusValue = 'COMPLETED' | 'DISMISSED';

export interface TourMeta {
  version: number;
  audience: 'consumer' | 'staff';
  /** Staff tours only: the permission the page requires (mirrors the sidebar). */
  permission?: Permission;
}

const consumer = (version = 1): TourMeta => ({ version, audience: 'consumer' });

export const TOUR_META: Record<TourId, TourMeta> = {
  'consumer.getting-started': consumer(),
  'consumer.dashboard': consumer(),
  'consumer.services': consumer(),
  'consumer.intake': consumer(),
  'consumer.my-tickets': consumer(),
  'consumer.pay': consumer(),
  'consumer.wallet': consumer(),
  'consumer.drafts': consumer(),
  'consumer.case-files': consumer(),
  'consumer.documents': consumer(),
  'consumer.invoices': consumer(),
  'consumer.profile': consumer(),
};

/** Reserved id persisting the "don't show tours automatically" preference. */
export const TOUR_AUTO_OFF_ID = 'tours.auto-off';

export function isTourId(id: string): id is TourId {
  return (TOUR_IDS as readonly string[]).includes(id);
}

export function isKnownTourId(id: string): boolean {
  return id === TOUR_AUTO_OFF_ID || isTourId(id);
}

export function expectedTourVersion(id: string): number | null {
  if (id === TOUR_AUTO_OFF_ID) return 1;
  if (!isTourId(id)) return null;
  return TOUR_META[id].version;
}

export function tourAppliesToRole(id: TourId, role: string | null | undefined): boolean {
  const meta = TOUR_META[id];
  if (meta.audience === 'consumer') return isConsumerRole(role);
  if (!isStaffRole(role)) return false;
  if (!meta.permission) return true;
  const perms = ROLE_PERMISSIONS[role as UserRole] ?? [];
  return perms.includes(meta.permission);
}
```

Append to the end of `packages/shared/src/index.ts`:

```ts
export * from './tours';
```

> Circular import note: `tours.ts` imports from `./index`, and `index.ts` re-exports `./tours`. This is safe because `tours.ts` only *calls* the imported functions inside function bodies (never at module top level). `TOUR_META` uses no imported values. Do not move a top-level call to an imported function into `tours.ts`.

- [ ] **Step 2: Build shared and write the registry spec**

Run: `pnpm --filter @wusuq/shared build` — Expected: exit 0.

Create `apps/api/src/tours/tour-registry.spec.ts`:

```ts
import {
  TOUR_AUTO_OFF_ID,
  TOUR_IDS,
  TOUR_META,
  expectedTourVersion,
  isKnownTourId,
  tourAppliesToRole,
} from '@wusuq/shared';

describe('shared tour registry', () => {
  it('has metadata with a positive integer version for every id', () => {
    for (const id of TOUR_IDS) {
      expect(Number.isInteger(TOUR_META[id].version)).toBe(true);
      expect(TOUR_META[id].version).toBeGreaterThanOrEqual(1);
    }
  });

  it('accepts registry ids and the auto-off id, rejects anything else', () => {
    expect(isKnownTourId('consumer.wallet')).toBe(true);
    expect(isKnownTourId(TOUR_AUTO_OFF_ID)).toBe(true);
    expect(isKnownTourId('consumer.nope')).toBe(false);
    expect(isKnownTourId('')).toBe(false);
  });

  it('reports the expected version (auto-off is always 1, unknown is null)', () => {
    expect(expectedTourVersion('consumer.wallet')).toBe(TOUR_META['consumer.wallet'].version);
    expect(expectedTourVersion(TOUR_AUTO_OFF_ID)).toBe(1);
    expect(expectedTourVersion('nope')).toBeNull();
  });

  it('scopes consumer tours to consumer-class roles only', () => {
    expect(tourAppliesToRole('consumer.wallet', 'consumer')).toBe(true);
    expect(tourAppliesToRole('consumer.wallet', 'lawyer')).toBe(true);
    expect(tourAppliesToRole('consumer.wallet', 'company')).toBe(true);
    expect(tourAppliesToRole('consumer.wallet', 'super-admin')).toBe(false);
    expect(tourAppliesToRole('consumer.wallet', 'representative')).toBe(false);
    expect(tourAppliesToRole('consumer.wallet', undefined)).toBe(false);
  });
});
```

Run: `cd apps/api && pnpm test -- --testPathPattern=tour-registry` — Expected: PASS (4 tests).

- [ ] **Step 3: Add the Prisma model + migration**

In `apps/api/prisma/schema.prisma`, add to `model User` (next to `notifications Notification[]`):

```prisma
  tourProgress       UserTourProgress[]
```

Append at the end of the schema:

```prisma
enum TourStatus {
  COMPLETED
  DISMISSED
}

/// One row per (user, guided tour). Written by upsert so concurrent tabs cannot
/// lose each other's progress. `version` is the tour version the user saw.
model UserTourProgress {
  id        String     @id @default(cuid())
  userId    String
  tourId    String
  version   Int
  status    TourStatus
  updatedAt DateTime   @updatedAt
  user      User       @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, tourId])
}
```

(No separate `@@index([userId])`: the unique index's leading column already serves `WHERE userId = …`.)

Create `apps/api/prisma/migrations/20260923000000_add_user_tour_progress/migration.sql`:

```sql
-- Guided tours (2026-09-23): one row per (user, tour). Additive only — a new
-- enum + table, no change to existing rows.
CREATE TYPE "TourStatus" AS ENUM ('COMPLETED', 'DISMISSED');

CREATE TABLE "UserTourProgress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tourId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "TourStatus" NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UserTourProgress_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserTourProgress_userId_tourId_key" ON "UserTourProgress"("userId", "tourId");

ALTER TABLE "UserTourProgress" ADD CONSTRAINT "UserTourProgress_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

Run: `cd apps/api && pnpm prisma:generate` — Expected: "Generated Prisma Client". **Do NOT apply to any database** — that is a controller step after owner confirmation.

- [ ] **Step 4: Write the failing service + controller specs**

Create `apps/api/src/tours/tours.service.spec.ts`:

```ts
import { jest } from '@jest/globals';
import { BadRequestException } from '@nestjs/common';
import { TOUR_AUTO_OFF_ID, TOUR_META } from '@wusuq/shared';
import { ToursService } from './tours.service';

function build() {
  const rows = [{ tourId: 'consumer.wallet', version: 1, status: 'COMPLETED' }];
  const prisma = {
    userTourProgress: {
      findMany: jest.fn(async (_args: unknown) => rows),
      upsert: jest.fn(async (args: { create: { tourId: string; version: number; status: string } }) => ({
        tourId: args.create.tourId,
        version: args.create.version,
        status: args.create.status,
      })),
      deleteMany: jest.fn(async (_args: unknown) => ({ count: 1 })),
    },
  };
  return { svc: new ToursService(prisma as never), prisma };
}

describe('ToursService', () => {
  it('lists only the caller rows, selecting the public fields', async () => {
    const { svc, prisma } = build();
    await svc.list('user-a');
    expect(prisma.userTourProgress.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-a' },
      select: { tourId: true, version: true, status: true },
    });
  });

  it('upserts on the (userId, tourId) compound key of the caller', async () => {
    const { svc, prisma } = build();
    const v = TOUR_META['consumer.wallet'].version;
    await svc.save('user-a', 'consumer.wallet', { version: v, status: 'DISMISSED' });
    expect(prisma.userTourProgress.upsert).toHaveBeenCalledWith({
      where: { userId_tourId: { userId: 'user-a', tourId: 'consumer.wallet' } },
      create: { userId: 'user-a', tourId: 'consumer.wallet', version: v, status: 'DISMISSED' },
      update: { version: v, status: 'DISMISSED' },
      select: { tourId: true, version: true, status: true },
    });
  });

  it('accepts the auto-off preference at version 1', async () => {
    const { svc, prisma } = build();
    await svc.save('user-a', TOUR_AUTO_OFF_ID, { version: 1, status: 'DISMISSED' });
    expect(prisma.userTourProgress.upsert).toHaveBeenCalledTimes(1);
  });

  it('rejects an unknown tour id without touching the DB', async () => {
    const { svc, prisma } = build();
    await expect(svc.save('user-a', 'consumer.nope', { version: 1, status: 'COMPLETED' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.userTourProgress.upsert).not.toHaveBeenCalled();
  });

  it('rejects a version that is not the current registry version', async () => {
    const { svc, prisma } = build();
    const v = TOUR_META['consumer.wallet'].version;
    await expect(svc.save('user-a', 'consumer.wallet', { version: v + 1, status: 'COMPLETED' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.userTourProgress.upsert).not.toHaveBeenCalled();
  });

  it("removes only the caller's own row", async () => {
    const { svc, prisma } = build();
    await expect(svc.remove('user-a', TOUR_AUTO_OFF_ID)).resolves.toEqual({ deleted: true });
    expect(prisma.userTourProgress.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-a', tourId: TOUR_AUTO_OFF_ID },
    });
  });

  it('rejects removing an unknown id', async () => {
    const { svc } = build();
    await expect(svc.remove('user-a', 'nope')).rejects.toBeInstanceOf(BadRequestException);
  });
});
```

Create `apps/api/src/tours/tours.controller.spec.ts`:

```ts
import { jest } from '@jest/globals';
import type { JwtUser } from '../auth/types/jwt-user.type';
import { ToursController } from './tours.controller';

// IDOR guard: every route resolves the user strictly from the JWT subject.
// No route declares a user-id parameter, so user A can never read or write B.
describe('ToursController (self-scoped)', () => {
  function make() {
    const svc = {
      list: jest.fn(async (_u: string) => []),
      save: jest.fn(async (_u: string, _t: string, _d: unknown) => ({})),
      remove: jest.fn(async (_u: string, _t: string) => ({ deleted: true })),
    };
    return { ctrl: new ToursController(svc as never), svc };
  }
  const actor = { sub: 'user-a', role: 'consumer' } as JwtUser;

  it('list uses actor.sub', async () => {
    const { ctrl, svc } = make();
    await ctrl.list(actor);
    expect(svc.list).toHaveBeenCalledWith('user-a');
  });

  it('save uses actor.sub and the path tour id', async () => {
    const { ctrl, svc } = make();
    await ctrl.save(actor, 'consumer.wallet', { version: 1, status: 'COMPLETED' });
    expect(svc.save).toHaveBeenCalledWith('user-a', 'consumer.wallet', { version: 1, status: 'COMPLETED' });
  });

  it('remove uses actor.sub and the path tour id', async () => {
    const { ctrl, svc } = make();
    await ctrl.remove(actor, 'tours.auto-off');
    expect(svc.remove).toHaveBeenCalledWith('user-a', 'tours.auto-off');
  });
});
```

Run: `cd apps/api && pnpm test -- --testPathPattern=src/tours` — Expected: FAIL ("Cannot find module './tours.service'").

- [ ] **Step 5: Implement the DTO, service, controller, module**

`apps/api/src/tours/dto/save-tour-progress.dto.ts`:

```ts
/** Body of PUT /tours/progress/:tourId — validated by the global whitelist ValidationPipe. */
import { IsIn, IsInt, Min } from 'class-validator';
import type { TourStatusValue } from '@wusuq/shared';

export class SaveTourProgressDto {
  @IsInt()
  @Min(1)
  version!: number;

  @IsIn(['COMPLETED', 'DISMISSED'])
  status!: TourStatusValue;
}
```

`apps/api/src/tours/tours.service.ts`:

```ts
/**
 * Guided-tour progress — one row per (user, tour).
 *
 * Every method takes the caller's user id from the controller (JWT subject);
 * there is no path that reads or writes another user's rows. Tour ids and
 * versions are validated against the shared registry so a client cannot
 * create junk rows or mark a newer tour version as seen.
 */
import { BadRequestException, Injectable } from '@nestjs/common';
import { expectedTourVersion, isKnownTourId } from '@wusuq/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { SaveTourProgressDto } from './dto/save-tour-progress.dto';

const PUBLIC_FIELDS = { tourId: true, version: true, status: true } as const;

@Injectable()
export class ToursService {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string) {
    return this.prisma.userTourProgress.findMany({ where: { userId }, select: PUBLIC_FIELDS });
  }

  save(userId: string, tourId: string, dto: SaveTourProgressDto) {
    this.assertKnown(tourId);
    if (dto.version !== expectedTourVersion(tourId)) {
      throw new BadRequestException(`Tour ${tourId} is not at version ${dto.version}`);
    }
    return this.prisma.userTourProgress.upsert({
      where: { userId_tourId: { userId, tourId } },
      create: { userId, tourId, version: dto.version, status: dto.status },
      update: { version: dto.version, status: dto.status },
      select: PUBLIC_FIELDS,
    });
  }

  async remove(userId: string, tourId: string) {
    this.assertKnown(tourId);
    const { count } = await this.prisma.userTourProgress.deleteMany({ where: { userId, tourId } });
    return { deleted: count > 0 };
  }

  private assertKnown(tourId: string) {
    if (!isKnownTourId(tourId)) throw new BadRequestException(`Unknown tour: ${tourId}`);
  }
}
```

`apps/api/src/tours/tours.controller.ts`:

```ts
/**
 * Self-scoped guided-tour progress routes. Reachable by every authenticated
 * role (no @RequirePermissions — PermissionsGuard passes, JwtAuthGuard still
 * requires a token), and bound to `actor.sub` only: no route accepts a user id.
 */
import { Body, Controller, Delete, Get, Param, Put } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtUser } from '../auth/types/jwt-user.type';
import { SaveTourProgressDto } from './dto/save-tour-progress.dto';
import { ToursService } from './tours.service';

@Controller('tours/progress')
export class ToursController {
  constructor(private readonly toursService: ToursService) {}

  @Get()
  list(@CurrentUser() actor: JwtUser | undefined) {
    return this.toursService.list(actor!.sub);
  }

  @Put(':tourId')
  save(
    @CurrentUser() actor: JwtUser | undefined,
    @Param('tourId') tourId: string,
    @Body() dto: SaveTourProgressDto,
  ) {
    return this.toursService.save(actor!.sub, tourId, dto);
  }

  @Delete(':tourId')
  remove(@CurrentUser() actor: JwtUser | undefined, @Param('tourId') tourId: string) {
    return this.toursService.remove(actor!.sub, tourId);
  }
}
```

`apps/api/src/tours/tours.module.ts`:

```ts
/** Guided-tour progress module (self-scoped, see ToursController). */
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ToursController } from './tours.controller';
import { ToursService } from './tours.service';

@Module({
  imports: [PrismaModule],
  controllers: [ToursController],
  providers: [ToursService],
})
export class ToursModule {}
```

In `apps/api/src/app.module.ts`: add `import { ToursModule } from './tours/tours.module';` next to the `InvoicesModule` import and add `ToursModule,` to the `imports` array directly after `InvoicesModule,`.

- [ ] **Step 6: Run tests, typecheck, lint**

Run: `cd apps/api && pnpm test -- --testPathPattern=src/tours` — Expected: PASS (all 14).
Run: `pnpm --filter @wusuq/api typecheck && pnpm --filter @wusuq/api lint` — Expected: 0 errors.
Run: `cd apps/api && pnpm test` — Expected: full suite green (no regressions).

- [ ] **Step 7: Commit**

```bash
git commit -m "feat(tours): shared tour registry + self-scoped UserTourProgress API

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>" -- packages/shared/src/tours.ts packages/shared/src/index.ts apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260923000000_add_user_tour_progress apps/api/src/tours apps/api/src/app.module.ts
```

---

### Task 2: Web pure tour core (types, auto-play decision, step resolution, progress helpers)

**Files:**
- Create: `apps/web/lib/tours/types.ts`, `auto-play.ts`, `resolve-steps.ts`, `progress.ts`, `browser-state.ts`
- Test: `apps/web/lib/tours/auto-play.test.ts`, `resolve-steps.test.ts`, `progress.test.ts`

**Interfaces:**
- Consumes: from `@wusuq/shared` — `TourId`, `TourStatusValue`, `TOUR_META`, `TOUR_AUTO_OFF_ID`, `isKnownTourId`.
- Produces:
  - `types.ts`: `interface TourStep { target?: string; mobileTarget?: string; optional?: boolean; title: string; body: string; side?: 'top'|'right'|'bottom'|'left' }`; `interface TourChain { label: string; href: string; tourId: TourId }`; `interface TourDefinition { id: TourId; href?: string; menuLabel: string; steps: TourStep[]; next?: TourChain }`; `interface TourProgressRow { tourId: string; version: number; status: TourStatusValue }`.
  - `auto-play.ts`: `isTourSeen(tourId: TourId, rows: TourProgressRow[]): boolean`; `interface AutoPlayInput { tourId: TourId; appliesToRole: boolean; progress: TourProgressRow[] | null; sessionSeen: ReadonlySet<string>; impersonating: boolean; ready: boolean; tourRunning: boolean; dialogOpen: boolean; gettingStartedDone: boolean }`; `shouldAutoPlay(input: AutoPlayInput): boolean`; `GETTING_STARTED_ID: TourId = 'consumer.getting-started'`.
  - `resolve-steps.ts`: `type ResolvedStep = { element?: string; title: string; body: string; side?: TourStep['side'] }`; `resolveSteps(steps: TourStep[], opts: { isMobile: boolean; isVisible: (target: string) => boolean }): { ok: true; steps: ResolvedStep[] } | { ok: false; missing: string }`; `tourSelector(target: string): string` → `[data-tour="<target>"]`.
  - `progress.ts`: `normalizeProgress(body: unknown): TourProgressRow[] | null`; `fetchProgress(): Promise<TourProgressRow[] | null>`; `saveProgress(tourId: string, version: number, status: TourStatusValue): Promise<boolean>`; `clearProgress(tourId: string): Promise<boolean>`; `PENDING_KEY = 'wusuq_tour_pending'`; `readPending(storage: Pick<Storage,'getItem'>): TourProgressRow[]`; `writePending(storage: Pick<Storage,'setItem'|'removeItem'>, rows: TourProgressRow[]): void`; `mergeProgress(server: TourProgressRow[], pending: TourProgressRow[]): TourProgressRow[]`.
  - `browser-state.ts`: `isImpersonating(): boolean`, `isDialogOpen(): boolean`, `isMobileViewport(): boolean`, `isTargetVisible(target: string): boolean`, `readStoredRole(): string | null`, `prefersReducedMotion(): boolean`.

- [ ] **Step 1: Write `types.ts`**

```ts
/**
 * Guided-tour data types. Tour content is plain data (no JSX) so copy can be
 * edited without touching components; targets are `data-tour` attribute ids.
 */
import type { TourId, TourStatusValue } from '@wusuq/shared';

export interface TourStep {
  /** `data-tour` id to highlight; absent = centred card. */
  target?: string;
  /** Alternative target below the lg breakpoint (e.g. the mobile menu button). */
  mobileTarget?: string;
  /** Skip silently when the target is absent/hidden (e.g. "your first ticket"). */
  optional?: boolean;
  title: string;
  body: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
}

/** Final-step link that continues the workflow on another page. */
export interface TourChain {
  label: string;
  href: string;
  tourId: TourId;
}

export interface TourDefinition {
  id: TourId;
  /** Page the tour lives on — enables "open & tour" from the ? menu. Omit for dynamic pages. */
  href?: string;
  menuLabel: string;
  steps: TourStep[];
  next?: TourChain;
}

export interface TourProgressRow {
  tourId: string;
  version: number;
  status: TourStatusValue;
}
```

- [ ] **Step 2: Write failing tests**

`apps/web/lib/tours/auto-play.test.ts`:

```ts
import { TOUR_AUTO_OFF_ID, TOUR_META } from '@wusuq/shared';
import { isTourSeen, shouldAutoPlay, type AutoPlayInput } from './auto-play';

const v = TOUR_META['consumer.wallet'].version;
const base: AutoPlayInput = {
  tourId: 'consumer.wallet',
  appliesToRole: true,
  progress: [],
  sessionSeen: new Set(),
  impersonating: false,
  ready: true,
  tourRunning: false,
  dialogOpen: false,
  gettingStartedDone: true,
};

describe('isTourSeen', () => {
  it('is seen at the current version, not at an older one', () => {
    expect(isTourSeen('consumer.wallet', [{ tourId: 'consumer.wallet', version: v, status: 'DISMISSED' }])).toBe(true);
    expect(isTourSeen('consumer.wallet', [{ tourId: 'consumer.wallet', version: v - 1, status: 'COMPLETED' }])).toBe(false);
    expect(isTourSeen('consumer.wallet', [])).toBe(false);
  });
});

describe('shouldAutoPlay', () => {
  it('plays an unseen, applicable tour on a ready page', () => {
    expect(shouldAutoPlay(base)).toBe(true);
  });

  it.each<[string, Partial<AutoPlayInput>]>([
    ['progress failed to load (fail closed)', { progress: null }],
    ['role does not apply', { appliesToRole: false }],
    ['already seen at this version', { progress: [{ tourId: 'consumer.wallet', version: v, status: 'COMPLETED' }] }],
    ['already ended this session', { sessionSeen: new Set(['consumer.wallet']) }],
    ['auto-play turned off', { progress: [{ tourId: TOUR_AUTO_OFF_ID, version: 1, status: 'DISMISSED' }] }],
    ['impersonating', { impersonating: true }],
    ['page not ready', { ready: false }],
    ['another tour running', { tourRunning: true }],
    ['a dialog is open', { dialogOpen: true }],
    ['getting-started not done yet', { gettingStartedDone: false }],
  ])('does not play when %s', (_label, patch) => {
    expect(shouldAutoPlay({ ...base, ...patch })).toBe(false);
  });

  it('getting-started itself does not wait for getting-started', () => {
    expect(
      shouldAutoPlay({ ...base, tourId: 'consumer.getting-started', gettingStartedDone: false }),
    ).toBe(true);
  });

  it('replays after a version bump (older version row)', () => {
    expect(
      shouldAutoPlay({ ...base, progress: [{ tourId: 'consumer.wallet', version: v - 1, status: 'COMPLETED' }] }),
    ).toBe(true);
  });
});
```

`apps/web/lib/tours/resolve-steps.test.ts`:

```ts
import { resolveSteps, tourSelector } from './resolve-steps';

const visible = (ids: string[]) => (t: string) => ids.includes(t);

describe('resolveSteps', () => {
  it('maps targets to data-tour selectors and keeps centred steps', () => {
    const r = resolveSteps(
      [{ title: 'Hi', body: 'b' }, { target: 'a', title: 'A', body: 'b' }],
      { isMobile: false, isVisible: visible(['a']) },
    );
    expect(r).toEqual({
      ok: true,
      steps: [
        { title: 'Hi', body: 'b' },
        { element: '[data-tour="a"]', title: 'A', body: 'b' },
      ],
    });
  });

  it('skips a missing optional step', () => {
    const r = resolveSteps([{ target: 'gone', optional: true, title: 'x', body: 'y' }], {
      isMobile: false,
      isVisible: visible([]),
    });
    expect(r).toEqual({ ok: true, steps: [] });
  });

  it('aborts on a missing required step, naming it', () => {
    const r = resolveSteps([{ target: 'gone', title: 'x', body: 'y' }], { isMobile: false, isVisible: visible([]) });
    expect(r).toEqual({ ok: false, missing: 'gone' });
  });

  it('uses mobileTarget on mobile', () => {
    const r = resolveSteps([{ target: 'desk', mobileTarget: 'mob', title: 'x', body: 'y' }], {
      isMobile: true,
      isVisible: visible(['mob']),
    });
    expect(r.ok && r.steps[0]?.element).toBe('[data-tour="mob"]');
  });

  it('falls back to a centred card on mobile when the desktop target is hidden and no mobileTarget', () => {
    const r = resolveSteps([{ target: 'desk', title: 'x', body: 'y' }], { isMobile: true, isVisible: visible([]) });
    expect(r).toEqual({ ok: true, steps: [{ title: 'x', body: 'y' }] });
  });

  it('builds attribute selectors', () => {
    expect(tourSelector('shell.sidebar')).toBe('[data-tour="shell.sidebar"]');
  });

  it('reports ok with zero steps as an abort-worthy empty tour', () => {
    const r = resolveSteps([], { isMobile: false, isVisible: visible([]) });
    expect(r).toEqual({ ok: true, steps: [] });
  });
});
```

`apps/web/lib/tours/progress.test.ts`:

```ts
import { mergeProgress, normalizeProgress, readPending, writePending, PENDING_KEY } from './progress';

describe('normalizeProgress', () => {
  it('returns null for a non-array body (fail closed)', () => {
    expect(normalizeProgress({})).toBeNull();
    expect(normalizeProgress(null)).toBeNull();
  });

  it('keeps well-formed rows and drops malformed ones', () => {
    expect(
      normalizeProgress([
        { tourId: 'consumer.wallet', version: 1, status: 'COMPLETED' },
        { tourId: 'consumer.wallet', version: '1', status: 'COMPLETED' },
        { tourId: 'x', version: 1, status: 'WHATEVER' },
      ]),
    ).toEqual([{ tourId: 'consumer.wallet', version: 1, status: 'COMPLETED' }]);
  });
});

describe('pending writes', () => {
  function memStorage() {
    const m = new Map<string, string>();
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
      m,
    };
  }

  it('round-trips pending rows and clears on empty', () => {
    const s = memStorage();
    writePending(s, [{ tourId: 'consumer.wallet', version: 1, status: 'DISMISSED' }]);
    expect(readPending(s)).toEqual([{ tourId: 'consumer.wallet', version: 1, status: 'DISMISSED' }]);
    writePending(s, []);
    expect(s.m.has(PENDING_KEY)).toBe(false);
  });

  it('treats corrupt storage as empty', () => {
    const s = memStorage();
    s.setItem(PENDING_KEY, '{not json');
    expect(readPending(s)).toEqual([]);
  });

  it('merges pending over server rows by tourId', () => {
    expect(
      mergeProgress(
        [{ tourId: 'a', version: 1, status: 'DISMISSED' }],
        [{ tourId: 'a', version: 2, status: 'COMPLETED' }, { tourId: 'b', version: 1, status: 'COMPLETED' }],
      ),
    ).toEqual([
      { tourId: 'a', version: 2, status: 'COMPLETED' },
      { tourId: 'b', version: 1, status: 'COMPLETED' },
    ]);
  });
});
```

Run: `pnpm --filter @wusuq/web test -- lib/tours` — Expected: FAIL (modules not found).

- [ ] **Step 3: Implement `auto-play.ts`**

```ts
/**
 * Pure auto-play decision for guided tours. Framework-free so every rule is
 * unit-tested as a truth table; browser state is read by the caller.
 */
import { TOUR_AUTO_OFF_ID, TOUR_META, type TourId } from '@wusuq/shared';
import type { TourProgressRow } from './types';

export const GETTING_STARTED_ID: TourId = 'consumer.getting-started';

export interface AutoPlayInput {
  tourId: TourId;
  appliesToRole: boolean;
  /** null = progress could not be loaded → never auto-play (fail closed). */
  progress: TourProgressRow[] | null;
  /** Tours that ended this session (covers failed saves so they don't loop). */
  sessionSeen: ReadonlySet<string>;
  impersonating: boolean;
  ready: boolean;
  tourRunning: boolean;
  dialogOpen: boolean;
  gettingStartedDone: boolean;
}

export function isTourSeen(tourId: TourId, rows: TourProgressRow[]): boolean {
  const row = rows.find((r) => r.tourId === tourId);
  return !!row && row.version >= TOUR_META[tourId].version;
}

export function shouldAutoPlay(i: AutoPlayInput): boolean {
  if (i.progress === null) return false;
  if (!i.appliesToRole || i.impersonating || !i.ready) return false;
  if (i.tourRunning || i.dialogOpen) return false;
  if (i.sessionSeen.has(i.tourId)) return false;
  if (i.progress.some((r) => r.tourId === TOUR_AUTO_OFF_ID)) return false;
  if (isTourSeen(i.tourId, i.progress)) return false;
  if (i.tourId !== GETTING_STARTED_ID && !i.gettingStartedDone) return false;
  return true;
}
```

- [ ] **Step 4: Implement `resolve-steps.ts`**

```ts
/**
 * Turns tour data into concrete driver steps for the current viewport.
 * Optional steps with a missing target are skipped; a missing REQUIRED target
 * aborts the tour (caller does not mark it seen, so it plays properly later).
 */
import type { TourStep } from './types';

export type ResolvedStep = { element?: string; title: string; body: string; side?: TourStep['side'] };
export type ResolveResult = { ok: true; steps: ResolvedStep[] } | { ok: false; missing: string };

export function tourSelector(target: string): string {
  return `[data-tour="${target}"]`;
}

function pickTarget(step: TourStep, isMobile: boolean): string | undefined {
  if (isMobile && step.mobileTarget) return step.mobileTarget;
  return step.target;
}

export function resolveSteps(
  steps: TourStep[],
  opts: { isMobile: boolean; isVisible: (target: string) => boolean },
): ResolveResult {
  const out: ResolvedStep[] = [];
  for (const step of steps) {
    const card = { title: step.title, body: step.body, ...(step.side ? { side: step.side } : {}) };
    const target = pickTarget(step, opts.isMobile);
    if (!target) {
      out.push(card);
      continue;
    }
    if (opts.isVisible(target)) {
      out.push({ element: tourSelector(target), ...card });
      continue;
    }
    if (step.optional) continue;
    // Desktop-only chrome hidden on a phone with no mobile alternative: centre it.
    if (opts.isMobile && !step.mobileTarget) {
      out.push(card);
      continue;
    }
    return { ok: false, missing: target };
  }
  return { ok: true, steps: out };
}
```

- [ ] **Step 5: Implement `progress.ts`**

```ts
/**
 * Guided-tour progress I/O. Loading failures return null (callers then never
 * auto-play); failed saves are queued in localStorage and flushed on the next
 * load, merged over the server rows so a tour never replays because of a blip.
 */
import type { TourStatusValue } from '@wusuq/shared';
import { apiClient } from '@/lib/api-client';
import type { TourProgressRow } from './types';

export const PENDING_KEY = 'wusuq_tour_pending';

function isRow(x: unknown): x is TourProgressRow {
  if (typeof x !== 'object' || x === null) return false;
  const r = x as Record<string, unknown>;
  return (
    typeof r.tourId === 'string' &&
    typeof r.version === 'number' &&
    Number.isInteger(r.version) &&
    (r.status === 'COMPLETED' || r.status === 'DISMISSED')
  );
}

export function normalizeProgress(body: unknown): TourProgressRow[] | null {
  if (!Array.isArray(body)) return null;
  return body.filter(isRow).map((r) => ({ tourId: r.tourId, version: r.version, status: r.status }));
}

export async function fetchProgress(): Promise<TourProgressRow[] | null> {
  try {
    return normalizeProgress(await apiClient.get<unknown>('/tours/progress'));
  } catch {
    return null;
  }
}

export async function saveProgress(tourId: string, version: number, status: TourStatusValue): Promise<boolean> {
  try {
    await apiClient.put(`/tours/progress/${encodeURIComponent(tourId)}`, { version, status });
    return true;
  } catch {
    return false;
  }
}

export async function clearProgress(tourId: string): Promise<boolean> {
  try {
    await apiClient.delete(`/tours/progress/${encodeURIComponent(tourId)}`);
    return true;
  } catch {
    return false;
  }
}

export function readPending(storage: Pick<Storage, 'getItem'>): TourProgressRow[] {
  try {
    return normalizeProgress(JSON.parse(storage.getItem(PENDING_KEY) ?? '[]')) ?? [];
  } catch {
    return [];
  }
}

export function writePending(storage: Pick<Storage, 'setItem' | 'removeItem'>, rows: TourProgressRow[]): void {
  try {
    if (rows.length === 0) storage.removeItem(PENDING_KEY);
    else storage.setItem(PENDING_KEY, JSON.stringify(rows));
  } catch {
    // Storage unavailable (private mode) — the session-seen set still prevents loops.
  }
}

export function mergeProgress(server: TourProgressRow[], pending: TourProgressRow[]): TourProgressRow[] {
  const byId = new Map(server.map((r) => [r.tourId, r]));
  for (const p of pending) byId.set(p.tourId, p);
  return [...byId.values()];
}
```

Before writing: confirm `apiClient.get/put/delete` signatures in `apps/web/lib/api-client.ts` (lines ~156–190: `get<T>(endpoint)`, `put<T>(endpoint, body?)`, `delete<T>(endpoint)`). If `progress.test.ts` fails to import because `api-client.ts` touches `window` at module load, move the three API functions into `progress-api.ts` and keep `progress.ts` pure; update the Interfaces accordingly.

- [ ] **Step 6: Implement `browser-state.ts`** (no unit test — thin DOM readers; covered by E2E)

```ts
/**
 * Thin, SSR-safe readers of browser state used by the tour provider. Kept
 * separate so the decision logic (auto-play.ts / resolve-steps.ts) stays pure.
 */
import { tourSelector } from './resolve-steps';

const hasWindow = () => typeof window !== 'undefined';

export function isImpersonating(): boolean {
  if (!hasWindow()) return false;
  try {
    return !!window.localStorage.getItem('wusuq_impersonator_access_token');
  } catch {
    return false;
  }
}

/** An open Radix dialog/drawer (tour popovers are excluded). */
export function isDialogOpen(): boolean {
  if (!hasWindow()) return false;
  return !!document.querySelector(
    '[role="dialog"]:not(.driver-popover), [role="alertdialog"]',
  );
}

/** Matches Tailwind's lg breakpoint, where the sidebar becomes a drawer. */
export function isMobileViewport(): boolean {
  return hasWindow() && window.matchMedia('(max-width: 1023px)').matches;
}

export function isTargetVisible(target: string): boolean {
  if (!hasWindow()) return false;
  const el = document.querySelector(tourSelector(target));
  return !!el && el.getClientRects().length > 0;
}

export function readStoredRole(): string | null {
  if (!hasWindow()) return null;
  try {
    const u = JSON.parse(window.localStorage.getItem('wusuq_user') ?? 'null') as { role?: unknown } | null;
    return typeof u?.role === 'string' ? u.role : null;
  } catch {
    return null;
  }
}

export function prefersReducedMotion(): boolean {
  return hasWindow() && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
```

- [ ] **Step 7: Run tests + typecheck + lint**

Run: `pnpm --filter @wusuq/web test -- lib/tours` — Expected: PASS.
Run: `pnpm --filter @wusuq/web typecheck && pnpm --filter @wusuq/web lint` — Expected: 0 errors.

- [ ] **Step 8: Commit**

```bash
git commit -m "feat(tours): pure web tour core (auto-play decision, step resolution, progress)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>" -- apps/web/lib/tours
```

---

### Task 3: TourProvider + driver.js runner + ? menu + getting-started tour + registry guard

**Files:**
- Modify: `apps/web/package.json` (add `driver.js`)
- Create: `apps/web/components/tours/tour-context.ts`, `run-tour.ts`, `tour-provider.tsx`, `use-module-tour.ts`, `module-tour.tsx`, `tour-menu.tsx`
- Create: `apps/web/lib/tours/tour-theme.css`, `apps/web/lib/tours/registry.ts`, `apps/web/lib/tours/consumer/getting-started.ts`
- Create: `apps/web/lib/tours/registry.test.ts` (registry integrity guard)
- Modify: `apps/web/app/(consumer)/layout.tsx` (wrap in `TourProvider`)
- Modify: `apps/web/components/ui/shell-nav.tsx` (`data-tour="shell.sidebar"` on the desktop `<aside>`)
- Modify: `apps/web/components/ui/shell-topbar.tsx` (`data-tour` on mobile menu button, wallet chip, notifications trigger, user menu trigger; render `<TourMenu />`)

**Interfaces:**
- Consumes: Task 1 shared exports; Task 2 `shouldAutoPlay`, `GETTING_STARTED_ID`, `resolveSteps`, `fetchProgress`, `saveProgress`, `clearProgress`, `readPending`, `writePending`, `mergeProgress`, browser-state readers, `TourDefinition`.
- Produces:
  - `useTours(): TourApi | null` (null outside a provider) where `interface TourApi { start(tourId: TourId): void; requestTour(tourId: TourId): void; registerPageTour(tourId: TourId, ready: boolean): () => void; pageTourId: TourId | null; available: TourDefinition[]; autoOff: boolean; setAutoOff(off: boolean): void; running: boolean }`.
  - `useModuleTour(tourId: TourId, opts?: { ready?: boolean }): void` (ready defaults true).
  - `<ModuleTour tourId={…} ready? />` client component rendering `null`.
  - `TOUR_DEFINITIONS: Record<TourId, TourDefinition>` in `registry.ts`. Until Tasks 4–6 land, ids without content use `placeholderTour(id)` — NOT allowed at the end of phase 1 (the guard test in Task 6 fails if any remain).

- [ ] **Step 1: Install driver.js**

Run: `pnpm --filter @wusuq/web add driver.js@^1.8.0` — Expected: added to `dependencies`.

- [ ] **Step 2: Getting-started content + registry**

`apps/web/lib/tours/consumer/getting-started.ts`:

```ts
/** Consumer getting-started tour — shell chrome only, so it can run on any page. */
import type { TourDefinition } from '../types';

export const consumerGettingStarted: TourDefinition = {
  id: 'consumer.getting-started',
  menuLabel: 'Getting started',
  steps: [
    { title: 'Welcome to Wusuq', body: "Let's take a one-minute look around. You can skip at any time." },
    {
      target: 'shell.sidebar',
      mobileTarget: 'shell.mobile-menu',
      side: 'right',
      title: 'Everything lives here',
      body: 'Order services, follow your tickets, and find your documents, invoices and wallet from this menu.',
    },
    {
      target: 'shell.wallet',
      optional: true,
      side: 'bottom',
      title: 'Your wallet',
      body: 'Your balance after unpaid tickets. Tap it to top up or see your transactions.',
    },
    {
      target: 'shell.notifications',
      side: 'bottom',
      title: 'Updates',
      body: 'We notify you here when a ticket moves forward, a document is ready, or a payment is due.',
    },
    {
      target: 'shell.tour-menu',
      side: 'bottom',
      title: 'Help is always here',
      body: 'Replay any tour from this button. Each page also shows you around the first time you open it.',
    },
  ],
};
```

`apps/web/lib/tours/registry.ts`:

```ts
/**
 * TourId → tour content. Typed against the shared TourId union, so every
 * registered id must have content and no content can exist for an unknown id.
 */
import type { TourId } from '@wusuq/shared';
import { consumerGettingStarted } from './consumer/getting-started';
import type { TourDefinition } from './types';

/** Temporary stand-in while a tour's content is being written (Tasks 4–6 remove all uses). */
function placeholderTour(id: TourId): TourDefinition {
  return { id, menuLabel: id, steps: [] };
}

export const TOUR_DEFINITIONS: Record<TourId, TourDefinition> = {
  'consumer.getting-started': consumerGettingStarted,
  'consumer.dashboard': placeholderTour('consumer.dashboard'),
  'consumer.services': placeholderTour('consumer.services'),
  'consumer.intake': placeholderTour('consumer.intake'),
  'consumer.my-tickets': placeholderTour('consumer.my-tickets'),
  'consumer.pay': placeholderTour('consumer.pay'),
  'consumer.wallet': placeholderTour('consumer.wallet'),
  'consumer.drafts': placeholderTour('consumer.drafts'),
  'consumer.case-files': placeholderTour('consumer.case-files'),
  'consumer.documents': placeholderTour('consumer.documents'),
  'consumer.invoices': placeholderTour('consumer.invoices'),
  'consumer.profile': placeholderTour('consumer.profile'),
};
```

The runner treats a tour whose resolved steps are empty as "nothing to show": it does not start and does not mark seen.

- [ ] **Step 3: Write the registry integrity guard (failing)**

`apps/web/lib/tours/registry.test.ts`:

```ts
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOUR_IDS } from '@wusuq/shared';
import { TOUR_DEFINITIONS } from './registry';

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, '..', '..');

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (name === 'node_modules' || name === '.next') return [];
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return tsxFiles(p);
    return p.endsWith('.tsx') ? [p] : [];
  });
}

const source = [...tsxFiles(join(webRoot, 'components')), ...tsxFiles(join(webRoot, 'app'))]
  .map((f) => readFileSync(f, 'utf8'))
  .join('\n');

/** Match the JSX attribute, never the bare id (an import or comment must not satisfy it). */
function renderedAsAttribute(target: string): boolean {
  const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`data-tour=["'{\`]{1,2}${escaped}["'\`}]`).test(source);
}

describe('tour registry integrity', () => {
  it('has content keyed by its own id for every shared tour id', () => {
    for (const id of TOUR_IDS) expect(TOUR_DEFINITIONS[id].id).toBe(id);
  });

  it('every step target and mobileTarget is rendered as a data-tour attribute', () => {
    const missing: string[] = [];
    for (const id of TOUR_IDS) {
      for (const step of TOUR_DEFINITIONS[id].steps) {
        for (const t of [step.target, step.mobileTarget]) {
          if (t && !renderedAsAttribute(t)) missing.push(`${id} → ${t}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('every chain points at a registered tour with a page', () => {
    for (const id of TOUR_IDS) {
      const next = TOUR_DEFINITIONS[id].next;
      if (next) expect(next.href.startsWith('/')).toBe(true);
    }
  });
});
```

Run: `pnpm --filter @wusuq/web test -- lib/tours/registry` — Expected: FAIL listing `shell.sidebar`, `shell.mobile-menu`, `shell.wallet`, `shell.notifications`, `shell.tour-menu`.

- [ ] **Step 4: Add the shell `data-tour` attributes**

- `components/ui/shell-nav.tsx`: on the desktop `<aside className="sticky top-0 hidden h-screen w-[248px] …">` add `data-tour="shell.sidebar"`.
- `components/ui/shell-topbar.tsx`:
  - the mobile nav open button (`aria-label="Open navigation"`) → `data-tour="shell.mobile-menu"`;
  - the consumer wallet `<Link>` chip → `data-tour="shell.wallet"`;
  - the notifications `<div className="relative">` inside `MenuTrigger` → `data-tour="shell.notifications"`;
  - render `<TourMenu />` immediately before the notifications `<Menu>`. `TourMenu` renders `null` outside a provider, so the portal top bar is unaffected.

- [ ] **Step 5: Context + runner**

`apps/web/components/tours/tour-context.ts`:

```ts
/** React context for the guided-tour engine. `useTours()` is null outside TourProvider. */
'use client';

import { createContext, useContext } from 'react';
import type { TourId } from '@wusuq/shared';
import type { TourDefinition } from '@/lib/tours/types';

export interface TourApi {
  start(tourId: TourId): void;
  requestTour(tourId: TourId): void;
  registerPageTour(tourId: TourId, ready: boolean): () => void;
  pageTourId: TourId | null;
  available: TourDefinition[];
  autoOff: boolean;
  setAutoOff(off: boolean): void;
  running: boolean;
}

export const TourContext = createContext<TourApi | null>(null);

export function useTours(): TourApi | null {
  return useContext(TourContext);
}
```

`apps/web/components/tours/run-tour.ts`:

```ts
/**
 * Drives ONE tour with driver.js (loaded lazily, client-only). Reports how it
 * ended: 'completed' (Done / chain link on the last step), 'dismissed'
 * (close, Esc, overlay click), or 'aborted' (a required target was missing or
 * there was nothing to show — the caller must NOT mark it seen).
 */
import type { TourDefinition } from '@/lib/tours/types';
import { resolveSteps } from '@/lib/tours/resolve-steps';
import { isMobileViewport, isTargetVisible, prefersReducedMotion } from '@/lib/tours/browser-state';

export type TourOutcome = 'completed' | 'dismissed' | 'aborted';

export async function runTour(def: TourDefinition, onEnd: (outcome: TourOutcome) => void): Promise<void> {
  const resolved = resolveSteps(def.steps, { isMobile: isMobileViewport(), isVisible: isTargetVisible });
  if (!resolved.ok || resolved.steps.length === 0) {
    if (!resolved.ok && process.env.NODE_ENV !== 'production') {
      console.warn(`[tours] ${def.id} aborted: required target "${resolved.missing}" not on screen`);
    }
    onEnd('aborted');
    return;
  }

  const { driver } = await import('driver.js');
  const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  let outcome: TourOutcome = 'dismissed';

  const d = driver({
    animate: !prefersReducedMotion(),
    showProgress: resolved.steps.length > 1,
    progressText: 'Step {{current}} of {{total}}',
    nextBtnText: 'Next',
    prevBtnText: 'Back',
    doneBtnText: def.next?.label ?? 'Done',
    popoverClass: 'wusuq-tour',
    stagePadding: 6,
    stageRadius: 12,
    allowClose: true,
    steps: resolved.steps.map((s) => ({
      ...(s.element ? { element: s.element } : {}),
      popover: { title: s.title, description: s.body, ...(s.side ? { side: s.side } : {}) },
    })),
    onDoneClick: () => {
      outcome = 'completed';
      d.destroy();
    },
    onDestroyed: () => {
      returnFocus?.focus();
      onEnd(outcome);
    },
  });
  d.drive();
}
```

Before relying on `onDoneClick`, verify in `node_modules/driver.js/dist/driver.js.mjs` that it fires for the last step's Done button and that without calling `destroy()` the tour stays open (so our `d.destroy()` is required). If `onDoneClick` also fires on non-last "Next" clicks in the installed version, gate it with `if (!d.isLastStep()) { d.moveNext(); return; }`.

- [ ] **Step 6: Provider**

`apps/web/components/tours/tour-provider.tsx` — must stay under 300 lines; responsibilities:

```tsx
/**
 * Guided-tour engine for one shell (mounted in the consumer layout).
 *
 * - Loads progress once (+ merges and flushes writes queued by failed saves).
 *   Unloadable progress → no auto-play (fail closed).
 * - Plays getting-started first, on whichever page the user lands on, then the
 *   current page's module tour.
 * - One tour at a time. Never auto-plays over an open dialog, while
 *   impersonating, or before the page reports `ready`.
 * - Persists COMPLETED/DISMISSED (never while impersonating); 'aborted' is not
 *   persisted so the tour plays properly next time.
 * - Chains: the last step's link marks the tour completed, requests the next
 *   tour and navigates; the next page plays it as soon as it is ready.
 */
'use client';

import { startTransition, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { TOUR_AUTO_OFF_ID, TOUR_IDS, TOUR_META, tourAppliesToRole, type TourId } from '@wusuq/shared';
import '@/lib/tours/tour-theme.css';
import 'driver.js/dist/driver.css';
import { GETTING_STARTED_ID, isTourSeen, shouldAutoPlay } from '@/lib/tours/auto-play';
import { isDialogOpen, isImpersonating, readStoredRole } from '@/lib/tours/browser-state';
import {
  clearProgress, fetchProgress, mergeProgress, readPending, saveProgress, writePending,
} from '@/lib/tours/progress';
import { TOUR_DEFINITIONS } from '@/lib/tours/registry';
import type { TourProgressRow } from '@/lib/tours/types';
import { TourContext, type TourApi } from './tour-context';
import { runTour, type TourOutcome } from './run-tour';
```

State and behaviour the implementation must have (write it as small internal functions, guard-clause style):

1. `progress: TourProgressRow[] | null` (initially `null`), `role`, `running`, `pageTour: { id: TourId; ready: boolean } | null`, `requested: TourId | null`, `sessionSeen` (a `useRef<Set<string>>`).
2. **Mount effect:** read `role = readStoredRole()`; `const pending = readPending(localStorage)`; `const server = await fetchProgress()`; if `server === null` → `startTransition(() => setProgress(null))` and stop. Otherwise set `mergeProgress(server, pending)`; then, unless `isImpersonating()`, re-send each pending row with `saveProgress` and `writePending(localStorage, stillFailing)`.
3. **`persist(tourId, outcome)`:** add to `sessionSeen`; if `outcome === 'aborted'` or `isImpersonating()` → return. Build the row `{ tourId, version: TOUR_META[tourId].version, status: outcome === 'completed' ? 'COMPLETED' : 'DISMISSED' }`, optimistically merge it into `progress`, call `saveProgress`; on `false` append to the pending queue with `writePending`.
4. **`play(tourId, chainAllowed)`:** if `running` → return. Set running; `runTour(TOUR_DEFINITIONS[tourId], (outcome) => { setRunning(false); persist(tourId, outcome); if (outcome === 'completed' && def.next) { setRequested(def.next.tourId); router.push(def.next.href); } })`.
5. **Auto-play effect** (deps: `progress`, `pageTour`, `running`, `requested`): compute `gettingStartedDone = sessionSeen.has(GETTING_STARTED_ID) || (progress !== null && isTourSeen(GETTING_STARTED_ID, progress))`. Candidate order:
   - if `requested` and `pageTour?.id === requested && pageTour.ready && !running && !isDialogOpen()` → clear `requested`, `play(requested)` (a requested tour ignores seen/auto-off but never plays over a dialog);
   - else getting-started if `shouldAutoPlay({ tourId: GETTING_STARTED_ID, ready: true, … })`;
   - else `pageTour.id` if `shouldAutoPlay({ tourId: pageTour.id, ready: pageTour.ready, gettingStartedDone, … })`.
   Run the chosen `play` inside `window.setTimeout(…, 400)` (lets layout settle after navigation; clear the timer in the effect cleanup). Inputs: `appliesToRole = tourAppliesToRole(id, role)`, `impersonating = isImpersonating()`, `dialogOpen = isDialogOpen()`, `tourRunning = running`, `sessionSeen = sessionSeen.current`.
6. **`registerPageTour(id, ready)`** sets `pageTour` and returns a cleanup that clears it only if it still holds that id.
7. **`available`** = `TOUR_IDS.filter((id) => tourAppliesToRole(id, role)).map((id) => TOUR_DEFINITIONS[id]).filter((d) => d.steps.length > 0)`.
8. **`autoOff`** = `progress?.some((r) => r.tourId === TOUR_AUTO_OFF_ID) ?? false`; `setAutoOff(true)` → optimistic add + `saveProgress(TOUR_AUTO_OFF_ID, 1, 'DISMISSED')`; `setAutoOff(false)` → optimistic remove + `clearProgress(TOUR_AUTO_OFF_ID)`.
9. `start(id)` = `play(id)` immediately (manual replay ignores seen/auto-off). `requestTour(id)` = `setRequested(id)`.
10. Memoise the `TourApi` value with `useMemo`; render `<TourContext.Provider value={api}>{children}</TourContext.Provider>`.

Any synchronous `setState` inside an effect body is wrapped in `startTransition` (lint rule).

- [ ] **Step 7: Hook, server-page wrapper, menu, theme**

`apps/web/components/tours/use-module-tour.ts`:

```ts
/**
 * The one line a module page adds: registers the page's tour with the
 * provider, which auto-plays it the first time once `ready` (the page's
 * initial data has resolved — never pass a value that is true while loading).
 */
'use client';

import { useEffect } from 'react';
import type { TourId } from '@wusuq/shared';
import { useTours } from './tour-context';

export function useModuleTour(tourId: TourId, opts: { ready?: boolean } = {}): void {
  const tours = useTours();
  const ready = opts.ready ?? true;
  const register = tours?.registerPageTour;
  useEffect(() => {
    if (!register) return;
    return register(tourId, ready);
  }, [register, tourId, ready]);
}
```

`registerPageTour` must be a stable `useCallback` in the provider or this effect loops.

`apps/web/components/tours/module-tour.tsx`:

```tsx
/** Lets a server-component page opt into its module tour: <ModuleTour tourId="…" />. */
'use client';

import type { TourId } from '@wusuq/shared';
import { useModuleTour } from './use-module-tour';

export function ModuleTour({ tourId, ready }: { tourId: TourId; ready?: boolean }) {
  useModuleTour(tourId, { ready });
  return null;
}
```

`apps/web/components/tours/tour-menu.tsx` — a `HelpCircle` icon button (use the same `IconButton` + `Menu`/`MenuTrigger`/`MenuContent` primitives `shell-topbar.tsx` already uses for notifications; import them from the same paths), with `data-tour="shell.tour-menu"` on the trigger wrapper and `aria-label="Guided tours"`. Returns `null` when `useTours()` is null. Menu contents:
- if `pageTourId` and it's in `available`: **"Tour this page"** → `start(pageTourId)`;
- **"Getting started"** → `start('consumer.getting-started')`;
- a list of other `available` tours that have an `href` (excluding the current page tour): clicking → `requestTour(id)` then `router.push(href)`;
- a toggle item: `autoOff ? 'Show tours automatically' : "Don't show tours automatically"` → `setAutoOff(!autoOff)`.
Every item is a real button that does something (no dead buttons). Keep the file under 150 lines.

`apps/web/lib/tours/tour-theme.css` (uses the `@theme` tokens from `app/globals.css`, which Tailwind v4 exposes as CSS variables):

```css
/* Guided tours — brand overrides for driver.js. Colours come from globals.css tokens only. */
.driver-popover.wusuq-tour {
  background: var(--color-surface);
  color: var(--color-ink-900);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-card);
  border: 1px solid var(--color-border-soft);
  max-width: min(360px, calc(100vw - 32px));
  padding: 16px;
  font-family: var(--font-sans);
}
.driver-popover.wusuq-tour .driver-popover-title { font-size: 1rem; font-weight: 600; color: var(--color-ink-900); }
.driver-popover.wusuq-tour .driver-popover-description { font-size: 0.875rem; line-height: 1.45; color: var(--color-ink-600); }
.driver-popover.wusuq-tour .driver-popover-progress-text { font-size: 0.75rem; color: var(--color-ink-400); }
.driver-popover.wusuq-tour .driver-popover-footer button {
  border-radius: 0.5rem; padding: 6px 12px; font-size: 0.8125rem; font-weight: 600; text-shadow: none;
  border: 1px solid var(--color-border-soft); background: var(--color-surface); color: var(--color-ink-700);
}
.driver-popover.wusuq-tour .driver-popover-footer .driver-popover-next-btn {
  background: var(--color-brand-500); border-color: var(--color-brand-500); color: #fff;
}
.driver-popover.wusuq-tour .driver-popover-footer .driver-popover-next-btn:hover { background: var(--color-brand-600); }
.driver-popover.wusuq-tour .driver-popover-close-btn { color: var(--color-ink-400); }
.driver-popover.wusuq-tour .driver-popover-footer button:focus-visible {
  outline: 2px solid var(--color-brand-400); outline-offset: 2px;
}
```

Verify the next-button class name (`driver-popover-next-btn`) in `node_modules/driver.js/dist/driver.css`; adjust the selector if it differs.

- [ ] **Step 8: Mount the provider**

`apps/web/app/(consumer)/layout.tsx`: wrap the inner `<div className="flex min-h-screen …">` in `<TourProvider>` (inside `ConsumerAuthGuard`, so tours never run for an unauthenticated visitor). The portal layout is **not** touched in phase 1.

- [ ] **Step 9: Verify**

Run: `pnpm --filter @wusuq/web test` — Expected: PASS (registry guard now green; all prior web tests green).
Mutation-test the guard: temporarily change `data-tour="shell.wallet"` to `data-tour="shell.walletx"` → the guard must FAIL naming `shell.wallet`; restore. Also temporarily add the comment `// shell.wallet` elsewhere while the attribute is broken → the guard must STILL fail; restore.
Run: `pnpm --filter @wusuq/web typecheck && pnpm --filter @wusuq/web lint && pnpm --filter @wusuq/web build` — Expected: 0 errors, build green.

- [ ] **Step 10: Commit**

```bash
git commit -m "feat(tours): tour provider, driver.js runner, ? menu and consumer getting-started tour

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>" -- apps/web/package.json pnpm-lock.yaml apps/web/components/tours apps/web/lib/tours "apps/web/app/(consumer)/layout.tsx" apps/web/components/ui/shell-nav.tsx apps/web/components/ui/shell-topbar.tsx
```

---

### Task 4: Core workflow tours — dashboard, My Tickets, Pay, Wallet

**Files:**
- Create: `apps/web/lib/tours/consumer/{dashboard,my-tickets,pay,wallet}.ts`
- Modify: `apps/web/lib/tours/registry.ts` (replace the four placeholders)
- Modify: `apps/web/app/(consumer)/consumer/dashboard/page.tsx`, `apps/web/components/consumer-ticket-board.tsx` (and its sub-files under `components/consumer-ticket-board/` if the element lives there), `apps/web/app/(consumer)/consumer/tickets/[id]/pay/page.tsx`, `apps/web/components/consumer-wallet-board.tsx`

**Interfaces:**
- Consumes: `useModuleTour` (Task 3), `TourDefinition` (Task 2).
- Produces: `consumerDashboardTour`, `consumerMyTicketsTour`, `consumerPayTour`, `consumerWalletTour`.

**The `ready` rule (applies to Tasks 4–6):** pass `ready` = "the page's initial fetch has resolved (success OR error)". Where a board initialises `const [loading, setLoading] = useState(false)` and flips it true inside an effect (e.g. `consumer-ticket-board.tsx:159`), `!loading` is **true on the first render, before the fetch** — do NOT use it. Add `const [loaded, setLoaded] = useState(false)` and set it true in the fetch's `finally`. Where loading starts `true` (dashboard `page.tsx:162`, `consumer-wallet-board.tsx:73`), `ready={!loading}` is correct.

- [ ] **Step 1: Write the tour data**

`consumer/dashboard.ts` (href `/consumer/dashboard`, menuLabel "Dashboard", next → `{ label: 'Next: My Tickets →', href: '/consumer/my-tickets', tourId: 'consumer.my-tickets' }`):

| target | optional | title | body |
|---|---|---|---|
| `dashboard.kpis` | no | Your tickets at a glance | Active, unpaid and completed tickets. Active matches the Active tab in My Tickets. |
| `dashboard.next-hearing` | yes | Next hearing | Your nearest upcoming hearing. Click it to open that ticket. |
| `dashboard.activity` | yes | Recent activity | The latest changes across your tickets, newest first. |
| `dashboard.volume` | yes | Your history | How many tickets you've placed over time. |

`consumer/my-tickets.ts` (href `/consumer/my-tickets`, menuLabel "My Tickets", next → `{ label: 'Next: Wallet →', href: '/consumer/my-wallet', tourId: 'consumer.wallet' }`):

| target | optional | title | body |
|---|---|---|---|
| `my-tickets.tabs` | no | Filter by stage | Switch between active, unpaid, completed and all tickets. |
| `my-tickets.card` | yes | A ticket | Each card shows the service, case, status and amount. Click it for the full details and timeline. |
| `my-tickets.pay` | yes | Pay now or later | Pay now, or choose Pay later — the amount is added to your wallet balance as a due. |
| `my-tickets.actions` | yes | Invoice, documents and more | Download your invoice and delivered documents, reorder a service for the same case, or book the next hearing. |
| `my-tickets.new` | yes | Order a new service | Start a new request any time from Paralegal Services. |
| (none) | — | No tickets yet? | When you place your first order, it appears here with its live status. |

`consumer/pay.ts` (no href — dynamic page; menuLabel "Paying for a ticket"):

| target | optional | title | body |
|---|---|---|---|
| `pay.amount` | no | Amount due | What you owe on this ticket right now. |
| `pay.method` | no | Choose how to pay | Pick a method to see the account details to send the payment to. |
| `pay.receipt` | no | Upload your receipt | A receipt is required — we verify it and then mark your ticket paid. |
| `pay.wallet` | yes | Use your wallet | If you have credit, you can pay this ticket from your wallet instead. |

`consumer/wallet.ts` (href `/consumer/my-wallet`, menuLabel "Wallet"):

| target | optional | title | body |
|---|---|---|---|
| `wallet.balance` | no | Your balance | Credit you've added, minus what's committed to unpaid tickets. Nothing is deducted until a ticket is paid. |
| `wallet.topup` | no | Add credit | Top up by bank transfer, JazzCash or EasyPaisa — upload the receipt and we'll verify it. |
| `wallet.history` | no | Transactions | Every top-up and payment, with its verification status. |

Write each file in the `TourDefinition` shape from Task 2 (`steps` in table order; a "(none)" target means omit `target`). Replace the matching placeholders in `registry.ts` with imports.

- [ ] **Step 2: Run the guard (expect FAIL listing the new targets)**

Run: `pnpm --filter @wusuq/web test -- lib/tours/registry` — Expected: FAIL listing every target above.

- [ ] **Step 3: Add the attributes + hook calls**

- Dashboard (`app/(consumer)/consumer/dashboard/page.tsx`): `dashboard.kpis` on the wrapper of the ticket-count KPI row; `dashboard.next-hearing` on the next-hearing block; `dashboard.activity` on the recent-activity card; `dashboard.volume` on the volume-graph card. Call `useModuleTour('consumer.dashboard', { ready: !loading })`.
- My Tickets (`components/consumer-ticket-board.tsx` + sub-components): `my-tickets.tabs` on the status tab list; `my-tickets.card` on the **first** ticket card only (`index === 0`); `my-tickets.pay` on the first card's Pay / Pay-later button group; `my-tickets.actions` on the first card's invoice/document/regenerate action group; `my-tickets.new` on the "new ticket / order a service" button if the board has one (optional — omit the attribute and delete the step from the data file if no such button exists, rather than adding a new button). Add the `loaded` flag per the `ready` rule and call `useModuleTour('consumer.my-tickets', { ready: loaded })`.
- Pay (`app/(consumer)/consumer/tickets/[id]/pay/page.tsx`): `pay.amount` on the amount-due display; `pay.method` on the `PaymentMethodDetails` picker wrapper; `pay.receipt` on the receipt-upload field; `pay.wallet` on the pay-from-wallet control. `useModuleTour('consumer.pay', { ready: <ticket fetch resolved> })`.
- Wallet (`components/consumer-wallet-board.tsx`, the top-level component whose `loading` starts `true` at line ~73): `wallet.balance` on the balance hero; `wallet.topup` on the top-up button; `wallet.history` on the transaction list/table (render the attribute on the container even when the list is empty). `useModuleTour('consumer.wallet', { ready: !loading })`.

Attributes go on an existing element. If the target is a component (not a DOM element), pass it through a wrapper `<div data-tour="…">` rather than adding a prop to a shared UI component.

- [ ] **Step 4: Verify**

Run: `pnpm --filter @wusuq/web test && pnpm --filter @wusuq/web typecheck && pnpm --filter @wusuq/web lint` — Expected: all green.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(tours): consumer dashboard, My Tickets, pay and wallet tours

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>" -- apps/web/lib/tours "apps/web/app/(consumer)/consumer/dashboard/page.tsx" "apps/web/app/(consumer)/consumer/tickets/[id]/pay/page.tsx" apps/web/components/consumer-ticket-board.tsx apps/web/components/consumer-ticket-board apps/web/components/consumer-wallet-board.tsx
```

---

### Task 5: Ordering tours — services picker + intake wizard

**Files:**
- Create: `apps/web/lib/tours/consumer/{services,intake}.ts`
- Modify: `apps/web/lib/tours/registry.ts`
- Modify: `apps/web/components/service-picker.tsx`, the consumer services pages `app/(consumer)/consumer/paralegal-services/{page,judicial/page,non-judicial/page}.tsx`, `apps/web/components/intake-wizard.tsx` (and/or its `components/intake-wizard/` sub-files where the element lives)

**Interfaces:**
- Consumes: `ModuleTour` (server pages), `useModuleTour` (wizard, client).

- [ ] **Step 1: Tour data**

`consumer/services.ts` (href `/consumer/paralegal-services/judicial`, menuLabel "Ordering a service"):

| target | optional | title | body |
|---|---|---|---|
| `services.grid` | no | Pick a service | Each tile is a service our paralegals handle. Choose one to open its short form. |
| `services.switch` | yes | Judicial or non-judicial | Court work is under Judicial; FIR copies, registry deeds and record searches are under Non Judicial. |

`consumer/intake.ts` (no href; menuLabel "Filling in an order"):

| target | optional | title | body |
|---|---|---|---|
| `intake.steps` | no | Your progress | The form is split into short steps. Required fields are marked with *. |
| `intake.form` | no | Case details | Choose your city and court first — the rest of the form adapts to them. |
| `intake.autosave` | yes | Saved as you go | Your answers save automatically. Find unfinished orders under Drafts. |
| `intake.checkout` | no | Your price | The price updates as you fill in the form. Add a promo code or use wallet credit here. |
| `intake.nav` | no | Next and back | Move between steps here. You can review everything before you submit. |

- [ ] **Step 2: Guard fails** — `pnpm --filter @wusuq/web test -- lib/tours/registry` lists the new targets.

- [ ] **Step 3: Attributes + hooks**

- `service-picker.tsx`: `services.grid` on the tile grid. It is a server component — do not add hooks to it. Add `services.switch` only if the picker renders a judicial/non-judicial switch; otherwise delete that step from the data file.
- Each of the three consumer services pages renders `<ModuleTour tourId="consumer.services" />` next to `<ServicePicker … />` (wrap both in a fragment). The portal services pages are not touched.
- `intake-wizard.tsx` (consumer AND portal use it; the tour only applies to consumer roles via `tourAppliesToRole`, and the portal has no provider in phase 1): `intake.steps` on the step rail; `intake.form` on the active step's field container; `intake.autosave` on the "Saved" autosave pill (already `flex-wrap`, see CLAUDE.md 2026-07-08 — don't regress that); `intake.checkout` on the `CheckoutPanel` wrapper; `intake.nav` on the Back/Next button row. Call `useModuleTour('consumer.intake', { ready: <activeStep resolved and not hydrating a draft/regenerate/edit prefill> })`. Also suppress it for edit/regenerate/future modes: pass `ready: false` when `editTicketId`, `regenerateFromTicketId` or `futureFromTicketId` is present (those are staff or returning-user flows).

- [ ] **Step 4: Verify** — `pnpm --filter @wusuq/web test && pnpm --filter @wusuq/web typecheck && pnpm --filter @wusuq/web lint` all green. Check that `intake-wizard.tsx` did not cross a new size threshold because of this change (attributes only).

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(tours): consumer services picker and intake wizard tours

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>" -- apps/web/lib/tours apps/web/components/service-picker.tsx apps/web/components/intake-wizard.tsx apps/web/components/intake-wizard "apps/web/app/(consumer)/consumer/paralegal-services"
```

---

### Task 6: Remaining module tours — drafts, case files, documents, invoices, profile

**Files:**
- Create: `apps/web/lib/tours/consumer/{drafts,case-files,documents,invoices,profile}.ts`
- Modify: `apps/web/lib/tours/registry.ts` (remove `placeholderTour` entirely)
- Modify: `components/drafts-board.tsx`, `components/case-files-board.tsx`, `components/consumer-cases-board.tsx`, `components/consumer-documents-board.tsx`, `app/(consumer)/consumer/files/personal-files-client.tsx`, `components/consumer-invoices-board.tsx`, `components/consumer-profile-board.tsx`
- Modify: `apps/web/lib/tours/registry.test.ts` (add the no-placeholder assertion)

- [ ] **Step 1: Tour data** (each row: `target | optional | title | body`)

`consumer/drafts.ts` (href `/consumer/drafts`, "Drafts"):
| `drafts.list` | no | Unfinished orders | Orders you started but didn't submit. Open one to pick up where you left off. |
| `drafts.delete` | yes | Clean up | Delete a draft you no longer need. |

`consumer/case-files.ts` (href `/consumer/case-files`, "Case files", used on both `/consumer/case-files` and `/consumer/my-cases`):
| `case-files.upload` | no | Upload a case file | Add your own case documents with the case number and year so they're grouped together. |
| `case-files.list` | no | Grouped by case | Files are grouped by case. View or download any file here. |

`consumer/documents.ts` (href `/consumer/documents`, "Documents", used on `/consumer/documents` and `/consumer/files`):
| `documents.list` | no | Documents from Wusuq | Documents our paralegals deliver appear here once your ticket is completed. |
| `documents.preview` | yes | View before downloading | Preview a document right here, or download it. |

`consumer/invoices.ts` (href `/consumer/invoices`, "Invoices"):
| `invoices.list` | no | Your invoices | Every invoice issued to you. Download any one as a PDF. |

`consumer/profile.ts` (href `/consumer/profile`, "Profile"):
| `profile.details` | no | Your details | Keep your phone number and address up to date — we use the address for deliveries. |
| `profile.type` | yes | Account type | Tell us whether you're a civilian, a lawyer or a company. |

- [ ] **Step 2: Add the no-placeholder assertion** to `registry.test.ts`:

```ts
  it('every tour has at least one step (no placeholders left)', () => {
    const empty = TOUR_IDS.filter((id) => TOUR_DEFINITIONS[id].steps.length === 0);
    expect(empty).toEqual([]);
  });
```

Run the guard — Expected: FAIL (new targets + any remaining empty tours).

- [ ] **Step 3: Attributes + hooks** (apply the `ready` rule from Task 4 to each board — `drafts-board.tsx:59`, `consumer-documents-board.tsx:51`, `consumer-invoices-board.tsx:43`, `consumer-profile-board.tsx:54` start `loading` as `false` → add a `loaded` flag; `case-files-board.tsx:44` starts `true` → `!loading`):
- `drafts-board.tsx`: `drafts.list` on the list container (also when empty), `drafts.delete` on the first row's delete button; `useModuleTour('consumer.drafts', …)`.
- `case-files-board.tsx`: `case-files.upload` on the upload button, `case-files.list` on the grouped list container; `useModuleTour('consumer.case-files', …)`. `consumer-cases-board.tsx`: the same two ids exist only on case-files, so on My Cases call `useModuleTour('consumer.case-files', …)` **only if** both targets render there; otherwise don't register a tour on My Cases (the registry guard only checks the attribute exists somewhere).
- `consumer-documents-board.tsx`: `documents.list` on the list container, `documents.preview` on the first row's View button; `useModuleTour('consumer.documents', …)`. Do not register it on `personal-files-client.tsx` unless the same targets render there.
- `consumer-invoices-board.tsx`: `invoices.list` on the list container; `useModuleTour('consumer.invoices', …)`.
- `consumer-profile-board.tsx`: `profile.details` on the contact/address section, `profile.type` on the user-type editor; `useModuleTour('consumer.profile', …)`.
- `registry.ts`: import all five, delete `placeholderTour`.

- [ ] **Step 4: Verify** — `pnpm --filter @wusuq/web test && pnpm --filter @wusuq/web typecheck && pnpm --filter @wusuq/web lint && pnpm --filter @wusuq/web build` — all green. Mutation-test the no-placeholder assertion (temporarily set one tour's `steps: []` → FAIL; restore).

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(tours): drafts, case files, documents, invoices and profile tours

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>" -- apps/web/lib/tours apps/web/components/drafts-board.tsx apps/web/components/case-files-board.tsx apps/web/components/consumer-cases-board.tsx apps/web/components/consumer-documents-board.tsx "apps/web/app/(consumer)/consumer/files/personal-files-client.tsx" apps/web/components/consumer-invoices-board.tsx apps/web/components/consumer-profile-board.tsx
```

---

### Task 7: Playwright E2E + CLAUDE.md

**Files:**
- Create: `tests/e2e/guided-tours.spec.ts`
- Modify: `CLAUDE.md` (new "Guided tours" architecture section + session-log entry)

- [ ] **Step 1: Write the E2E** using the mock-API pattern from `tests/e2e/consumer-ticket-actions.spec.ts` (copy its `buildFakeJwt`, `FAR_FUTURE_EXP`, `seedAuth`; the catch-all `page.route(/\/api\/.*/…)` returning `{}` first, then specific routes). Tests:

1. **Fresh consumer sees getting-started, then the page tour.** Route `GET **/api/tours/progress` → `[]`; record `PUT **/api/tours/progress/*` bodies. Go to `/consumer/my-tickets` (route the tickets list to `[]`). Expect `.driver-popover` with title "Welcome to Wusuq". Click "Next" until the last step, click "Done". Expect a PUT to `/tours/progress/consumer.getting-started` with `{ status: 'COMPLETED', version: 1 }`. Then expect the popover title "Filter by stage" (My Tickets tour).
2. **Skip persists.** Progress `[]`; on the first popover press `Escape`; expect a PUT with `status: 'DISMISSED'`. Reload with progress now containing both `consumer.getting-started` and `consumer.my-tickets` at version 1 → no `.driver-popover` within 2 s.
3. **Replay from the ? menu.** Progress has every consumer tour at version 1 → no popover; click `[aria-label="Guided tours"]` → "Tour this page" → popover "Filter by stage" appears.
4. **Impersonation does not persist.** `addInitScript` also sets `wusuq_impersonator_access_token`. Progress `[]` → no popover within 2 s; open the ? menu → "Getting started" → popover appears; press Escape → **no** PUT was sent.
5. **Unloadable progress = no tour.** Progress route → 500 → no popover within 2 s.

- [ ] **Step 2: Run** — `pnpm e2e -- tests/e2e/guided-tours.spec.ts` — Expected: 5 passed. Then run the full `pnpm e2e` and compare with `main`: no **new** failures (the pre-existing flaky specs are documented in CLAUDE.md 2026-07-23).

- [ ] **Step 3: Document in CLAUDE.md** — add a `### Guided tours (2026-09-23)` section after "Unified multi-ticket invoice" covering: shared `TOUR_IDS`/`TOUR_META` is the only id list (bump `version` to replay); `UserTourProgress` upsert + self-scoped `/tours/progress`; `data-tour` targets + the registry guard; the `ready` rule (never `!loading` when loading starts false); fail-closed progress loading (and why it keeps other E2E specs overlay-free); impersonation = no auto-play/no save; phase 2 = staff tours + mounting `TourProvider` in the portal layout. Enrich today's session-log entry.

- [ ] **Step 4: Commit**

```bash
git commit -m "test(tours): guided-tour E2E; docs: guided tours in CLAUDE.md

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>" -- tests/e2e/guided-tours.spec.ts CLAUDE.md
```

---

### Controller steps after Task 7 (not implementer tasks)

1. **Code review** of the whole branch (global rule: review before push).
2. **Apply the migration to Neon — only after explicit owner confirmation** (prod DB): `cd apps/api && npx prisma db execute --file prisma/migrations/20260923000000_add_user_tour_progress/migration.sql --schema prisma/schema.prisma && npx prisma migrate resolve --applied 20260923000000_add_user_tour_progress`, then `npx prisma migrate status` → up to date.
3. **Browser QA** of all 12 consumer tours at desktop and phone width (local web + API).
4. Phase 2 (staff/admin) gets its own plan.
