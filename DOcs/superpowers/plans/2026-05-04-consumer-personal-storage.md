# Consumer Personal Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `/consumer/files` — a private personal file library for consumers (PDFs, images, Office docs) — backed by a new `FileStorageProvider` abstraction with a working LocalDisk implementation in v1 and a scaffolded R2 implementation that activates when env vars are set.

**Architecture:** Backend adds `PersonalFile` and `UserStorageUsage` Prisma models, a `PersonalFilesService` doing magic-byte validation + transactional quota updates + collision-safe naming, and a `FileStorageProvider` interface with two implementations selected at boot by env. Soft delete with 30-day GC via a daily cron. Frontend adds a single new route with optimistic upload, search, and a recently-deleted subsection.

**Tech Stack:** NestJS 11, Prisma, Postgres (existing). New devDeps: `@nestjs/schedule`. New deps: `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, `file-type` (Node ESM). Next.js 16 App Router, React 19 for the consumer route. No new frontend deps.

**Spec:** `DOcs/superpowers/specs/2026-05-04-consumer-personal-storage-design.md`

**Per-task gating:** Per the user's standing rule, **never run `git commit`** without explicit user approval. Each task ends with a "Halt — request commit permission" step. Implementer leaves changes in the working tree.

---

## File Structure

**Backend (apps/api):**

- Modify: `apps/api/package.json` — add `@nestjs/schedule`, `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, `file-type` deps.
- Modify: `apps/api/prisma/schema.prisma` — add `PersonalFile`, `UserStorageUsage`, plus `personalFiles` and `storageUsage` relations on `User`.
- Create: `apps/api/prisma/migrations/<timestamp>_add_personal_files_and_storage_usage/migration.sql`
- Create: `apps/api/src/file-storage/file-storage-provider.ts` — interface + `FileStoragePutResult` types
- Create: `apps/api/src/file-storage/local-disk-file-storage.ts` — disk impl + signed-token LRU
- Create: `apps/api/src/file-storage/r2-file-storage.ts` — S3-SDK impl, env-driven
- Create: `apps/api/src/file-storage/file-storage.module.ts` — boot factory selecting impl by env
- Create: `apps/api/src/file-storage/local-files.controller.ts` — `/files/personal/:token` stream endpoint (LocalDisk only)
- Create: `apps/api/src/file-storage/README.md` — env vars + swap docs
- Create: `apps/api/src/personal-files/personal-files.module.ts`
- Create: `apps/api/src/personal-files/personal-files.controller.ts`
- Create: `apps/api/src/personal-files/personal-files.service.ts`
- Create: `apps/api/src/personal-files/personal-files.gc.ts` — `@Cron` daily hard-delete job
- Create: `apps/api/src/personal-files/dto/list-personal-files.dto.ts`
- Create: `apps/api/src/personal-files/dto/personal-file.dto.ts`
- Create: `apps/api/src/personal-files/lib/magic-bytes.ts` — sniffer with allowlist
- Create: `apps/api/src/personal-files/lib/sanitize-filename.ts`
- Create: `apps/api/src/personal-files/personal-files.service.spec.ts`
- Create: `apps/api/src/personal-files/lib/magic-bytes.spec.ts`
- Modify: `apps/api/src/app.module.ts` — register `ScheduleModule`, `FileStorageModule`, `PersonalFilesModule`
- Modify: `apps/api/src/auth/auth.service.ts` (or wherever User creation happens for OTP signup) — also create a `UserStorageUsage` row at first login

**Frontend (apps/web):**

- Create: `apps/web/lib/personal-files-api.ts` — typed API helpers
- Create: `apps/web/app/(consumer)/consumer/files/page.tsx` — route entry
- Create: `apps/web/app/(consumer)/consumer/files/personal-files-client.tsx` — `'use client'` orchestrator
- Create: `apps/web/app/(consumer)/consumer/files/personal-files-list.tsx`
- Create: `apps/web/app/(consumer)/consumer/files/personal-files-row.tsx`
- Create: `apps/web/app/(consumer)/consumer/files/personal-files-uploader.tsx`
- Create: `apps/web/app/(consumer)/consumer/files/personal-files-quota.tsx`
- Create: `apps/web/app/(consumer)/consumer/files/recently-deleted-section.tsx`
- Create: `apps/web/app/(consumer)/consumer/files/hooks/use-personal-files.ts`
- Modify: `apps/web/components/consumer-nav.tsx` — add "Files" link

**Tests:**

- Create: `apps/api/src/personal-files/personal-files.service.spec.ts`
- Create: `apps/api/src/personal-files/lib/magic-bytes.spec.ts`
- Create: `tests/e2e/consumer-personal-files.spec.ts`

---

## Task 1: Dependencies

**Files:**
- Modify: `apps/api/package.json`

- [ ] **Step 1: Install runtime deps**

```
cd apps/api && pnpm add @nestjs/schedule @aws-sdk/client-s3 @aws-sdk/s3-request-presigner file-type
```

Expected: lockfile updates; no errors.

- [ ] **Step 2: Verify imports resolve**

```
cd /Users/asad/Projects/Wusuq-Web && pnpm typecheck
```

Expected: PASS.

- [ ] **Step 3: Halt — request commit permission**

Tell the user: "Task 1 complete — dependencies installed. Want me to commit `apps/api/package.json` and the lockfile?"

---

## Task 2: Prisma schema + migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<timestamp>_add_personal_files_and_storage_usage/migration.sql`

- [ ] **Step 1: Add the two new models**

Append to `apps/api/prisma/schema.prisma` (at the bottom, after the existing models):

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

  @@index([userId, deletedAt, createdAt])
}

model UserStorageUsage {
  userId    String   @id
  bytesUsed BigInt   @default(0)
  fileCount Int      @default(0)
  updatedAt DateTime @updatedAt
  user      User     @relation(fields: [userId], references: [id])
}
```

- [ ] **Step 2: Add relations on User**

Inside the existing `model User { ... }` block, add two lines (alongside `tickets`, `cases`, etc.):

```prisma
  personalFiles  PersonalFile[]
  storageUsage   UserStorageUsage?
```

- [ ] **Step 3: Generate the migration**

```
cd apps/api && pnpm prisma migrate dev --name add_personal_files_and_storage_usage --create-only
```

Inspect the generated SQL. Confirm it CREATEs both tables with the index on `PersonalFile(userId, deletedAt, createdAt)` and PK on `UserStorageUsage(userId)`. No drops.

- [ ] **Step 4: Apply the migration**

```
cd apps/api && pnpm prisma migrate dev
```

Expected: "Database is in sync."

- [ ] **Step 5: Regenerate the Prisma client**

```
cd apps/api && pnpm prisma:generate
```

- [ ] **Step 6: Typecheck**

```
cd /Users/asad/Projects/Wusuq-Web && pnpm typecheck
```

Expected: PASS. (No callers reference the new models yet, so no other code changes.)

- [ ] **Step 7: Halt — request commit permission**

---

## Task 3: `FileStorageProvider` interface

**Files:**
- Create: `apps/api/src/file-storage/file-storage-provider.ts`

- [ ] **Step 1: Write the interface**

```ts
// apps/api/src/file-storage/file-storage-provider.ts

export type SignedUrlOptions = {
  /** Filename advertised by the Content-Disposition header on download. */
  downloadName?: string;
};

export interface FileStorageProvider {
  /**
   * Write bytes to `key`. Overwrites if the key exists.
   * Throws on storage failure.
   */
  put(key: string, bytes: Buffer, mimeType: string): Promise<void>;

  /**
   * Return a time-limited URL the client can GET to retrieve the file.
   * `ttlSeconds` MUST be <= 600.
   */
  getSignedDownloadUrl(
    key: string,
    ttlSeconds: number,
    opts?: SignedUrlOptions,
  ): Promise<string>;

  /** Hard delete a single key. Idempotent — succeeds even if the key is missing. */
  delete(key: string): Promise<void>;

  /** Existence probe. */
  exists(key: string): Promise<boolean>;
}
```

- [ ] **Step 2: Typecheck**

```
cd /Users/asad/Projects/Wusuq-Web && pnpm typecheck
```

Expected: PASS.

- [ ] **Step 3: Halt — request commit permission**

---

## Task 4: `LocalDiskFileStorage` + signed-token endpoint

**Files:**
- Create: `apps/api/src/file-storage/local-disk-file-storage.ts`
- Create: `apps/api/src/file-storage/local-files.controller.ts`

- [ ] **Step 1: Write the storage implementation**

```ts
// apps/api/src/file-storage/local-disk-file-storage.ts
import { promises as fs } from 'node:fs';
import { dirname, join, resolve, normalize } from 'node:path';
import { randomBytes } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import {
  FileStorageProvider,
  SignedUrlOptions,
} from './file-storage-provider';
import { getUploadsBucketAbsoluteDir } from '../config/uploads';

type Token = {
  key: string;
  mimeType: string;
  downloadName?: string;
  expiresAt: number;
};

const PERSONAL_FILES_BUCKET = 'personal-files';
const TOKEN_TTL_MAX_SEC = 600;

/**
 * Local-disk implementation of FileStorageProvider.
 *
 * Files live under `<UPLOADS_DIR>/personal-files/<key>`. Signed URLs are
 * opaque tokens kept in an in-memory LRU; the LocalFilesController consumes
 * them to stream bytes back to the client. This matches the auth-stream
 * pattern already used for wallet-receipts and ticket-documents.
 */
@Injectable()
export class LocalDiskFileStorage implements FileStorageProvider {
  private readonly logger = new Logger(LocalDiskFileStorage.name);
  private readonly tokens = new Map<string, Token>();
  private readonly bucketRoot: string;

  constructor() {
    this.bucketRoot = getUploadsBucketAbsoluteDir(PERSONAL_FILES_BUCKET as never);
  }

  async put(key: string, bytes: Buffer, _mimeType: string): Promise<void> {
    const fullPath = this.resolveKey(key);
    await fs.mkdir(dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, bytes);
  }

  async getSignedDownloadUrl(
    key: string,
    ttlSeconds: number,
    opts?: SignedUrlOptions,
  ): Promise<string> {
    const ttl = Math.min(Math.max(1, ttlSeconds), TOKEN_TTL_MAX_SEC);
    const token = randomBytes(32).toString('hex');
    this.tokens.set(token, {
      key,
      mimeType: 'application/octet-stream',
      downloadName: opts?.downloadName,
      expiresAt: Date.now() + ttl * 1000,
    });
    this.gcTokens();
    return `/files/personal/${token}`;
  }

  async delete(key: string): Promise<void> {
    const fullPath = this.resolveKey(key);
    try {
      await fs.unlink(fullPath);
    } catch (err) {
      const e = err as NodeJS.ErrnoException;
      if (e.code !== 'ENOENT') throw e;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.access(this.resolveKey(key));
      return true;
    } catch {
      return false;
    }
  }

  /** Internal: consumed by LocalFilesController. */
  consumeToken(token: string): Token | null {
    const t = this.tokens.get(token);
    if (!t) return null;
    if (t.expiresAt < Date.now()) {
      this.tokens.delete(token);
      return null;
    }
    return t;
  }

  resolveKey(key: string): string {
    // Defense-in-depth: refuse keys that escape the bucket root.
    const fullPath = resolve(this.bucketRoot, key);
    const normalized = normalize(fullPath);
    if (!normalized.startsWith(this.bucketRoot + '/') && normalized !== this.bucketRoot) {
      throw new Error(`storage key escapes bucket: ${key}`);
    }
    return normalized;
  }

  private gcTokens() {
    if (this.tokens.size < 1024) return;
    const now = Date.now();
    for (const [k, v] of this.tokens) {
      if (v.expiresAt < now) this.tokens.delete(k);
    }
  }
}
```

If the existing `UPLOADS_BUCKETS` constant in `apps/api/src/config/uploads.ts` does not yet have a `personalFiles` entry, the `as never` cast above is a temporary belt-and-braces — Step 2 widens the constant.

- [ ] **Step 2: Add `personal-files` to the upload buckets constant**

Open `apps/api/src/config/uploads.ts`. The `UPLOADS_BUCKETS` constant currently lists three buckets. Add a fourth:

```ts
export const UPLOADS_BUCKETS = {
  ticketDocuments: 'ticket-documents',
  clerkReceipts: 'clerk-receipts',
  walletReceipts: 'wallet-receipts',
  personalFiles: 'personal-files',
} as const;
```

Then in `local-disk-file-storage.ts`, replace `'personal-files' as never` with `UPLOADS_BUCKETS.personalFiles`. Add the appropriate import.

- [ ] **Step 3: Write the streaming controller**

```ts
// apps/api/src/file-storage/local-files.controller.ts
import { Controller, Get, Param, Res, NotFoundException } from '@nestjs/common';
import { Response } from 'express';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { LocalDiskFileStorage } from './local-disk-file-storage';
import { Public } from '../auth/decorators/public.decorator';

@Controller('files')
export class LocalFilesController {
  constructor(private readonly storage: LocalDiskFileStorage) {}

  @Public()
  @Get('personal/:token')
  async streamPersonal(@Param('token') token: string, @Res() res: Response) {
    const meta = this.storage.consumeToken(token);
    if (!meta) throw new NotFoundException();

    const fullPath = this.storage.resolveKey(meta.key);
    let size: number;
    try {
      const s = await stat(fullPath);
      size = s.size;
    } catch {
      throw new NotFoundException();
    }

    res.setHeader('Content-Type', meta.mimeType || 'application/octet-stream');
    res.setHeader('Content-Length', String(size));
    if (meta.downloadName) {
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${encodeURIComponent(meta.downloadName)}"`,
      );
    }
    createReadStream(fullPath).pipe(res);
  }
}
```

- [ ] **Step 4: Typecheck**

```
cd /Users/asad/Projects/Wusuq-Web && pnpm typecheck
```

Expected: PASS.

- [ ] **Step 5: Halt — request commit permission**

---

## Task 5: `R2FileStorage`

**Files:**
- Create: `apps/api/src/file-storage/r2-file-storage.ts`

This implementation is real (not stubbed) — it uses the AWS SDK against R2's S3-compatible endpoint. It only activates at boot when `R2_BUCKET` env var is set; otherwise the boot factory in Task 6 selects the LocalDisk implementation.

- [ ] **Step 1: Write the implementation**

```ts
// apps/api/src/file-storage/r2-file-storage.ts
import { Injectable } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { FileStorageProvider, SignedUrlOptions } from './file-storage-provider';

const TOKEN_TTL_MAX_SEC = 600;

export type R2Config = {
  accountId: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint?: string;
};

@Injectable()
export class R2FileStorage implements FileStorageProvider {
  private readonly s3: S3Client;
  private readonly bucket: string;

  constructor(cfg: R2Config) {
    this.bucket = cfg.bucket;
    this.s3 = new S3Client({
      region: 'auto',
      endpoint: cfg.endpoint ?? `https://${cfg.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: cfg.accessKeyId,
        secretAccessKey: cfg.secretAccessKey,
      },
    });
  }

  async put(key: string, bytes: Buffer, mimeType: string): Promise<void> {
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: bytes,
        ContentType: mimeType,
      }),
    );
  }

  async getSignedDownloadUrl(
    key: string,
    ttlSeconds: number,
    opts?: SignedUrlOptions,
  ): Promise<string> {
    const ttl = Math.min(Math.max(1, ttlSeconds), TOKEN_TTL_MAX_SEC);
    const cmd = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ResponseContentDisposition: opts?.downloadName
        ? `attachment; filename="${encodeURIComponent(opts.downloadName)}"`
        : undefined,
    });
    return getSignedUrl(this.s3, cmd, { expiresIn: ttl });
  }

  async delete(key: string): Promise<void> {
    await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.s3.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch {
      return false;
    }
  }
}
```

- [ ] **Step 2: Typecheck**

```
cd /Users/asad/Projects/Wusuq-Web && pnpm typecheck
```

Expected: PASS.

- [ ] **Step 3: Halt — request commit permission**

---

## Task 6: `FileStorageModule` boot factory + README

**Files:**
- Create: `apps/api/src/file-storage/file-storage.module.ts`
- Create: `apps/api/src/file-storage/README.md`

- [ ] **Step 1: Write the module**

```ts
// apps/api/src/file-storage/file-storage.module.ts
import { Module, Logger } from '@nestjs/common';
import { FileStorageProvider } from './file-storage-provider';
import { LocalDiskFileStorage } from './local-disk-file-storage';
import { R2FileStorage } from './r2-file-storage';
import { LocalFilesController } from './local-files.controller';

export const FILE_STORAGE_PROVIDER = Symbol('FILE_STORAGE_PROVIDER');

function buildProvider(): FileStorageProvider {
  const logger = new Logger('FileStorageModule');
  const r2Bucket = process.env.R2_BUCKET?.trim();

  if (r2Bucket) {
    const accountId = process.env.R2_ACCOUNT_ID?.trim() ?? '';
    const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim() ?? '';
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim() ?? '';
    const endpoint = process.env.R2_ENDPOINT?.trim() || undefined;

    if (!accountId || !accessKeyId || !secretAccessKey) {
      throw new Error(
        'R2_BUCKET is set but R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY are missing. ' +
          'Either set all four (real R2) or unset R2_BUCKET (use local disk).',
      );
    }
    logger.log(`File storage: R2 (bucket=${r2Bucket})`);
    return new R2FileStorage({ accountId, bucket: r2Bucket, accessKeyId, secretAccessKey, endpoint });
  }

  logger.log('File storage: LocalDisk (no R2_BUCKET set)');
  return new LocalDiskFileStorage();
}

@Module({
  controllers: [LocalFilesController],
  providers: [
    LocalDiskFileStorage,
    {
      provide: FILE_STORAGE_PROVIDER,
      useFactory: buildProvider,
    },
  ],
  exports: [FILE_STORAGE_PROVIDER, LocalDiskFileStorage],
})
export class FileStorageModule {}
```

`LocalDiskFileStorage` is also a direct provider so the `LocalFilesController` can inject it for the streaming endpoint regardless of which implementation backs the abstract `FILE_STORAGE_PROVIDER` token.

- [ ] **Step 2: Write the README**

```md
# File Storage

Pluggable file storage for personal files (and, in future, ticket-documents,
wallet-receipts, clerk-receipts).

## Choosing an implementation

The boot factory in `file-storage.module.ts` inspects the env at startup:

- `R2_BUCKET` set → uses `R2FileStorage` (Cloudflare R2 via the S3 SDK)
- `R2_BUCKET` unset → uses `LocalDiskFileStorage`

## Required env vars when using R2

```
R2_BUCKET=wusuq-personal-files
R2_ACCOUNT_ID=<your cloudflare account id>
R2_ACCESS_KEY_ID=<r2 token access key>
R2_SECRET_ACCESS_KEY=<r2 token secret>
R2_ENDPOINT=               # optional; defaults to https://<accountId>.r2.cloudflarestorage.com
```

If `R2_BUCKET` is set but any of the other three are missing, boot fails fast.

## Local development

No env vars needed. Files write to `<UPLOADS_DIR>/personal-files/...`.
The `LocalFilesController` exposes `/files/personal/:token` for signed downloads.
```

- [ ] **Step 3: Typecheck**

```
cd /Users/asad/Projects/Wusuq-Web && pnpm typecheck
```

- [ ] **Step 4: Halt — request commit permission**

---

## Task 7: Magic-byte sniffer + filename sanitizer

**Files:**
- Create: `apps/api/src/personal-files/lib/magic-bytes.ts`
- Create: `apps/api/src/personal-files/lib/sanitize-filename.ts`
- Create: `apps/api/src/personal-files/lib/magic-bytes.spec.ts`

- [ ] **Step 1: Write the magic-bytes module**

```ts
// apps/api/src/personal-files/lib/magic-bytes.ts
import { fileTypeFromBuffer } from 'file-type';

export const ALLOWED_MIMES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/heif',
  'application/msword',                                                       // .doc
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',  // .docx
  'application/vnd.ms-excel',                                                 // .xls
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',        // .xlsx
]);

export const ALLOWED_EXTS_BY_MIME: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
};

export type SniffResult = { mime: string; ext: string };

/**
 * Sniff the buffer's magic bytes. Returns null when the file is not in the
 * allowlist (do NOT trust the multipart Content-Type header — it's spoofable).
 */
export async function sniffAllowedType(buf: Buffer): Promise<SniffResult | null> {
  const guess = await fileTypeFromBuffer(buf);
  if (!guess) return null;
  if (!ALLOWED_MIMES.has(guess.mime)) return null;
  return { mime: guess.mime, ext: ALLOWED_EXTS_BY_MIME[guess.mime] ?? guess.ext };
}
```

- [ ] **Step 2: Write filename sanitizer**

```ts
// apps/api/src/personal-files/lib/sanitize-filename.ts
const MAX_LEN = 200;

/**
 * Strip path separators, control chars, trailing dots, and trim.
 * Always returns a non-empty string ('untitled' fallback).
 */
export function sanitizeFilename(input: string): string {
  // eslint-disable-next-line no-control-regex
  const noControl = input.replace(/[ -]/g, '');
  const noPath = noControl.replace(/[\\/]+/g, '_');
  const trimmed = noPath.trim().replace(/\.+$/, '').replace(/^\.+/, '');
  const truncated = trimmed.slice(0, MAX_LEN);
  return truncated.length > 0 ? truncated : 'untitled';
}

/**
 * Force the displayed filename to end with the sniffed-type's canonical
 * extension. If the user provided a different extension, replace it.
 */
export function ensureExtension(filename: string, ext: string): string {
  const dot = filename.lastIndexOf('.');
  const stem = dot > 0 ? filename.slice(0, dot) : filename;
  return `${stem}.${ext}`;
}
```

- [ ] **Step 3: Write the sniffer test**

```ts
// apps/api/src/personal-files/lib/magic-bytes.spec.ts
import { sniffAllowedType } from './magic-bytes';

describe('sniffAllowedType', () => {
  it('accepts PDFs by magic bytes', async () => {
    const pdf = Buffer.concat([
      Buffer.from('%PDF-1.4\n', 'utf-8'),
      Buffer.alloc(64, 0),
    ]);
    const r = await sniffAllowedType(pdf);
    expect(r?.mime).toBe('application/pdf');
    expect(r?.ext).toBe('pdf');
  });

  it('accepts PNGs by magic bytes', async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(64).fill(0)]);
    const r = await sniffAllowedType(png);
    expect(r?.mime).toBe('image/png');
  });

  it('rejects unknown content (not on allowlist)', async () => {
    const text = Buffer.from('hello world this is plain text');
    expect(await sniffAllowedType(text)).toBeNull();
  });

  it('rejects executables (Mach-O / ELF)', async () => {
    const elf = Buffer.from([0x7f, 0x45, 0x4c, 0x46, ...new Array(64).fill(0)]);
    expect(await sniffAllowedType(elf)).toBeNull();
  });
});
```

- [ ] **Step 4: Run tests**

```
cd apps/api && pnpm test -- --testPathPatterns=magic-bytes
```

Expected: 4/4 pass.

- [ ] **Step 5: Typecheck**

```
cd /Users/asad/Projects/Wusuq-Web && pnpm typecheck
```

- [ ] **Step 6: Halt — request commit permission**

---

## Task 8: `PersonalFilesService`

**Files:**
- Create: `apps/api/src/personal-files/personal-files.service.ts`
- Create: `apps/api/src/personal-files/dto/personal-file.dto.ts`

- [ ] **Step 1: Write the DTO**

```ts
// apps/api/src/personal-files/dto/personal-file.dto.ts
export type PersonalFileDto = {
  id: string;
  displayName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  deletedAt: string | null;
};

export function toPersonalFileDto(row: {
  id: string;
  displayName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: Date;
  deletedAt: Date | null;
}): PersonalFileDto {
  return {
    id: row.id,
    displayName: row.displayName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    createdAt: row.createdAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
  };
}
```

- [ ] **Step 2: Write the service**

```ts
// apps/api/src/personal-files/personal-files.service.ts
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  FILE_STORAGE_PROVIDER,
} from '../file-storage/file-storage.module';
import type { FileStorageProvider } from '../file-storage/file-storage-provider';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { sniffAllowedType } from './lib/magic-bytes';
import { ensureExtension, sanitizeFilename } from './lib/sanitize-filename';
import { PersonalFileDto, toPersonalFileDto } from './dto/personal-file.dto';

const PER_FILE_MAX_BYTES = 10 * 1024 * 1024;
const QUOTA_BYTES = 500 * 1024 * 1024;
const RESTORE_WINDOW_DAYS = 30;
const SIGNED_URL_TTL_SEC = 300;

export type ListOptions = {
  search?: string;
  sort?: 'newest' | 'oldest' | 'name' | 'largest';
  includeDeleted?: boolean;
};

@Injectable()
export class PersonalFilesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(FILE_STORAGE_PROVIDER)
    private readonly storage: FileStorageProvider,
    private readonly auditLogs: AuditLogsService,
  ) {}

  // ─── Upload ────────────────────────────────────────────────────────────────

  async upload(
    userId: string,
    actorEmail: string | null,
    incoming: { buffer: Buffer; originalName: string; declaredMime: string },
  ): Promise<PersonalFileDto> {
    if (incoming.buffer.length > PER_FILE_MAX_BYTES) {
      throw new BadRequestException({ error: 'oversize' });
    }

    const usage = await this.getUsageRow(userId);
    if (Number(usage.bytesUsed) + incoming.buffer.length > QUOTA_BYTES) {
      throw new PayloadTooLargeException({
        error: 'quota_exceeded',
        usedBytes: Number(usage.bytesUsed),
        quotaBytes: QUOTA_BYTES,
      });
    }

    const sniff = await sniffAllowedType(incoming.buffer);
    if (!sniff) {
      throw new BadRequestException({ error: 'invalid_type' });
    }

    const sanitized = sanitizeFilename(incoming.originalName);
    const requestedDisplay = ensureExtension(sanitized, sniff.ext);
    const displayName = await this.resolveCollision(userId, requestedDisplay);

    const cuid = randomBytes(12).toString('hex');
    const today = new Date();
    const yyyy = today.getUTCFullYear();
    const mm = String(today.getUTCMonth() + 1).padStart(2, '0');
    const safeForKey = displayName.replace(/[^a-zA-Z0-9._-]+/g, '_');
    const storageKey = `user_${userId}/${yyyy}/${mm}/${cuid}_${safeForKey}`;

    await this.storage.put(storageKey, incoming.buffer, sniff.mime);

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const file = await tx.personalFile.create({
          data: {
            userId,
            storageKey,
            originalName: incoming.originalName.slice(0, 250),
            displayName,
            mimeType: sniff.mime,
            sizeBytes: incoming.buffer.length,
          },
        });
        await tx.userStorageUsage.upsert({
          where: { userId },
          create: { userId, bytesUsed: BigInt(incoming.buffer.length), fileCount: 1 },
          update: {
            bytesUsed: { increment: BigInt(incoming.buffer.length) },
            fileCount: { increment: 1 },
          },
        });
        return file;
      });

      await this.auditLogs.create({
        action: 'PERSONAL_FILE_UPLOAD',
        entity: 'PERSONAL_FILE',
        entityId: created.id,
        actorUserId: userId,
        actorEmail: actorEmail ?? undefined,
        metadata: {
          displayName: created.displayName,
          sizeBytes: created.sizeBytes,
          mimeType: created.mimeType,
        },
      });

      return toPersonalFileDto(created);
    } catch (e) {
      // Rollback the storage write if the DB insert failed.
      await this.storage.delete(storageKey).catch(() => undefined);
      throw e;
    }
  }

  // ─── List ──────────────────────────────────────────────────────────────────

  async list(userId: string, opts: ListOptions): Promise<{
    files: PersonalFileDto[];
    usage: { bytesUsed: number; fileCount: number; quotaBytes: number };
  }> {
    const where = {
      userId,
      ...(opts.includeDeleted ? {} : { deletedAt: null }),
      ...(opts.search
        ? { displayName: { contains: opts.search, mode: 'insensitive' as const } }
        : {}),
    };
    const orderBy =
      opts.sort === 'oldest' ? { createdAt: 'asc' as const } :
      opts.sort === 'name' ? { displayName: 'asc' as const } :
      opts.sort === 'largest' ? { sizeBytes: 'desc' as const } :
      { createdAt: 'desc' as const };

    const [rows, usage] = await Promise.all([
      this.prisma.personalFile.findMany({ where, orderBy, take: 100 }),
      this.getUsageRow(userId),
    ]);

    return {
      files: rows.map(toPersonalFileDto),
      usage: {
        bytesUsed: Number(usage.bytesUsed),
        fileCount: usage.fileCount,
        quotaBytes: QUOTA_BYTES,
      },
    };
  }

  // ─── Download (signed URL) ─────────────────────────────────────────────────

  async signDownload(userId: string, actorEmail: string | null, fileId: string): Promise<string> {
    const file = await this.prisma.personalFile.findFirst({
      where: { id: fileId, userId },
    });
    if (!file) throw new NotFoundException();

    const url = await this.storage.getSignedDownloadUrl(file.storageKey, SIGNED_URL_TTL_SEC, {
      downloadName: file.displayName,
    });

    await this.auditLogs.create({
      action: 'PERSONAL_FILE_DOWNLOAD',
      entity: 'PERSONAL_FILE',
      entityId: file.id,
      actorUserId: userId,
      actorEmail: actorEmail ?? undefined,
      metadata: { displayName: file.displayName },
    });

    return url;
  }

  // ─── Soft delete + restore ─────────────────────────────────────────────────

  async softDelete(userId: string, actorEmail: string | null, fileId: string) {
    const file = await this.prisma.personalFile.findFirst({
      where: { id: fileId, userId, deletedAt: null },
    });
    if (!file) throw new NotFoundException();

    await this.prisma.personalFile.update({
      where: { id: file.id },
      data: { deletedAt: new Date() },
    });

    await this.auditLogs.create({
      action: 'PERSONAL_FILE_SOFT_DELETE',
      entity: 'PERSONAL_FILE',
      entityId: file.id,
      actorUserId: userId,
      actorEmail: actorEmail ?? undefined,
      metadata: { displayName: file.displayName, sizeBytes: file.sizeBytes },
    });
  }

  async restore(userId: string, actorEmail: string | null, fileId: string): Promise<PersonalFileDto> {
    const file = await this.prisma.personalFile.findFirst({
      where: { id: fileId, userId },
    });
    if (!file || !file.deletedAt) throw new NotFoundException();

    const cutoff = new Date(Date.now() - RESTORE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    if (file.deletedAt < cutoff) {
      throw new NotFoundException({ error: 'gc_window_expired' });
    }

    const updated = await this.prisma.personalFile.update({
      where: { id: file.id },
      data: { deletedAt: null },
    });

    await this.auditLogs.create({
      action: 'PERSONAL_FILE_RESTORE',
      entity: 'PERSONAL_FILE',
      entityId: file.id,
      actorUserId: userId,
      actorEmail: actorEmail ?? undefined,
      metadata: { displayName: file.displayName },
    });

    return toPersonalFileDto(updated);
  }

  // ─── Quota ─────────────────────────────────────────────────────────────────

  async quota(userId: string) {
    const usage = await this.getUsageRow(userId);
    return {
      bytesUsed: Number(usage.bytesUsed),
      fileCount: usage.fileCount,
      quotaBytes: QUOTA_BYTES,
    };
  }

  // ─── Internal ──────────────────────────────────────────────────────────────

  private async getUsageRow(userId: string) {
    return this.prisma.userStorageUsage.upsert({
      where: { userId },
      create: { userId, bytesUsed: BigInt(0), fileCount: 0 },
      update: {},
    });
  }

  private async resolveCollision(userId: string, requested: string): Promise<string> {
    const existing = await this.prisma.personalFile.findMany({
      where: { userId, deletedAt: null, displayName: { startsWith: requested.replace(/\.\w+$/, '') } },
      select: { displayName: true },
    });
    const taken = new Set(existing.map((r) => r.displayName));
    if (!taken.has(requested)) return requested;

    const dot = requested.lastIndexOf('.');
    const stem = dot > 0 ? requested.slice(0, dot) : requested;
    const ext = dot > 0 ? requested.slice(dot) : '';
    for (let i = 2; i < 1000; i++) {
      const candidate = `${stem} (${i})${ext}`;
      if (!taken.has(candidate)) return candidate;
    }
    // Defensive — extremely unlikely path.
    return `${stem} (${randomBytes(2).toString('hex')})${ext}`;
  }

  /** Used by the GC cron in personal-files.gc.ts. */
  async hardDeleteRow(fileId: string) {
    await this.prisma.$transaction(async (tx) => {
      const file = await tx.personalFile.findUnique({ where: { id: fileId } });
      if (!file) return;
      await tx.personalFile.delete({ where: { id: file.id } });
      await tx.userStorageUsage.update({
        where: { userId: file.userId },
        data: {
          bytesUsed: { decrement: BigInt(file.sizeBytes) },
          fileCount: { decrement: 1 },
        },
      });
    });
  }
}
```

- [ ] **Step 3: Typecheck**

```
cd /Users/asad/Projects/Wusuq-Web && pnpm typecheck
```

Expected: PASS. (No callers yet — module wiring is the next task.)

- [ ] **Step 4: Halt — request commit permission**

---

## Task 9: `PersonalFilesService` unit tests

**Files:**
- Create: `apps/api/src/personal-files/personal-files.service.spec.ts`

- [ ] **Step 1: Write the test file**

```ts
// apps/api/src/personal-files/personal-files.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException, PayloadTooLargeException } from '@nestjs/common';
import { PersonalFilesService } from './personal-files.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { FILE_STORAGE_PROVIDER } from '../file-storage/file-storage.module';

function makePrisma() {
  return {
    personalFile: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findUnique: jest.fn(),
    },
    userStorageUsage: {
      upsert: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(async (fn: (tx: unknown) => unknown) =>
      typeof fn === 'function' ? fn({
        personalFile: { create: jest.fn(async (a) => ({ id: 'f1', ...a.data, createdAt: new Date(), deletedAt: null })), findUnique: jest.fn(), delete: jest.fn() },
        userStorageUsage: { upsert: jest.fn(), update: jest.fn() },
      }) : null,
    ),
  };
}

const PDF = Buffer.concat([Buffer.from('%PDF-1.4\n', 'utf-8'), Buffer.alloc(64, 0)]);

describe('PersonalFilesService', () => {
  let service: PersonalFilesService;
  let prisma: ReturnType<typeof makePrisma>;
  let storage: { put: jest.Mock; getSignedDownloadUrl: jest.Mock; delete: jest.Mock; exists: jest.Mock };
  let audit: { create: jest.Mock };

  beforeEach(async () => {
    prisma = makePrisma();
    storage = { put: jest.fn(), getSignedDownloadUrl: jest.fn().mockResolvedValue('/signed'), delete: jest.fn(), exists: jest.fn() };
    audit = { create: jest.fn() };
    const m: TestingModule = await Test.createTestingModule({
      providers: [
        PersonalFilesService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLogsService, useValue: audit },
        { provide: FILE_STORAGE_PROVIDER, useValue: storage },
      ],
    }).compile();
    service = m.get(PersonalFilesService);
  });

  describe('upload', () => {
    it('rejects oversize files', async () => {
      const big = Buffer.alloc(11 * 1024 * 1024);
      await expect(
        service.upload('u1', null, { buffer: big, originalName: 'x.pdf', declaredMime: 'application/pdf' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects invalid type', async () => {
      prisma.userStorageUsage.upsert.mockResolvedValue({ bytesUsed: BigInt(0), fileCount: 0 });
      const txt = Buffer.from('not a pdf');
      await expect(
        service.upload('u1', null, { buffer: txt, originalName: 'x.pdf', declaredMime: 'application/pdf' }),
      ).rejects.toMatchObject({ response: { error: 'invalid_type' } });
    });

    it('rejects when quota would be exceeded', async () => {
      prisma.userStorageUsage.upsert.mockResolvedValue({ bytesUsed: BigInt(500 * 1024 * 1024 - 32), fileCount: 100 });
      await expect(
        service.upload('u1', null, { buffer: PDF, originalName: 'x.pdf', declaredMime: 'application/pdf' }),
      ).rejects.toThrow(PayloadTooLargeException);
    });

    it('writes to storage and audit-logs on success', async () => {
      prisma.userStorageUsage.upsert.mockResolvedValue({ bytesUsed: BigInt(0), fileCount: 0 });
      prisma.personalFile.findMany.mockResolvedValue([]);
      const r = await service.upload('u1', 'a@b', { buffer: PDF, originalName: 'order.pdf', declaredMime: 'application/pdf' });
      expect(storage.put).toHaveBeenCalled();
      expect(audit.create).toHaveBeenCalledWith(expect.objectContaining({ action: 'PERSONAL_FILE_UPLOAD' }));
      expect(r.displayName).toBe('order.pdf');
      expect(r.mimeType).toBe('application/pdf');
    });

    it('resolves filename collisions with " (2)" suffix', async () => {
      prisma.userStorageUsage.upsert.mockResolvedValue({ bytesUsed: BigInt(0), fileCount: 0 });
      prisma.personalFile.findMany.mockResolvedValue([{ displayName: 'order.pdf' }]);
      const r = await service.upload('u1', null, { buffer: PDF, originalName: 'order.pdf', declaredMime: 'application/pdf' });
      expect(r.displayName).toBe('order (2).pdf');
    });

    it('rolls back the storage write on DB transaction failure', async () => {
      prisma.userStorageUsage.upsert.mockResolvedValue({ bytesUsed: BigInt(0), fileCount: 0 });
      prisma.personalFile.findMany.mockResolvedValue([]);
      prisma.$transaction.mockRejectedValue(new Error('db down'));
      await expect(
        service.upload('u1', null, { buffer: PDF, originalName: 'x.pdf', declaredMime: 'application/pdf' }),
      ).rejects.toThrow('db down');
      expect(storage.delete).toHaveBeenCalled();
    });
  });

  describe('signDownload', () => {
    it('refuses files owned by other users (404, not 403)', async () => {
      prisma.personalFile.findFirst.mockResolvedValue(null);
      await expect(service.signDownload('u1', null, 'f1')).rejects.toThrow(NotFoundException);
    });

    it('returns signed URL and audit-logs on success', async () => {
      prisma.personalFile.findFirst.mockResolvedValue({ id: 'f1', userId: 'u1', storageKey: 'k', displayName: 'order.pdf' });
      const url = await service.signDownload('u1', null, 'f1');
      expect(url).toBe('/signed');
      expect(audit.create).toHaveBeenCalledWith(expect.objectContaining({ action: 'PERSONAL_FILE_DOWNLOAD' }));
    });
  });

  describe('softDelete', () => {
    it('refuses already-deleted files', async () => {
      prisma.personalFile.findFirst.mockResolvedValue(null);
      await expect(service.softDelete('u1', null, 'f1')).rejects.toThrow(NotFoundException);
    });

    it('sets deletedAt and audit-logs', async () => {
      prisma.personalFile.findFirst.mockResolvedValue({ id: 'f1', userId: 'u1', displayName: 'x.pdf', sizeBytes: 1 });
      await service.softDelete('u1', null, 'f1');
      expect(prisma.personalFile.update).toHaveBeenCalledWith({
        where: { id: 'f1' }, data: { deletedAt: expect.any(Date) },
      });
      expect(audit.create).toHaveBeenCalledWith(expect.objectContaining({ action: 'PERSONAL_FILE_SOFT_DELETE' }));
    });
  });

  describe('restore', () => {
    it('refuses outside the 30-day window', async () => {
      prisma.personalFile.findFirst.mockResolvedValue({
        id: 'f1', userId: 'u1', displayName: 'x.pdf',
        deletedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
      });
      await expect(service.restore('u1', null, 'f1')).rejects.toThrow(NotFoundException);
    });

    it('restores within the window', async () => {
      const file = { id: 'f1', userId: 'u1', displayName: 'x.pdf', deletedAt: new Date(), createdAt: new Date(), mimeType: 'application/pdf', sizeBytes: 1 };
      prisma.personalFile.findFirst.mockResolvedValue(file);
      prisma.personalFile.update.mockResolvedValue({ ...file, deletedAt: null });
      const r = await service.restore('u1', null, 'f1');
      expect(r.deletedAt).toBeNull();
    });
  });
});
```

- [ ] **Step 2: Run the tests**

```
cd apps/api && pnpm test -- --testPathPatterns=personal-files.service
```

Expected: all green. If a `$transaction` test fails because the inline mock doesn't fully simulate Prisma's tx callback, simplify to inspect that `$transaction` was invoked (rather than asserting the inner DB calls).

- [ ] **Step 3: Halt — request commit permission**

---

## Task 10: `PersonalFilesController` + module + GC cron

**Files:**
- Create: `apps/api/src/personal-files/personal-files.controller.ts`
- Create: `apps/api/src/personal-files/personal-files.module.ts`
- Create: `apps/api/src/personal-files/personal-files.gc.ts`
- Create: `apps/api/src/personal-files/dto/list-personal-files.dto.ts`

- [ ] **Step 1: Write the list DTO**

```ts
// apps/api/src/personal-files/dto/list-personal-files.dto.ts
import { IsBooleanString, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class ListPersonalFilesDto {
  @IsOptional() @IsString() @MaxLength(120)
  search?: string;

  @IsOptional() @IsIn(['newest', 'oldest', 'name', 'largest'])
  sort?: 'newest' | 'oldest' | 'name' | 'largest';

  @IsOptional() @IsBooleanString()
  includeDeleted?: string;
}
```

- [ ] **Step 2: Write the controller**

```ts
// apps/api/src/personal-files/personal-files.controller.ts
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtUser } from '../auth/types/jwt-user.type';
import { PersonalFilesService } from './personal-files.service';
import { ListPersonalFilesDto } from './dto/list-personal-files.dto';

function assertConsumer(user: JwtUser): void {
  if (user.role !== 'consumer') {
    throw new ForbiddenException({ error: 'staff_cannot_access_personal_files' });
  }
}

@Controller('personal-files')
export class PersonalFilesController {
  constructor(private readonly service: PersonalFilesService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 11 * 1024 * 1024 } }))
  upload(
    @CurrentUser() user: JwtUser,
    @UploadedFile() file: { buffer: Buffer; originalname: string; mimetype: string } | undefined,
  ) {
    assertConsumer(user);
    if (!file) throw new BadRequestException({ error: 'no_file' });
    return this.service.upload(user.sub, user.email ?? null, {
      buffer: file.buffer,
      originalName: file.originalname,
      declaredMime: file.mimetype,
    });
  }

  @Get()
  list(@CurrentUser() user: JwtUser, @Query() query: ListPersonalFilesDto) {
    assertConsumer(user);
    return this.service.list(user.sub, {
      search: query.search,
      sort: query.sort,
      includeDeleted: query.includeDeleted === 'true',
    });
  }

  @Get('quota')
  quota(@CurrentUser() user: JwtUser) {
    assertConsumer(user);
    return this.service.quota(user.sub);
  }

  @Get(':id/download')
  async download(@CurrentUser() user: JwtUser, @Param('id') id: string, @Res() res: Response) {
    assertConsumer(user);
    const url = await this.service.signDownload(user.sub, user.email ?? null, id);
    res.redirect(302, url);
  }

  @Delete(':id')
  @HttpCode(204)
  async softDelete(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    assertConsumer(user);
    await this.service.softDelete(user.sub, user.email ?? null, id);
  }

  @Post(':id/restore')
  restore(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    assertConsumer(user);
    return this.service.restore(user.sub, user.email ?? null, id);
  }
}
```

If the existing `JwtUser` type uses a different role-name string than `'consumer'` (e.g. `'CONSUMER'`), adjust the equality check accordingly. Inspect `apps/api/src/auth/types/jwt-user.type.ts` and the `mapPrismaRoleToShared` function to confirm before writing.

- [ ] **Step 3: Write the GC cron**

```ts
// apps/api/src/personal-files/personal-files.gc.ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { Inject } from '@nestjs/common';
import { FILE_STORAGE_PROVIDER } from '../file-storage/file-storage.module';
import type { FileStorageProvider } from '../file-storage/file-storage-provider';
import { PersonalFilesService } from './personal-files.service';

const RESTORE_WINDOW_DAYS = 30;

@Injectable()
export class PersonalFilesGc {
  private readonly logger = new Logger(PersonalFilesGc.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(FILE_STORAGE_PROVIDER) private readonly storage: FileStorageProvider,
    private readonly service: PersonalFilesService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async hardDeleteExpired() {
    const cutoff = new Date(Date.now() - RESTORE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const expired = await this.prisma.personalFile.findMany({
      where: { deletedAt: { lt: cutoff } },
      select: { id: true, storageKey: true, displayName: true },
    });

    let deleted = 0;
    for (const f of expired) {
      try {
        await this.storage.delete(f.storageKey);
        await this.service.hardDeleteRow(f.id);
        deleted += 1;
      } catch (e) {
        this.logger.error(`hard-delete failed for ${f.id} (${f.displayName}): ${(e as Error).message}`);
      }
    }
    if (expired.length > 0) {
      this.logger.log(`PersonalFilesGc: hard-deleted ${deleted}/${expired.length} expired files`);
    }
  }
}
```

- [ ] **Step 4: Write the module**

```ts
// apps/api/src/personal-files/personal-files.module.ts
import { Module } from '@nestjs/common';
import { PersonalFilesController } from './personal-files.controller';
import { PersonalFilesService } from './personal-files.service';
import { PersonalFilesGc } from './personal-files.gc';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { FileStorageModule } from '../file-storage/file-storage.module';

@Module({
  imports: [PrismaModule, AuditLogsModule, FileStorageModule],
  controllers: [PersonalFilesController],
  providers: [PersonalFilesService, PersonalFilesGc],
})
export class PersonalFilesModule {}
```

If `PrismaModule` or `AuditLogsModule` aren't conventional in this codebase (i.e. PrismaService is provided globally, AuditLogsService is provided in some root module), drop those imports. Confirm by inspecting the existing module structure of any feature like `tickets.module.ts` and follow the same pattern.

- [ ] **Step 5: Wire into `app.module.ts`**

Open `apps/api/src/app.module.ts`. Add:

```ts
import { ScheduleModule } from '@nestjs/schedule';
import { FileStorageModule } from './file-storage/file-storage.module';
import { PersonalFilesModule } from './personal-files/personal-files.module';
```

Add to the `imports` array: `ScheduleModule.forRoot()`, `FileStorageModule`, `PersonalFilesModule`. Order doesn't matter but group with the other feature modules.

- [ ] **Step 6: Typecheck**

```
cd /Users/asad/Projects/Wusuq-Web && pnpm typecheck
```

Expected: PASS.

- [ ] **Step 7: Manual smoke**

Start the API: `pnpm dev:api`. Log in as a consumer (use the OTP dev flow). Then from a separate terminal with the access token in `$T`:

```
TOKEN=<access token>

curl -s -F "file=@README.md" -H "Authorization: Bearer $TOKEN" http://localhost:4000/api/personal-files
```

Expected: 400 `{"error":"invalid_type"}` (markdown is not on the allowlist).

```
# create a tiny PDF
printf '%%PDF-1.4\n%%dummy\n' > /tmp/test.pdf
curl -s -F "file=@/tmp/test.pdf" -H "Authorization: Bearer $TOKEN" http://localhost:4000/api/personal-files
```

Expected: 201 with `{ id, displayName: "test.pdf", mimeType: "application/pdf", sizeBytes }`.

```
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:4000/api/personal-files
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:4000/api/personal-files/quota
```

Expected: list contains the file; quota shows `bytesUsed > 0`.

```
curl -sI -H "Authorization: Bearer $TOKEN" http://localhost:4000/api/personal-files/<id>/download
```

Expected: HTTP/302 with `Location: /files/personal/<token>`. Following that:

```
curl -sI http://localhost:4000/files/personal/<token>
```

Expected: 200, `Content-Disposition: attachment; filename="test.pdf"`.

If staff role tries the same upload endpoint:

```
curl -s -F "file=@/tmp/test.pdf" -H "Authorization: Bearer $STAFF_TOKEN" http://localhost:4000/api/personal-files
```

Expected: 403 `{"error":"staff_cannot_access_personal_files"}`.

- [ ] **Step 8: Halt — request commit permission**

---

## Task 11: Frontend API helper

**Files:**
- Create: `apps/web/lib/personal-files-api.ts`

- [ ] **Step 1: Write the helper**

```ts
// apps/web/lib/personal-files-api.ts
import { apiClient } from '@/lib/api-client';

export type PersonalFile = {
  id: string;
  displayName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  deletedAt: string | null;
};

export type Quota = { bytesUsed: number; fileCount: number; quotaBytes: number };

export type ListResponse = { files: PersonalFile[]; usage: Quota };

export type ListParams = {
  search?: string;
  sort?: 'newest' | 'oldest' | 'name' | 'largest';
  includeDeleted?: boolean;
};

export function listPersonalFiles(params: ListParams = {}) {
  const q = new URLSearchParams();
  if (params.search) q.set('search', params.search);
  if (params.sort) q.set('sort', params.sort);
  if (params.includeDeleted) q.set('includeDeleted', 'true');
  const suffix = q.toString();
  return apiClient.get<ListResponse>(`/personal-files${suffix ? `?${suffix}` : ''}`);
}

export function getQuota() {
  return apiClient.get<Quota>('/personal-files/quota');
}

export async function uploadPersonalFile(file: File): Promise<PersonalFile> {
  const fd = new FormData();
  fd.append('file', file);
  return apiClient.post<PersonalFile>('/personal-files', fd);
}

export function softDeletePersonalFile(id: string) {
  return apiClient.delete<void>(`/personal-files/${id}`);
}

export function restorePersonalFile(id: string) {
  return apiClient.post<PersonalFile>(`/personal-files/${id}/restore`, {});
}

/**
 * Browser-friendly: hits /personal-files/:id/download which returns a 302 to
 * a signed URL. The browser follows the redirect and the file streams down.
 * We open it in a hidden anchor to get the Content-Disposition behavior.
 */
export function downloadPersonalFile(id: string) {
  const a = document.createElement('a');
  a.href = `${process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000/api'}/personal-files/${id}/download`;
  a.rel = 'noopener';
  a.click();
}
```

If `apiClient` doesn't expose `delete`, add a `.delete<T>(path)` shorthand to `apps/web/lib/api-client.ts` first (one-liner via the existing `fetch` wrapper, matching `.post`).

- [ ] **Step 2: Typecheck**

```
cd /Users/asad/Projects/Wusuq-Web && pnpm typecheck
```

Expected: PASS.

- [ ] **Step 3: Halt — request commit permission**

---

## Task 12: `use-personal-files` hook

**Files:**
- Create: `apps/web/app/(consumer)/consumer/files/hooks/use-personal-files.ts`

- [ ] **Step 1: Write the hook**

```ts
// apps/web/app/(consumer)/consumer/files/hooks/use-personal-files.ts
'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  listPersonalFiles,
  uploadPersonalFile,
  softDeletePersonalFile,
  restorePersonalFile,
  type PersonalFile,
  type Quota,
} from '@/lib/personal-files-api';

const MAX_PARALLEL = 3;

export type LocalUpload = {
  tempId: string;
  name: string;
  size: number;
  status: 'uploading' | 'failed';
  error?: string;
};

export function usePersonalFiles() {
  const [files, setFiles] = useState<PersonalFile[]>([]);
  const [usage, setUsage] = useState<Quota | null>(null);
  const [loading, setLoading] = useState(true);
  const [showDeleted, setShowDeleted] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [pendingUploads, setPendingUploads] = useState<LocalUpload[]>([]);

  const refresh = useCallback(async () => {
    const res = await listPersonalFiles({ includeDeleted: showDeleted });
    setFiles(res.files);
    setUsage(res.usage);
  }, [showDeleted]);

  useEffect(() => {
    setLoading(true);
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  const visible = useMemo(() => {
    const s = searchQuery.trim().toLowerCase();
    const filtered = s
      ? files.filter((f) => f.displayName.toLowerCase().includes(s))
      : files;
    return {
      live: filtered.filter((f) => !f.deletedAt),
      deleted: filtered.filter((f) => f.deletedAt),
    };
  }, [files, searchQuery]);

  const upload = useCallback(async (incoming: File[]) => {
    if (!incoming.length) return;

    const uploads: LocalUpload[] = incoming.map((f) => ({
      tempId: crypto.randomUUID(),
      name: f.name,
      size: f.size,
      status: 'uploading',
    }));
    setPendingUploads((prev) => [...uploads, ...prev]);

    let cursor = 0;
    async function worker() {
      while (cursor < incoming.length) {
        const my = cursor++;
        const file = incoming[my];
        const local = uploads[my];
        try {
          const created = await uploadPersonalFile(file);
          setFiles((prev) => [created, ...prev]);
          setPendingUploads((prev) => prev.filter((u) => u.tempId !== local.tempId));
        } catch (e) {
          const msg =
            (e as { response?: { error?: string; quotaBytes?: number } })?.response?.error ??
            (e instanceof Error ? e.message : 'upload_failed');
          setPendingUploads((prev) =>
            prev.map((u) => (u.tempId === local.tempId ? { ...u, status: 'failed', error: msg } : u)),
          );
        }
      }
    }

    await Promise.all(Array.from({ length: Math.min(MAX_PARALLEL, incoming.length) }, worker));
    await refresh();
  }, [refresh]);

  const remove = useCallback(async (id: string) => {
    const prev = files;
    setFiles((cur) => cur.map((f) => (f.id === id ? { ...f, deletedAt: new Date().toISOString() } : f)));
    try {
      await softDeletePersonalFile(id);
      await refresh();
    } catch {
      setFiles(prev);
    }
  }, [files, refresh]);

  const restore = useCallback(async (id: string) => {
    const prev = files;
    setFiles((cur) => cur.map((f) => (f.id === id ? { ...f, deletedAt: null } : f)));
    try {
      await restorePersonalFile(id);
      await refresh();
    } catch {
      setFiles(prev);
    }
  }, [files, refresh]);

  const dismissPending = useCallback((tempId: string) => {
    setPendingUploads((prev) => prev.filter((u) => u.tempId !== tempId));
  }, []);

  return {
    loading,
    files: visible.live,
    deletedFiles: visible.deleted,
    usage,
    pendingUploads,
    showDeleted,
    setShowDeleted,
    searchQuery,
    setSearchQuery,
    upload,
    remove,
    restore,
    dismissPending,
  };
}
```

- [ ] **Step 2: Typecheck**

```
cd /Users/asad/Projects/Wusuq-Web && pnpm typecheck
```

Expected: PASS.

- [ ] **Step 3: Halt — request commit permission**

---

## Task 13: Frontend small components

**Files:**
- Create: `apps/web/app/(consumer)/consumer/files/personal-files-quota.tsx`
- Create: `apps/web/app/(consumer)/consumer/files/personal-files-row.tsx`
- Create: `apps/web/app/(consumer)/consumer/files/personal-files-uploader.tsx`
- Create: `apps/web/app/(consumer)/consumer/files/recently-deleted-section.tsx`

- [ ] **Step 1: Quota bar**

```tsx
// apps/web/app/(consumer)/consumer/files/personal-files-quota.tsx
'use client';

function fmt(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function PersonalFilesQuota({ bytesUsed, quotaBytes }: { bytesUsed: number; quotaBytes: number }) {
  const pct = quotaBytes > 0 ? Math.min(100, (bytesUsed / quotaBytes) * 100) : 0;
  const tone = pct > 90 ? 'bg-rose-500' : pct > 70 ? 'bg-amber-500' : 'bg-brand-500';
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-xs text-slate-600">
        <span>Storage</span>
        <span>{fmt(bytesUsed)} of {fmt(quotaBytes)}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
        <div className={`h-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Row component**

```tsx
// apps/web/app/(consumer)/consumer/files/personal-files-row.tsx
'use client';
import { Download, FileText, Image as ImageIcon, RotateCcw, Trash2 } from 'lucide-react';
import { downloadPersonalFile, type PersonalFile } from '@/lib/personal-files-api';

function fmtSize(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / (24 * 60 * 60 * 1000));
  if (days < 1) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  return d.toLocaleDateString();
}

export function PersonalFilesRow({
  file, deleted, onDelete, onRestore,
}: {
  file: PersonalFile;
  deleted?: boolean;
  onDelete?: (id: string) => void;
  onRestore?: (id: string) => void;
}) {
  const isImage = file.mimeType.startsWith('image/');
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border-soft bg-surface p-3">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-500">
        {isImage ? <ImageIcon className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-900">{file.displayName}</p>
        <p className="text-xs text-slate-500">{fmtSize(file.sizeBytes)} · {fmtDate(file.createdAt)}</p>
      </div>
      <div className="flex items-center gap-1.5">
        {!deleted ? (
          <>
            <button
              type="button"
              onClick={() => downloadPersonalFile(file.id)}
              className="flex items-center gap-1.5 rounded-md border border-border-soft px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
            >
              <Download className="h-3.5 w-3.5" /> Download
            </button>
            <button
              type="button"
              onClick={() => onDelete?.(file.id)}
              aria-label={`Delete ${file.displayName}`}
              className="flex items-center justify-center rounded-md border border-border-soft p-1.5 text-slate-500 hover:text-rose-600"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => onRestore?.(file.id)}
            className="flex items-center gap-1.5 rounded-md border border-border-soft px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Restore
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Uploader component**

```tsx
// apps/web/app/(consumer)/consumer/files/personal-files-uploader.tsx
'use client';
import { useRef } from 'react';
import { Upload } from 'lucide-react';

const ACCEPT = '.pdf,.jpg,.jpeg,.png,.heic,.heif,.doc,.docx,.xls,.xlsx,application/pdf,image/jpeg,image/png,image/heic,image/heif';

export function PersonalFilesUploader({
  onSelect, disabled,
}: {
  onSelect: (files: File[]) => void;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => ref.current?.click()}
        className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-elev-1 transition hover:bg-brand-700 disabled:opacity-40"
      >
        <Upload className="h-4 w-4" /> Upload
      </button>
      <input
        ref={ref}
        type="file"
        multiple
        accept={ACCEPT}
        capture="environment"
        className="sr-only"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) onSelect(files);
          e.target.value = '';
        }}
      />
    </>
  );
}
```

- [ ] **Step 4: Recently deleted section**

```tsx
// apps/web/app/(consumer)/consumer/files/recently-deleted-section.tsx
'use client';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { type PersonalFile } from '@/lib/personal-files-api';
import { PersonalFilesRow } from './personal-files-row';

export function RecentlyDeletedSection({
  files, expanded, onToggle, onRestore,
}: {
  files: PersonalFile[];
  expanded: boolean;
  onToggle: () => void;
  onRestore: (id: string) => void;
}) {
  return (
    <div className="mt-6 rounded-xl border border-border-soft bg-surface-muted/40 p-4">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between text-sm font-medium text-slate-700"
      >
        <span className="flex items-center gap-2">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          Recently deleted
          <span className="text-xs text-slate-500">({files.length}, 30-day recovery)</span>
        </span>
      </button>
      {expanded && files.length > 0 ? (
        <div className="mt-3 flex flex-col gap-2">
          {files.map((f) => (
            <PersonalFilesRow key={f.id} file={f} deleted onRestore={onRestore} />
          ))}
        </div>
      ) : null}
      {expanded && files.length === 0 ? (
        <p className="mt-3 text-xs text-slate-500">Nothing here yet.</p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 5: Typecheck**

```
cd /Users/asad/Projects/Wusuq-Web && pnpm typecheck
```

Expected: PASS.

- [ ] **Step 6: Halt — request commit permission**

---

## Task 14: List component + page route

**Files:**
- Create: `apps/web/app/(consumer)/consumer/files/personal-files-list.tsx`
- Create: `apps/web/app/(consumer)/consumer/files/personal-files-client.tsx`
- Create: `apps/web/app/(consumer)/consumer/files/page.tsx`

- [ ] **Step 1: List component**

```tsx
// apps/web/app/(consumer)/consumer/files/personal-files-list.tsx
'use client';
import { Search, Loader2 } from 'lucide-react';
import { type PersonalFile } from '@/lib/personal-files-api';
import { PersonalFilesRow } from './personal-files-row';
import type { LocalUpload } from './hooks/use-personal-files';

export function PersonalFilesList({
  files, pending, searchQuery, onSearchChange, onDelete, onDismissPending,
}: {
  files: PersonalFile[];
  pending: LocalUpload[];
  searchQuery: string;
  onSearchChange: (s: string) => void;
  onDelete: (id: string) => void;
  onDismissPending: (tempId: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search your files…"
          className="w-full rounded-xl border-0 bg-surface py-2.5 pl-9 pr-3 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-border-soft focus:ring-2 focus:ring-brand-500/50"
        />
      </div>

      {pending.length > 0 ? (
        <div className="flex flex-col gap-2">
          {pending.map((p) => (
            <div
              key={p.tempId}
              className="flex items-center gap-3 rounded-lg border border-dashed border-brand-200 bg-brand-50/40 p-3"
            >
              {p.status === 'uploading' ? (
                <Loader2 className="h-4 w-4 animate-spin text-brand-500" />
              ) : (
                <span className="text-xs font-medium text-rose-600">Failed</span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-900">{p.name}</p>
                {p.error ? <p className="text-xs text-rose-600">{p.error}</p> : null}
              </div>
              {p.status === 'failed' ? (
                <button
                  type="button"
                  onClick={() => onDismissPending(p.tempId)}
                  className="text-xs text-slate-500 hover:underline"
                >
                  Dismiss
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {files.length === 0 && pending.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border-soft bg-surface-muted/40 p-10 text-center">
          <p className="text-sm font-medium text-slate-700">No files yet</p>
          <p className="mt-1 text-xs text-slate-500">
            Upload PDFs, images, or Office docs. Up to 10 MB each · 500 MB total.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {files.map((f) => (
            <PersonalFilesRow key={f.id} file={f} onDelete={onDelete} />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Client orchestrator**

```tsx
// apps/web/app/(consumer)/consumer/files/personal-files-client.tsx
'use client';
import { usePersonalFiles } from './hooks/use-personal-files';
import { PersonalFilesUploader } from './personal-files-uploader';
import { PersonalFilesQuota } from './personal-files-quota';
import { PersonalFilesList } from './personal-files-list';
import { RecentlyDeletedSection } from './recently-deleted-section';

export function PersonalFilesClient() {
  const f = usePersonalFiles();
  const quotaFull = f.usage ? f.usage.bytesUsed >= f.usage.quotaBytes : false;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">My files</h1>
          <p className="mt-1 text-sm text-slate-500">
            Personal storage for documents you want handy. Only you can see these.
          </p>
        </div>
        <PersonalFilesUploader onSelect={f.upload} disabled={quotaFull} />
      </header>

      {f.usage ? (
        <PersonalFilesQuota bytesUsed={f.usage.bytesUsed} quotaBytes={f.usage.quotaBytes} />
      ) : null}

      {f.loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : (
        <>
          <PersonalFilesList
            files={f.files}
            pending={f.pendingUploads}
            searchQuery={f.searchQuery}
            onSearchChange={f.setSearchQuery}
            onDelete={f.remove}
            onDismissPending={f.dismissPending}
          />
          <RecentlyDeletedSection
            files={f.deletedFiles}
            expanded={f.showDeleted}
            onToggle={() => f.setShowDeleted(!f.showDeleted)}
            onRestore={f.restore}
          />
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Page route**

```tsx
// apps/web/app/(consumer)/consumer/files/page.tsx
import { PersonalFilesClient } from './personal-files-client';

export default function ConsumerFilesPage() {
  return <PersonalFilesClient />;
}
```

- [ ] **Step 4: Typecheck**

```
cd /Users/asad/Projects/Wusuq-Web && pnpm typecheck
```

Expected: PASS.

- [ ] **Step 5: Halt — request commit permission**

---

## Task 15: Add "Files" link to consumer nav

**Files:**
- Modify: `apps/web/components/consumer-nav.tsx`

- [ ] **Step 1: Read the existing nav**

Open `apps/web/components/consumer-nav.tsx`. Find the array of nav items (likely typed something like `{ href, label, icon }`). Note the icon import pattern (e.g. lucide).

- [ ] **Step 2: Add a "Files" item**

Add the import for the icon at the top:

```ts
import { FolderOpen } from 'lucide-react';
```

Insert a new entry into the nav array, between Documents and Wallet (or wherever it fits the existing order):

```ts
{ href: '/consumer/files', label: 'My Files', icon: FolderOpen }
```

(The exact key names depend on the existing item shape — match whatever the file uses.)

- [ ] **Step 3: Typecheck**

```
cd /Users/asad/Projects/Wusuq-Web && pnpm typecheck
```

Expected: PASS.

- [ ] **Step 4: Manual smoke**

Run `pnpm dev`, log in as a consumer, click "My Files" in the sidebar.
Confirm: empty-state card visible, quota bar shows 0 / 500 MB, Upload button present.
Drop a PDF: row appears with spinner → resolves to actual entry.
Tap Delete: row moves to Recently deleted (when expanded).
Tap Restore: row returns to live list.
Mobile (DevTools responsive): tap Upload — picker offers camera + gallery.

- [ ] **Step 5: Halt — request commit permission**

---

## Task 16: Playwright E2E

**Files:**
- Create: `tests/e2e/consumer-personal-files.spec.ts`

- [ ] **Step 1: Write the spec**

```ts
// tests/e2e/consumer-personal-files.spec.ts
import { test, expect } from '@playwright/test';

test('consumer can upload, list, delete, and restore a personal file', async ({ page }) => {
  // Login via OTP devCode (assumes the consumer-login flow is already E2E-tested elsewhere
  // and exposes devCode in non-prod). Reuse the same pattern.
  const phone = `0300${Math.floor(1000000 + Math.random() * 8999999)}`;

  let devCode: string | null = null;
  page.on('response', async (resp) => {
    if (resp.url().includes('/auth/otp/request') && resp.status() === 200) {
      const json = await resp.json().catch(() => null);
      if (json?.devCode) devCode = json.devCode;
    }
  });

  await page.goto('/consumer/login');
  await page.getByPlaceholder('300 1234567').fill(phone);
  await page.getByRole('button', { name: /Continue/ }).click();
  await expect.poll(() => devCode).not.toBeNull();
  await page.locator('input[inputmode="numeric"]').first().focus();
  await page.keyboard.type(devCode!);
  await page.getByRole('button', { name: /Verify/ }).click();
  if (await page.getByText('Tell us about you').isVisible()) {
    await page.getByPlaceholder('Ali Raza').fill('PFiles E2E');
    await page.getByRole('button', { name: /Continue to dashboard/ }).click();
  }

  // Navigate to files
  await page.goto('/consumer/files');
  await expect(page.getByRole('heading', { name: 'My files' })).toBeVisible();
  await expect(page.getByText('No files yet')).toBeVisible();

  // Upload a fixture PDF
  const pdfBytes = Buffer.concat([Buffer.from('%PDF-1.4\n', 'utf-8'), Buffer.alloc(64, 0)]);
  await page.setInputFiles('input[type="file"]', {
    name: 'e2e.pdf', mimeType: 'application/pdf', buffer: pdfBytes,
  });

  await expect(page.getByText('e2e.pdf')).toBeVisible();

  // Soft delete
  await page.getByRole('button', { name: /Delete e2e\.pdf/ }).click();
  await expect(page.getByText('No files yet')).toBeVisible();

  // Expand recently deleted, restore
  await page.getByRole('button', { name: /Recently deleted/ }).click();
  await page.getByRole('button', { name: /Restore/ }).click();
  await expect(page.getByText('e2e.pdf')).toBeVisible();
});
```

- [ ] **Step 2: Confirm Playwright config can run this**

The repo's `playwright.config.ts` uses `testDir: './tests/e2e'` — confirmed during plan write. Its `webServer` does a Next build + start; the API must be running separately on port 4000 with the dev DB. If those preconditions aren't satisfied, the spec will hang on the OTP step.

```
pnpm e2e -- --grep personal-files
```

Expected: spec passes. If it hangs at the OTP step, check that the API is running and that `NODE_ENV !== 'production'` so `devCode` is in the response.

- [ ] **Step 3: Halt — request commit permission**

---

## Self-Review

**Spec coverage:**

| Spec section | Implemented in |
|---|---|
| §2 Goal — `/consumer/files` library, PDF/image/Office, soft delete, mobile camera | Tasks 13 (uploader `accept` + `capture`), 14 (page), 8/10 (soft delete), 7 (allowlist) |
| §3 Decisions table | Task 8 (PER_FILE_MAX_BYTES, QUOTA_BYTES, RESTORE_WINDOW_DAYS), Task 7 (magic-byte validation), Task 6 (env-driven provider), Task 13 (mobile capture), Task 15 (route + nav) |
| §4 User journey (empty state, populated, recently-deleted) | Tasks 13, 14 |
| §5.1 Backend overview | Tasks 8, 10 |
| §5.2 Frontend overview | Tasks 11–14 |
| §5.3 Database (PersonalFile + UserStorageUsage) | Task 2 |
| §5.4 Storage layout (`user_<id>/<yyyy>/<mm>/<cuid>_<file>`) | Task 8 (key construction) + Task 4 (LocalDisk path safety) |
| §6 Endpoints | Task 10 |
| §7 FileStorageProvider interface + LocalDisk + R2 | Tasks 3, 4, 5, 6 |
| §8 Validation pipeline (sniff > size > quota > collision > tx) | Task 8 (`upload`) |
| §9 Security & ownership (assertConsumer, key prefix) | Task 10 (`assertConsumer`), Task 8 (key prefix), Task 4 (path-escape guard) |
| §10 Soft delete + 30-day GC | Tasks 8 (`softDelete`/`restore`), 10 (`PersonalFilesGc` cron) |
| §11 Frontend behavior (optimistic, parallel cap, search, recently deleted) | Task 12 |
| §12 Error handling | Task 12 (per-upload failed state), Task 14 (quotaFull disable), Task 8 (mapped error responses) |
| §13 Audit log actions | Task 8 (`auditLogs.create` calls), Task 10 (cron logs to logger; hard-delete writes via service path) |
| §14 Testing | Tasks 7 (magic-bytes spec), 9 (service spec), 16 (E2E) |
| §15 Migration & risks | Task 2 (migration); LocalDisk-as-default + R2-by-env covered in Task 6 |
| §17 Open questions | `@nestjs/schedule` registration is in Task 10 step 5 |

**Placeholder scan:** No `TBD`/`TODO`/vague handlers in any task. All file paths, code blocks, expected commands, expected outputs are concrete.

**Type consistency:**
- `PersonalFileDto` shape declared in Task 8 (DTO file) is used unchanged in the controller (Task 10) and frontend (Task 11).
- `FILE_STORAGE_PROVIDER` symbol is exported from Task 6 and imported by Tasks 8, 9, 10.
- `FileStorageProvider` interface methods (`put`, `getSignedDownloadUrl`, `delete`, `exists`) are consistent across Tasks 3, 4, 5, 8.
- `LocalUpload` type is defined in Task 12, consumed by Task 14.
- `PERSONAL_FILES_BUCKET` constant in Task 4 step 1 is replaced by `UPLOADS_BUCKETS.personalFiles` in step 2 — consistent.

**Caveats called out at task time:**
- Task 5 step 3 (controller): `JwtUser.role` value depends on the existing role mapper — implementer told to inspect first.
- Task 10 step 4 (module): `PrismaModule`/`AuditLogsModule` may or may not be conventional — implementer told to follow the `tickets.module.ts` pattern.
- Task 11 (api helper): `apiClient.delete` may need to be added if missing — one-liner.
- Task 16 (E2E): documents the API-must-be-running precondition.

**Known scope deferral (per spec §16):** This plan does NOT migrate the existing `ticket-documents`/`wallet-receipts`/`clerk-receipts` buckets to the new abstraction. That migration is a separate plan.
