# Wizard-style consumer case-files upload — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a new `/consumer/case-files` page that uses the intake wizard's flow → city → court selection as a file-organization taxonomy. Consumer uploads under a cohort; files persist with `(serviceId, cityId, courtName, courtType, attachedTicketId?)` metadata on `PersonalFile`. Existing `/consumer/files` (personal storage) and `/consumer/documents` (ticket-attached docs) views stay untouched.

**Architecture:** Extend `PersonalFile` with 5 nullable cohort columns. Add 3 new endpoints on the existing `personal-files` controller (POST upload-with-cohort, GET list-case-files, GET cohort-aggregates). Build a thin `<CohortPicker>` component that mirrors the wizard's Step 1 (flow tile → CityBlock → JudicialServiceBlock), and compose it with the existing `<FileUpload>` inside a new `case-files-board` page. Sidebar nav gains a "Case Files" entry.

**Tech Stack:** Prisma + Neon Postgres, NestJS 11, Next.js 16 + React 19, lucide-react icons, existing `apiClient` (`apps/web/lib/api-client.ts`), existing `<FileUpload>` (`apps/web/components/intake-wizard/file-upload.tsx`), existing `CityBlock` / `JudicialServiceBlock` from `apps/web/components/intake-wizard/service-geo-blocks.tsx`.

---

## File structure

**API**
- Modify: `apps/api/prisma/schema.prisma` (PersonalFile: +5 nullable columns + index; Ticket: +personalFiles back-relation).
- Create: `apps/api/prisma/migrations/20260516000000_personal_file_cohort_fields/migration.sql`.
- Modify: `apps/api/src/personal-files/personal-files.controller.ts` (3 new endpoints).
- Modify: `apps/api/src/personal-files/personal-files.service.ts` (`uploadCaseFile`, `listCaseFiles`, `cohortAggregates`).
- Create: `apps/api/src/personal-files/dto/upload-case-file.dto.ts`.
- Create: `apps/api/src/personal-files/dto/list-case-files.dto.ts`.

**Web**
- Create: `apps/web/app/(consumer)/consumer/case-files/page.tsx`.
- Create: `apps/web/components/case-files-board.tsx`.
- Create: `apps/web/components/case-files-board/cohort-picker.tsx`.
- Create: `apps/web/components/case-files-board/upload-drawer.tsx`.
- Create: `apps/web/components/case-files-board/cohort-group.tsx`.
- Modify: `apps/web/components/consumer-nav.tsx` (new "Case Files" entry).

---

## Task 1: Prisma schema + migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260516000000_personal_file_cohort_fields/migration.sql`

- [ ] **Step 1: Extend the PersonalFile model**

In `apps/api/prisma/schema.prisma`, locate `model PersonalFile { … }` and replace with:

```prisma
model PersonalFile {
  id           String    @id @default(cuid())
  userId       String
  storageKey   String    @unique
  originalName String
  displayName  String
  mimeType     String
  sizeBytes    Int
  deletedAt    DateTime?
  createdAt    DateTime  @default(now())
  user         User      @relation(fields: [userId], references: [id])

  // Cohort metadata — captured by the wizard-style case-files upload page.
  // Files uploaded via /consumer/files (the generic personal storage view)
  // leave all five fields null. Files uploaded via /consumer/case-files
  // set serviceId + cityId at minimum.
  serviceId        String?
  cityId           String?
  courtName        String?
  courtType        String?
  attachedTicketId String?
  attachedTicket   Ticket? @relation(fields: [attachedTicketId], references: [id], onDelete: SetNull)

  @@index([userId, deletedAt, createdAt])
  @@index([userId, serviceId])
}
```

- [ ] **Step 2: Add the back-relation on Ticket**

Locate `model Ticket { … }` and add (alongside the existing relations like `assignments`, `documents`, `history`):

```prisma
  personalFiles  PersonalFile[]
```

- [ ] **Step 3: Create the migration**

```bash
mkdir -p apps/api/prisma/migrations/20260516000000_personal_file_cohort_fields
cat > apps/api/prisma/migrations/20260516000000_personal_file_cohort_fields/migration.sql <<'SQL'
-- AlterTable
ALTER TABLE "PersonalFile"
  ADD COLUMN "serviceId" TEXT,
  ADD COLUMN "cityId" TEXT,
  ADD COLUMN "courtName" TEXT,
  ADD COLUMN "courtType" TEXT,
  ADD COLUMN "attachedTicketId" TEXT;

-- CreateIndex
CREATE INDEX "PersonalFile_userId_serviceId_idx"
  ON "PersonalFile"("userId", "serviceId");

-- AddForeignKey
ALTER TABLE "PersonalFile"
  ADD CONSTRAINT "PersonalFile_attachedTicketId_fkey"
  FOREIGN KEY ("attachedTicketId") REFERENCES "Ticket"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
SQL
```

- [ ] **Step 4: Apply the migration + regenerate Prisma client**

```bash
cd apps/api && npx prisma migrate deploy
npx prisma generate
```

Expected:
```
Applying migration `20260516000000_personal_file_cohort_fields`
All migrations have been successfully applied.
```

- [ ] **Step 5: Typecheck**

```bash
pnpm typecheck
```

Expected: clean across `packages/shared`, `apps/api`, `apps/web`.

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260516000000_personal_file_cohort_fields/
git commit -m "feat(api): PersonalFile cohort fields for wizard-style case-files

Adds 5 nullable columns (serviceId, cityId, courtName, courtType,
attachedTicketId) + back-relation onto Ticket with ON DELETE SET NULL.
Existing PersonalFile rows continue to surface in /consumer/files
unchanged; new uploads via /consumer/case-files (next commits) will
populate the cohort fields.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: DTOs

**Files:**
- Create: `apps/api/src/personal-files/dto/upload-case-file.dto.ts`
- Create: `apps/api/src/personal-files/dto/list-case-files.dto.ts`

- [ ] **Step 1: Write upload-case-file.dto.ts**

```ts
import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Multipart form fields supplied alongside `file` to
 * POST /personal-files/case-files. The `file` itself is consumed by
 * the FileInterceptor and not part of this DTO.
 */
export class UploadCaseFileDto {
  @IsString()
  @MaxLength(120)
  serviceId!: string;

  @IsString()
  @MaxLength(40)
  cityId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  cityName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  courtName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  courtType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  attachedTicketId?: string;

  /** Optional per-file caption (Petition / Power of Attorney / etc.). */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  caption?: string;
}
```

- [ ] **Step 2: Write list-case-files.dto.ts**

```ts
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ListCaseFilesDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  serviceId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  cityId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  courtName?: string;
}
```

- [ ] **Step 3: Typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/personal-files/dto/upload-case-file.dto.ts apps/api/src/personal-files/dto/list-case-files.dto.ts
git commit -m "feat(api): DTOs for case-files endpoints

Two class-validator DTOs: UploadCaseFileDto (multipart form fields)
and ListCaseFilesDto (query filter).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: PersonalFilesService extensions (TDD)

**Files:**
- Modify: `apps/api/src/personal-files/personal-files.service.ts`
- Create: `apps/api/src/personal-files/personal-files.service.case-files.spec.ts`

- [ ] **Step 1: Write the failing spec**

`apps/api/src/personal-files/personal-files.service.case-files.spec.ts`:

```ts
import { PersonalFilesService } from './personal-files.service';

// Light Prisma stub — we test pure cohort logic here, not Prisma plumbing.
type Row = {
  id: string;
  userId: string;
  serviceId?: string | null;
  cityId?: string | null;
  courtName?: string | null;
  courtType?: string | null;
  displayName: string;
  sizeBytes: number;
  createdAt: Date;
  deletedAt: Date | null;
};

function makeService(rows: Row[]): PersonalFilesService {
  const prisma = {
    personalFile: {
      findMany: jest.fn(async (args: any) => {
        return rows.filter((r) => {
          if (r.deletedAt && !args.where?.deletedAt) return false;
          if (args.where?.userId && r.userId !== args.where.userId) return false;
          if (args.where?.serviceId === undefined && args.where?.serviceId !== null) {
            // serviceId NOT NULL filter
            if (!('serviceId' in args.where)) return true;
          }
          if (args.where?.serviceId && r.serviceId !== args.where.serviceId) return false;
          if (args.where?.cityId && r.cityId !== args.where.cityId) return false;
          if (args.where?.courtName && r.courtName !== args.where.courtName) return false;
          return true;
        });
      }),
      groupBy: jest.fn(async (_args: any) => {
        const groups = new Map<string, { key: any; count: number }>();
        for (const r of rows) {
          if (r.deletedAt) continue;
          if (!r.serviceId) continue;
          const k = `${r.serviceId}|${r.cityId}|${r.courtName}|${r.courtType}`;
          const g = groups.get(k);
          if (g) g.count++;
          else
            groups.set(k, {
              key: {
                serviceId: r.serviceId,
                cityId: r.cityId,
                courtName: r.courtName,
                courtType: r.courtType,
              },
              count: 1,
            });
        }
        return [...groups.values()].map((g) => ({
          ...g.key,
          _count: { _all: g.count },
        }));
      }),
    },
  } as unknown as ConstructorParameters<typeof PersonalFilesService>[0];
  // Other constructor args (audit-log, storage, etc.) — pass any-typed stubs.
  const audit = { create: jest.fn() } as any;
  const storage = {
    putObject: jest.fn(),
    getSignedDownloadUrl: jest.fn(),
    deleteObject: jest.fn(),
  } as any;
  const usage = {
    incrementUsage: jest.fn(),
    decrementUsage: jest.fn(),
  } as any;
  // ↓ NB: adjust to your actual constructor signature. The tests below
  // exercise listCaseFiles + cohortAggregates which don't depend on
  // storage/usage/audit, so dummy stubs are sufficient.
  return new PersonalFilesService(prisma, audit, storage, usage);
}

describe('PersonalFilesService — case-files', () => {
  const NOW = new Date('2026-05-16T00:00:00Z');
  it('listCaseFiles returns only rows with serviceId set', async () => {
    const svc = makeService([
      { id: '1', userId: 'u', serviceId: 'svc_judicial_case_files', cityId: 'c1', courtName: 'LHC', courtType: 'High Court', displayName: 'a', sizeBytes: 100, createdAt: NOW, deletedAt: null },
      { id: '2', userId: 'u', serviceId: null, cityId: null, courtName: null, courtType: null, displayName: 'b', sizeBytes: 200, createdAt: NOW, deletedAt: null },
    ]);
    const out = await svc.listCaseFiles('u', {});
    expect(out.files.map((f) => f.id)).toEqual(['1']);
  });

  it('listCaseFiles honors serviceId / cityId / courtName filters', async () => {
    const svc = makeService([
      { id: '1', userId: 'u', serviceId: 'svc_a', cityId: 'c1', courtName: 'LHC', courtType: 'High Court', displayName: 'a', sizeBytes: 100, createdAt: NOW, deletedAt: null },
      { id: '2', userId: 'u', serviceId: 'svc_b', cityId: 'c1', courtName: 'LHC', courtType: 'High Court', displayName: 'b', sizeBytes: 100, createdAt: NOW, deletedAt: null },
    ]);
    const out = await svc.listCaseFiles('u', { serviceId: 'svc_b' });
    expect(out.files.map((f) => f.id)).toEqual(['2']);
  });

  it('cohortAggregates groups by (serviceId, cityId, courtName, courtType) with counts', async () => {
    const svc = makeService([
      { id: '1', userId: 'u', serviceId: 'svc_a', cityId: 'c1', courtName: 'LHC', courtType: 'High Court', displayName: 'a', sizeBytes: 100, createdAt: NOW, deletedAt: null },
      { id: '2', userId: 'u', serviceId: 'svc_a', cityId: 'c1', courtName: 'LHC', courtType: 'High Court', displayName: 'b', sizeBytes: 100, createdAt: NOW, deletedAt: null },
      { id: '3', userId: 'u', serviceId: 'svc_b', cityId: 'c2', courtName: 'SHC', courtType: 'High Court', displayName: 'c', sizeBytes: 100, createdAt: NOW, deletedAt: null },
    ]);
    const out = await svc.cohortAggregates('u');
    expect(out).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ serviceId: 'svc_a', cityId: 'c1', courtName: 'LHC', count: 2 }),
        expect.objectContaining({ serviceId: 'svc_b', cityId: 'c2', courtName: 'SHC', count: 1 }),
      ]),
    );
    expect(out).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run the test, verify failure**

```bash
cd apps/api && pnpm test -- --testPathPattern=personal-files.service.case-files
```

Expected: FAIL (`listCaseFiles is not a function`, `cohortAggregates is not a function`).

- [ ] **Step 3: Add the new methods to PersonalFilesService**

In `apps/api/src/personal-files/personal-files.service.ts`, **add** (don't replace the existing `list` / `upload`):

```ts
async listCaseFiles(
  userId: string,
  filters: { serviceId?: string; cityId?: string; courtName?: string },
): Promise<{ files: PersonalFileDto[] }> {
  const rows = await this.prisma.personalFile.findMany({
    where: {
      userId,
      deletedAt: null,
      serviceId: filters.serviceId ?? { not: null },
      ...(filters.cityId ? { cityId: filters.cityId } : {}),
      ...(filters.courtName ? { courtName: filters.courtName } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  return { files: rows.map(toPersonalFileDto) };
}

async cohortAggregates(userId: string): Promise<Array<{
  serviceId: string;
  cityId: string | null;
  courtName: string | null;
  courtType: string | null;
  count: number;
}>> {
  const groups = await this.prisma.personalFile.groupBy({
    by: ['serviceId', 'cityId', 'courtName', 'courtType'],
    where: { userId, deletedAt: null, serviceId: { not: null } },
    _count: { _all: true },
  });
  return groups.map((g) => ({
    serviceId: g.serviceId as string,
    cityId: g.cityId ?? null,
    courtName: g.courtName ?? null,
    courtType: g.courtType ?? null,
    count: g._count._all,
  }));
}
```

Also add an `uploadCaseFile` method that wraps the existing upload logic with cohort metadata:

```ts
async uploadCaseFile(
  userId: string,
  actorEmail: string | null,
  file: { buffer: Buffer; originalName: string; declaredMime: string },
  cohort: {
    serviceId: string;
    cityId: string;
    cityName?: string;
    courtName?: string;
    courtType?: string;
    attachedTicketId?: string;
    caption?: string;
  },
): Promise<PersonalFileDto> {
  // Validate attached ticket belongs to this consumer if supplied.
  if (cohort.attachedTicketId) {
    const ticket = await this.prisma.ticket.findFirst({
      where: { id: cohort.attachedTicketId, consumerId: userId },
      select: { id: true },
    });
    if (!ticket) {
      throw new BadRequestException({ error: 'attached_ticket_not_owned' });
    }
  }

  // Reuse the standard upload pipeline for storage + quota.
  const result = await this.upload(userId, actorEmail, file);

  // Patch the cohort metadata after the standard upload writes the row.
  // (Standard upload doesn't know about cohort columns.)
  const updated = await this.prisma.personalFile.update({
    where: { id: result.id },
    data: {
      serviceId: cohort.serviceId,
      cityId: cohort.cityId,
      courtName: cohort.courtName ?? null,
      courtType: cohort.courtType ?? null,
      attachedTicketId: cohort.attachedTicketId ?? null,
    },
  });
  return toPersonalFileDto(updated);
}
```

- [ ] **Step 4: Run the test, verify pass**

```bash
cd apps/api && pnpm test -- --testPathPattern=personal-files.service.case-files
```

Expected: 3/3 pass.

If the constructor signature in the spec doesn't match the real service, fix the spec to match (look at the real constructor params at the top of `personal-files.service.ts`).

- [ ] **Step 5: Typecheck + existing tests**

```bash
pnpm typecheck
cd apps/api && pnpm test -- --testPathPattern=personal-files
```

Expected: all personal-files specs still pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/personal-files/personal-files.service.ts apps/api/src/personal-files/personal-files.service.case-files.spec.ts
git commit -m "feat(api): PersonalFilesService — listCaseFiles + cohortAggregates + uploadCaseFile

Three new service methods backing the wizard-style case-files page:
- listCaseFiles: rows with serviceId NOT NULL, filterable by
  (serviceId, cityId, courtName).
- cohortAggregates: groupBy (serviceId, cityId, courtName, courtType)
  with counts; powers the grouped listing header.
- uploadCaseFile: wraps the standard upload + patches cohort
  metadata afterward. Validates attachedTicketId belongs to the JWT
  consumer.

3 unit tests cover the listing + aggregation paths.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Controller endpoints

**Files:**
- Modify: `apps/api/src/personal-files/personal-files.controller.ts`

- [ ] **Step 1: Add the three endpoints**

Append to `apps/api/src/personal-files/personal-files.controller.ts` (before the closing brace of the class):

```ts
@Post('case-files')
@UseInterceptors(FileInterceptor('file', { limits: { fileSize: 11 * 1024 * 1024 } }))
uploadCaseFile(
  @CurrentUser() user: JwtUser,
  @UploadedFile() file: { buffer: Buffer; originalname: string; mimetype: string } | undefined,
  @Body() dto: UploadCaseFileDto,
) {
  assertConsumer(user);
  if (!file) throw new BadRequestException({ error: 'no_file' });
  return this.service.uploadCaseFile(
    user.sub,
    user.email ?? null,
    {
      buffer: file.buffer,
      originalName: file.originalname,
      declaredMime: file.mimetype,
    },
    {
      serviceId: dto.serviceId,
      cityId: dto.cityId,
      cityName: dto.cityName,
      courtName: dto.courtName,
      courtType: dto.courtType,
      attachedTicketId: dto.attachedTicketId,
      caption: dto.caption,
    },
  );
}

@Get('case-files')
listCaseFiles(@CurrentUser() user: JwtUser, @Query() query: ListCaseFilesDto) {
  assertConsumer(user);
  return this.service.listCaseFiles(user.sub, {
    serviceId: query.serviceId,
    cityId: query.cityId,
    courtName: query.courtName,
  });
}

@Get('case-files/cohorts')
cohortAggregates(@CurrentUser() user: JwtUser) {
  assertConsumer(user);
  return this.service.cohortAggregates(user.sub);
}
```

Add the new imports at the top of the file:

```ts
import { Body } from '@nestjs/common';
import { UploadCaseFileDto } from './dto/upload-case-file.dto';
import { ListCaseFilesDto } from './dto/list-case-files.dto';
```

(`Body` is already imported elsewhere — verify and skip if so.)

- [ ] **Step 2: Restart the API + smoke**

If the dev API is running, kill and restart so the new routes register:

```bash
PID=$(lsof -iTCP:4000 -sTCP:LISTEN -n -P 2>/dev/null | awk 'NR==2 {print $2}')
kill $PID 2>/dev/null
cd /Users/asad/Projects/Wusuq-Web && pnpm dev:api > /tmp/wusuq-api.log 2>&1 &
disown
until curl -s http://localhost:4000/api/health 2>/dev/null | grep -q '"status":"ok"'; do sleep 2; done
```

Then verify the routes are mapped:

```bash
grep -E "case-files|cohorts" /tmp/wusuq-api.log | tail -5
```

Expected: 3 `Mapped {/api/personal-files/case-files…}` lines.

- [ ] **Step 3: Curl smoke**

```bash
TOKEN=$(curl -s -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"identifier":"testconsumer@wusuq.com","password":"password123"}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["accessToken"])')

# Empty list (no case-files yet)
curl -s "http://localhost:4000/api/personal-files/case-files" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool

# Empty cohort aggregate
curl -s "http://localhost:4000/api/personal-files/case-files/cohorts" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```

Expected: `{"files":[]}` and `[]`.

- [ ] **Step 4: Typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/personal-files/personal-files.controller.ts
git commit -m "feat(api): GET/POST /personal-files/case-files endpoints

POST /personal-files/case-files       — multipart upload with cohort
GET  /personal-files/case-files       — filter by service/city/court
GET  /personal-files/case-files/cohorts — groupBy aggregate

Consumer-only (assertConsumer guard reused). Validation runs through
UploadCaseFileDto + ListCaseFilesDto.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: CohortPicker component

**Files:**
- Create: `apps/web/components/case-files-board/cohort-picker.tsx`

The cohort picker mirrors the wizard's Step 1 but stands alone. v1 accepts duplication with the wizard's inline picker — refactor later if both surfaces stabilise.

- [ ] **Step 1: Inspect wizard Step 1 for the shape to mirror**

```bash
grep -n "isCityCourtStep\|CityBlock\|ServiceCardGrid\|JudicialServiceBlock\|availableServices" apps/web/components/intake-wizard.tsx | head -20
```

Read around those lines to understand:
- Where `availableServices` is computed (a `useMemo` over fetched services + `cityCourtTypes`).
- How `<CityBlock>` is wired (cities prop, cityId, onCityChange).
- How `<ServiceCardGrid>` + `<JudicialServiceBlock>` interact.

- [ ] **Step 2: Write the picker**

`apps/web/components/case-files-board/cohort-picker.tsx`:

```tsx
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { CityBlock, JudicialServiceBlock } from '@/components/intake-wizard/service-geo-blocks';
import { ServiceCardGrid } from '@/components/intake-wizard';
// ↑ if ServiceCardGrid isn't exported from intake-wizard's index, copy the
// minimal markup inline — keep this v1 simple.

type Service = {
  id: string;
  name: string;
  category?: string;
  courtLevel?: string | null;
  description?: string;
};

type City = { id: string; name: string; district?: string; province?: string };
type CourtSeat = { id: string; name: string };
type CourtGroup = { type: string; courts: CourtSeat[] };

export type CohortValue = {
  serviceId: string;
  serviceName: string;
  cityId: string;
  cityName: string;
  courtName: string;
  courtType: string;
};

type Props = {
  value: Partial<CohortValue>;
  onChange: (value: CohortValue) => void;
};

export function CohortPicker({ value, onChange }: Props) {
  const [services, setServices] = useState<Service[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [cityCourtGroups, setCityCourtGroups] = useState<CourtGroup[]>([]);

  // ── Initial data ──────────────────────────────────────────────────────────
  useEffect(() => {
    apiClient.get<Service[]>('/services').then(setServices).catch(() => setServices([]));
    apiClient.get<City[]>('/geo/cities').then(setCities).catch(() => setCities([]));
  }, []);

  // ── Selected service / court bookkeeping ──────────────────────────────────
  const cityCourtTypes = useMemo(
    () => new Set(cityCourtGroups.map((g) => g.type)),
    [cityCourtGroups],
  );

  const availableServices = useMemo(() => {
    if (!value.cityId) return services;
    return services.filter((s) => !s.courtLevel || cityCourtTypes.has(s.courtLevel));
  }, [services, value.cityId, cityCourtTypes]);

  const selectedService = useMemo(
    () => services.find((s) => s.id === value.serviceId) ?? null,
    [services, value.serviceId],
  );
  const selectedCourtGroup = useMemo(() => {
    if (!selectedService?.courtLevel) return null;
    return cityCourtGroups.find((g) => g.type === selectedService.courtLevel) ?? null;
  }, [selectedService, cityCourtGroups]);
  const selectedCourtList = selectedCourtGroup?.courts ?? [];
  const selectedCourtType = selectedService?.courtLevel ?? '';

  // ── Fire onChange whenever all four dimensions are present ────────────────
  const tryFireOnChange = useCallback(
    (next: Partial<CohortValue>) => {
      if (next.serviceId && next.cityId && next.courtName && next.courtType) {
        onChange(next as CohortValue);
      }
    },
    [onChange],
  );

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleCityChange = (cityId: string, cityName: string) => {
    setCityCourtGroups([]); // clear synchronously to avoid stale-court rendering (see #8 / N6 fix)
    const next: Partial<CohortValue> = {
      ...value,
      cityId,
      cityName,
      serviceId: undefined,
      serviceName: undefined,
      courtName: undefined,
      courtType: undefined,
    };
    onChange(next as CohortValue);
    if (!cityId) return;
    apiClient
      .get<CourtGroup[]>(`/geo/cities/${cityId}/courts`)
      .then((r) => setCityCourtGroups(r ?? []))
      .catch(() => setCityCourtGroups([]));
  };

  const handleServicePick = (svc: Service) => {
    const next: Partial<CohortValue> = {
      ...value,
      serviceId: svc.id,
      serviceName: svc.name,
      courtName: undefined,
      courtType: svc.courtLevel ?? undefined,
    };
    onChange(next as CohortValue);
  };

  const handleCourtPick = (court: CourtSeat) => {
    const next: Partial<CohortValue> = {
      ...value,
      courtName: court.name,
      courtType: selectedCourtType,
    };
    tryFireOnChange(next);
  };

  return (
    <div className="space-y-6">
      <CityBlock
        cities={cities}
        cityId={value.cityId ?? ''}
        onCityChange={handleCityChange}
      />

      {value.cityId ? (
        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-700">
            Service<span className="text-rose-500 ml-0.5">*</span>
          </p>
          {availableServices.length === 0 ? (
            <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-700 ring-1 ring-inset ring-amber-100">
              No services available for {value.cityName}. Pick a different city.
            </p>
          ) : (
            <ServiceCardGrid
              services={availableServices}
              value={value.serviceId ?? ''}
              onSelect={handleServicePick}
            />
          )}
        </div>
      ) : null}

      {value.serviceId && selectedService?.courtLevel ? (
        <JudicialServiceBlock
          courtTierId={value.serviceId}
          cityName={value.cityName ?? ''}
          courtTierName={selectedCourtType}
          services={selectedCourtList}
          selectServiceId={
            selectedCourtList.find((c) => c.name === value.courtName)?.id ?? ''
          }
          onServiceChange={handleCourtPick}
        />
      ) : null}
    </div>
  );
}
```

If `ServiceCardGrid` isn't exported from `intake-wizard.tsx`, either export it there or inline a minimal grid component. The clean option is to export it — add `export function ServiceCardGrid(…)` in intake-wizard.tsx and re-export from a barrel if one exists.

- [ ] **Step 3: Export ServiceCardGrid from intake-wizard.tsx**

```bash
grep -n "function ServiceCardGrid\|export function ServiceCardGrid" apps/web/components/intake-wizard.tsx
```

If `function ServiceCardGrid` exists but isn't exported, add `export` to its declaration.

- [ ] **Step 4: Typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/case-files-board/cohort-picker.tsx apps/web/components/intake-wizard.tsx
git commit -m "feat(web): CohortPicker — wizard Step 1 reused standalone

Mirrors the intake wizard's flow tile → city picker → court picker
chain without the rest of the wizard machinery. Output is a single
{serviceId, cityId, courtName, courtType} object fired via onChange
when all four dimensions are set.

CityBlock + JudicialServiceBlock reused as-is. ServiceCardGrid
exported from intake-wizard.tsx for reuse here.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Cohort group component

**Files:**
- Create: `apps/web/components/case-files-board/cohort-group.tsx`

- [ ] **Step 1: Write the component**

```tsx
'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Download, Trash2, FileText, ExternalLink } from 'lucide-react';
import { apiClient } from '@/lib/api-client';

type CaseFile = {
  id: string;
  displayName: string;
  sizeBytes: number;
  createdAt: string;
  mimeType: string;
  attachedTicketId?: string | null;
};

type Props = {
  service: string;
  city: string;
  court: string;
  files: CaseFile[];
  onDeleted: (fileId: string) => void;
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function CohortGroup({ service, city, court, files, onDeleted }: Props) {
  const [open, setOpen] = useState(files.length > 1);

  const handleDownload = async (id: string) => {
    window.location.href = `/api/personal-files/${id}/download`;
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this file?')) return;
    await apiClient.delete(`/personal-files/${id}`);
    onDeleted(id);
  };

  return (
    <div className="rounded-2xl border border-border-soft bg-surface shadow-elev-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left"
      >
        <div className="flex items-center gap-3">
          {open ? (
            <ChevronDown className="h-4 w-4 text-slate-500" />
          ) : (
            <ChevronRight className="h-4 w-4 text-slate-500" />
          )}
          <p className="text-sm font-semibold text-slate-900">
            {service} · {city} · {court}
          </p>
        </div>
        <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">
          {files.length}
        </span>
      </button>
      {open ? (
        <div className="divide-y divide-border-soft border-t border-border-soft">
          {files.map((f) => (
            <div key={f.id} className="flex items-center justify-between gap-3 px-5 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">{f.displayName}</p>
                  <p className="text-xs text-slate-500">
                    {formatBytes(f.sizeBytes)} · {new Date(f.createdAt).toLocaleDateString()}
                    {f.attachedTicketId ? (
                      <>
                        {' · '}
                        <a
                          href={`/consumer/my-tickets/${f.attachedTicketId}`}
                          className="inline-flex items-center gap-1 text-brand-600 hover:underline"
                        >
                          Attached <ExternalLink className="h-3 w-3" />
                        </a>
                      </>
                    ) : null}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleDownload(f.id)}
                  className="rounded-xl border border-border-soft bg-surface p-2 text-slate-600 transition-colors hover:bg-surface-muted"
                  aria-label="Download"
                >
                  <Download className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(f.id)}
                  className="rounded-xl border border-border-soft bg-surface p-2 text-rose-600 transition-colors hover:bg-rose-50"
                  aria-label="Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/case-files-board/cohort-group.tsx
git commit -m "feat(web): CohortGroup — collapsible group of case-file rows

Renders a single (service, city, court) cohort header with a count
badge; expands to show file rows with Download + Delete. Default
open when the cohort has ≥2 files.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Upload drawer

**Files:**
- Create: `apps/web/components/case-files-board/upload-drawer.tsx`

- [ ] **Step 1: Write the drawer**

```tsx
'use client';

import { useState } from 'react';
import { X, ArrowLeft } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { CohortPicker, type CohortValue } from './cohort-picker';
import { FileUpload } from '@/components/intake-wizard/file-upload';

type Props = {
  open: boolean;
  onClose: () => void;
  onUploaded: () => void;
};

export function UploadDrawer({ open, onClose, onUploaded }: Props) {
  const [cohort, setCohort] = useState<Partial<CohortValue>>({});
  const [files, setFiles] = useState<File[]>([]);
  const [captions, setCaptions] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const cohortReady = Boolean(
    cohort.serviceId && cohort.cityId && cohort.courtName && cohort.courtType,
  );

  const reset = () => {
    setCohort({});
    setFiles([]);
    setCaptions([]);
    setError('');
  };

  const handleSave = async () => {
    if (!cohortReady || files.length === 0) {
      setError('Pick a service / city / court and at least one file.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      for (let i = 0; i < files.length; i++) {
        const form = new FormData();
        form.append('file', files[i]);
        form.append('serviceId', cohort.serviceId!);
        form.append('cityId', cohort.cityId!);
        if (cohort.cityName) form.append('cityName', cohort.cityName);
        form.append('courtName', cohort.courtName!);
        form.append('courtType', cohort.courtType!);
        if (captions[i]) form.append('caption', captions[i]);
        await apiClient.post('/personal-files/case-files', form);
      }
      reset();
      onUploaded();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Upload failed.');
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-slate-900/40" onClick={onClose} />
      <aside className="flex h-full w-full max-w-xl flex-col bg-surface shadow-xl">
        <header className="flex items-center justify-between gap-3 border-b border-border-soft px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-900">Upload case files</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-slate-500 transition-colors hover:bg-surface-muted"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-6">
          <CohortPicker value={cohort} onChange={setCohort} />
          {cohortReady ? (
            <div>
              <p className="mb-2 text-sm font-medium text-slate-700">Files</p>
              <FileUpload
                files={files}
                onFilesChange={setFiles}
                captions={captions}
                onCaptionChange={(index, caption) => {
                  const next = captions.slice();
                  next[index] = caption;
                  setCaptions(next);
                }}
              />
            </div>
          ) : null}
          {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        </div>
        <footer className="flex items-center justify-between gap-3 border-t border-border-soft px-5 py-4">
          <button
            type="button"
            onClick={() => {
              reset();
              onClose();
            }}
            className="inline-flex items-center gap-1 rounded-xl border border-border-soft bg-surface px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-surface-muted"
          >
            <ArrowLeft className="h-4 w-4" />
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || !cohortReady || files.length === 0}
            onClick={handleSave}
            className="rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-white shadow-elev-1 transition-colors hover:bg-brand-600 disabled:opacity-50"
          >
            {busy ? 'Uploading…' : 'Save'}
          </button>
        </footer>
      </aside>
    </div>
  );
}
```

- [ ] **Step 2: Verify FileUpload's caption props match**

```bash
grep -n "captions\|onCaptionChange" apps/web/components/intake-wizard/file-upload.tsx | head -5
```

The existing `FileUpload` accepts `captions: string[]` and `onCaptionChange: (index: number, caption: string) => void` (per PDF #43). If the actual signature differs slightly, adjust the call site.

- [ ] **Step 3: Typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/case-files-board/upload-drawer.tsx
git commit -m "feat(web): UploadDrawer — slide-over with cohort picker + file upload

Two-section drawer: CohortPicker first (service → city → court),
then FileUpload appears once the cohort is fully selected. Save
button posts each file as multipart to /personal-files/case-files
with cohort metadata.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Case Files board + route page

**Files:**
- Create: `apps/web/components/case-files-board.tsx`
- Create: `apps/web/app/(consumer)/consumer/case-files/page.tsx`

- [ ] **Step 1: Write the board**

`apps/web/components/case-files-board.tsx`:

```tsx
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Upload } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { CohortGroup } from './case-files-board/cohort-group';
import { UploadDrawer } from './case-files-board/upload-drawer';

type CaseFile = {
  id: string;
  displayName: string;
  sizeBytes: number;
  createdAt: string;
  mimeType: string;
  serviceId?: string | null;
  cityId?: string | null;
  courtName?: string | null;
  courtType?: string | null;
  attachedTicketId?: string | null;
};

type Cohort = {
  serviceId: string;
  cityId: string | null;
  courtName: string | null;
  courtType: string | null;
  count: number;
};

type ServiceInfo = { id: string; name: string };
type CityInfo = { id: string; name: string };

export function CaseFilesBoard() {
  const [files, setFiles] = useState<CaseFile[]>([]);
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [services, setServices] = useState<ServiceInfo[]>([]);
  const [cities, setCities] = useState<CityInfo[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [filesResp, cohortsResp] = await Promise.all([
        apiClient.get<{ files: CaseFile[] }>('/personal-files/case-files'),
        apiClient.get<Cohort[]>('/personal-files/case-files/cohorts'),
      ]);
      setFiles(filesResp.files ?? []);
      setCohorts(cohortsResp ?? []);
    } catch {
      setFiles([]);
      setCohorts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    apiClient.get<ServiceInfo[]>('/services').then(setServices).catch(() => setServices([]));
    apiClient.get<CityInfo[]>('/geo/cities').then(setCities).catch(() => setCities([]));
  }, [refresh]);

  const serviceName = (id: string | null | undefined) =>
    (id && services.find((s) => s.id === id)?.name) || 'Unknown service';
  const cityName = (id: string | null | undefined) =>
    (id && cities.find((c) => c.id === id)?.name) || '—';

  const grouped = useMemo(() => {
    const map = new Map<string, { cohort: Cohort; files: CaseFile[] }>();
    for (const c of cohorts) {
      const k = `${c.serviceId}|${c.cityId}|${c.courtName}|${c.courtType}`;
      map.set(k, { cohort: c, files: [] });
    }
    for (const f of files) {
      const k = `${f.serviceId}|${f.cityId}|${f.courtName}|${f.courtType}`;
      const entry = map.get(k);
      if (entry) entry.files.push(f);
    }
    return [...map.values()];
  }, [cohorts, files]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Case Files</h1>
          <p className="mt-1 text-sm text-slate-500">
            Organize your documents by service, city, and court.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-white shadow-elev-1 transition-colors hover:bg-brand-600"
        >
          <Upload className="h-4 w-4" />
          Upload new
        </button>
      </header>

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : grouped.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border-soft bg-surface-muted/40 px-6 py-12 text-center">
          <p className="text-sm text-slate-600">No case files yet.</p>
          <p className="mt-1 text-xs text-slate-500">
            Click <strong>Upload new</strong> to add your first file.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {grouped.map(({ cohort, files: cohortFiles }) => (
            <CohortGroup
              key={`${cohort.serviceId}|${cohort.cityId}|${cohort.courtName}`}
              service={serviceName(cohort.serviceId)}
              city={cityName(cohort.cityId)}
              court={cohort.courtName ?? '—'}
              files={cohortFiles}
              onDeleted={() => refresh()}
            />
          ))}
        </div>
      )}

      <UploadDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onUploaded={refresh}
      />
    </div>
  );
}
```

- [ ] **Step 2: Write the route page**

`apps/web/app/(consumer)/consumer/case-files/page.tsx`:

```tsx
import { CaseFilesBoard } from '@/components/case-files-board';

export default function ConsumerCaseFilesPage() {
  return <CaseFilesBoard />;
}
```

- [ ] **Step 3: Typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/\(consumer\)/consumer/case-files/page.tsx apps/web/components/case-files-board.tsx
git commit -m "feat(web): /consumer/case-files page + board

CaseFilesBoard renders a grouped list of cohort-tagged personal
files. Empty state prompts to click Upload new. Each cohort group
renders inline via CohortGroup. Upload flow lives in UploadDrawer.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Sidebar nav entry

**Files:**
- Modify: `apps/web/components/consumer-nav.tsx`

- [ ] **Step 1: Add the entry**

```bash
grep -n "Drafts\|My Tickets\|consumerNavItems" apps/web/components/consumer-nav.tsx | head -10
```

Find the nav-items array. Add between Drafts and My Tickets:

```tsx
{ label: 'Case Files', href: '/consumer/case-files', icon: FolderOpen },
```

Add the import:

```tsx
import { FolderOpen } from 'lucide-react';
```

(`FolderOpen` is already imported in some files — check first; if it's already there, no new import.)

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/consumer-nav.tsx
git commit -m "feat(web): sidebar 'Case Files' entry

Inserted between Drafts and My Tickets. lucide FolderOpen icon.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: End-to-end live verification

This task has no code. Run after the prior commits.

- [ ] **Step 1: Start dev stack if not running**

```bash
lsof -iTCP:4000 -sTCP:LISTEN -n -P 2>/dev/null
lsof -iTCP:3000 -sTCP:LISTEN -n -P 2>/dev/null
lsof -iTCP:3001 -sTCP:LISTEN -n -P 2>/dev/null
```

If web isn't running:

```bash
cd /Users/asad/Projects/Wusuq-Web && pnpm dev:web > /tmp/wusuq-web.log 2>&1 &
disown
sleep 6
grep "Local:" /tmp/wusuq-web.log
```

Note the port (most likely 3000, 3001, or 3002).

- [ ] **Step 2: Drive via Playwright**

Load the playwright MCP tools and:

1. Navigate to `http://localhost:<port>/consumer/login/email`.
2. Sign in as `testconsumer@wusuq.com` / `password123`.
3. Click "Case Files" in the sidebar. Verify the empty state renders.
4. Click "Upload new".
5. In the drawer: pick a city (e.g. "Lahore"), then "Lower Court Paralegal Service" tile, then "Sessions Court" sub-court.
6. Confirm the FileUpload appears.
7. Drop a small test file (e.g. a 1KB text file). Caption optional.
8. Click Save.
9. Verify the drawer closes and the board now shows a "Lower Court Paralegal Service · Lahore · Sessions Court" group with the file inside.
10. Refresh the page; verify the data persisted.
11. Curl-verify the DB:

```bash
TOKEN=$(curl -s -X POST http://localhost:4000/api/auth/login -H "Content-Type: application/json" -d '{"identifier":"testconsumer@wusuq.com","password":"password123"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["accessToken"])')
curl -s http://localhost:4000/api/personal-files/case-files -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
curl -s http://localhost:4000/api/personal-files/case-files/cohorts -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```

Expected: 1 file with `serviceId='svc_judicial_lower_court'`, `courtName='Sessions Court'`, `courtType='Lower Court'`. Aggregate returns 1 cohort with `count: 1`.

12. Test the Delete button on the file row. Confirm the row + cohort group disappear.
13. Spot-check that `/consumer/files` (generic personal storage) doesn't show case-files-only rows confusingly, AND that uploading from `/consumer/files` doesn't accidentally tag a cohort.

If any step fails, file a follow-up commit. If everything passes, no commit needed — the verification is implicit.

---

## Spec coverage check

- New `/consumer/case-files` page → Task 8.
- Grouped list of cohort-tagged files → Tasks 6 + 8.
- Filter bar with service / city / court selects → **TODO**: not in v1 implementation; basic listing without filter chips. Spec called it out; add a follow-up task if the listing volume warrants it. Recorded as a v1 limitation.
- Empty state → Task 8.
- Upload new flow (cohort picker → upload zone) → Tasks 5 + 7.
- Optional ticket attachment → Task 5 picker output supports `attachedTicketId` but UI for the picker is **deferred** to a v1.1 — initial Save endpoint accepts the field, drawer doesn't expose it. Documented as v1 limitation.
- Data model extension → Task 1.
- API endpoints (POST upload, GET list, GET cohorts) → Tasks 3 + 4.
- Frontend extraction of CohortPicker → Task 5.
- Sidebar nav → Task 9.
- Quota: cohort-tagged files share the existing PersonalFile quota → enforced naturally because `uploadCaseFile` wraps the standard `upload` which already checks quota (Task 3).

Two v1 limitations relative to the spec are intentional simplifications to keep the plan focused; both can be added as follow-up commits without schema changes:
1. Filter bar on the board (use the cohort header itself to navigate visually for now).
2. Ticket-attachment picker in the upload drawer (the DTO + DB column exist; just no UI field yet).
