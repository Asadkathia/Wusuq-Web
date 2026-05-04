# Consumer Personal Storage — Design Spec

**Date:** 2026-05-04
**Status:** Draft, pending implementation plan
**Owner:** Asad

## 1. Problem

Consumers have nowhere on Wusuq to keep their own legal documents that aren't yet attached to a specific case or ticket. The existing `/consumer/documents` page is a **read-only delivery view** — it shows final documents staff produced from completed tickets (`TicketDocument`). There is no way for a user to:

- Upload a court order they want to refer back to later.
- Snap a photo of a notice on the way to court and find it again.
- Keep a CNIC scan, lease deed, or affidavit handy across cases.

The other limitation is structural: every existing file-storage path in the API writes to local disk via `apps/api/src/config/uploads.ts` with named buckets. On Render this is a single-AZ persistent volume coupled to one instance — fragile, hard to scale, and the codebase has accumulated three custom auth+stream endpoints because there are no presigned URLs. Building a new storage feature on the same pattern entrenches that fragility.

## 2. Goal

Add a **personal file library** to the consumer portal — a private, per-user, search-driven storage area at `/consumer/files`. Users can upload PDFs, images, and Office documents, view a list, download, soft-delete, restore within 30 days, and capture photos directly on mobile.

Build it on a new `FileStorageProvider` abstraction that production points at Cloudflare R2 (S3-compatible, zero egress) and dev runs against a local-disk implementation. R2 wiring is **mocked in v1** — production env vars are placeholder; the LocalDisk implementation ships and works end-to-end. Real R2 credentials get plugged in later without code changes.

The existing `/consumer/documents` page is untouched. Staff have **zero access** to consumer personal files — enforced on every endpoint by ownership checks.

Out of scope: folders, tags, sharing, public links, file versioning, migrating the existing `ticket-documents` / `wallet-receipts` / `clerk-receipts` buckets to the new abstraction. The migration is the obvious next step but a separate plan.

## 3. Decisions Locked With User

| Decision | Choice |
|---|---|
| Scope | A1 — Personal scratch only (not linked to cases) |
| Storage backend | `FileStorageProvider` interface; `LocalDiskFileStorage` ships in v1; `R2FileStorage` scaffolded with mock credentials |
| Per-file size cap | 10 MB |
| Per-user quota | 500 MB total, tracked transactionally on a `UserStorageUsage` row |
| Organization | Flat list, sortable + searchable |
| File types | PDF, JPG, PNG, HEIC/HEIF, DOC/DOCX, XLS/XLSX |
| File-type validation | Server-side magic-byte sniffing, not header MIME |
| Mobile capture | `<input type="file" accept=… capture="environment">` — accepts both camera and gallery |
| Route | New `/consumer/files`. `/consumer/documents` untouched. |
| Soft delete | 30-day retention before hard GC |
| Filename collisions | Append ` (2)`, ` (3)` — never silently overwrite |
| Audit logging | Every upload / download / delete / restore → `AuditLog` row |
| Signed downloads | 5-minute TTL, server-issued |
| Staff visibility | None. Hard ownership check on every endpoint. |

## 4. User Journey

### 4.1 Empty state

```
┌─ /consumer/files ─────────────────────────────────────────────┐
│  My files                                            [Upload] │
│  Personal storage for documents you want handy.               │
│                                                               │
│  ┌─────────────────────────────────────────────┐             │
│  │              📁 (folder icon)                │             │
│  │   No files yet                               │             │
│  │   Upload PDFs, images, or Office docs.       │             │
│  │   Up to 10 MB each · 500 MB total.           │             │
│  │                                              │             │
│  │   [ Choose files ]   [ Take photo ]          │             │
│  └─────────────────────────────────────────────┘             │
│                                                               │
│  Quota: 0 MB of 500 MB used                                   │
└───────────────────────────────────────────────────────────────┘
```

### 4.2 Populated list

```
┌─ /consumer/files ─────────────────────────────────────────────┐
│  My files                       [🔍 Search…]      [Upload]    │
│                                                               │
│  Quota: 134 MB of 500 MB used                                 │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ 📄 Court order — Bahawalpur.pdf    2.4 MB   2 days ago │  │
│  │                              [Download]  [⋯ Delete]    │  │
│  ├────────────────────────────────────────────────────────┤  │
│  │ 🖼 IMG_0042.jpg                  1.1 MB   5 days ago   │  │
│  │                              [Download]  [⋯ Delete]    │  │
│  ├────────────────────────────────────────────────────────┤  │
│  │ 📄 Lease deed (signed).pdf       820 KB   2 weeks ago  │  │
│  │                              [Download]  [⋯ Delete]    │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                               │
│  Recently deleted (30-day recovery)              [Show / Hide]│
└───────────────────────────────────────────────────────────────┘
```

Sort: newest first, with a header dropdown for "Newest / Oldest / Name A→Z / Largest". Search filters by filename, case-insensitive substring.

### 4.3 Upload flow

A single button labelled "Upload" opens a file picker. On mobile the picker offers both gallery and camera (because `accept` covers images and `capture` is set). Multi-file selection is supported. Per-file errors (oversize, wrong type, quota exceeded) surface inline next to the offending entry; successful files appear in the list immediately with optimistic UI, then reconcile with server state.

### 4.4 Soft delete and restore

Tapping "Delete" moves the file to a "Recently deleted" sub-section visible at the bottom of the list (collapsible). The file remains downloadable from there for 30 days, after which a daily GC job hard-deletes it from storage. Restoring within 30 days returns it to the main list.

## 5. Architecture

### 5.1 Backend overview

```
                ┌──────────────────────────────┐
                │     PersonalFilesController   │
                │  POST  /personal-files        │
                │  GET   /personal-files        │
                │  GET   /personal-files/:id/download
                │  POST  /personal-files/:id/restore
                │  DELETE /personal-files/:id   │
                │  GET   /personal-files/quota  │
                └──────────────┬───────────────┘
                               │
                ┌──────────────▼───────────────┐
                │     PersonalFilesService      │
                │  • ownership check            │
                │  • magic-byte validation      │
                │  • quota update (transaction) │
                │  • soft-delete + restore      │
                │  • audit log                  │
                │  • collision-safe naming      │
                └──────────────┬───────────────┘
                               │
                ┌──────────────▼───────────────┐
                │   FileStorageProvider iface   │
                │  put(key, bytes, mime)        │
                │  getSignedUrl(key, ttl)       │
                │  delete(key)                  │
                │  exists(key)                  │
                └──────────────┬───────────────┘
                               │
            ┌──────────────────┴────────────────────┐
            │                                       │
┌───────────▼──────────────┐         ┌──────────────▼─────────────┐
│   LocalDiskFileStorage    │         │   R2FileStorage             │
│   uploads/personal-files/ │         │   AWS SDK v3 + R2 endpoint  │
│   served via /files/...   │         │   PUT + GET signed URLs     │
└───────────────────────────┘         └────────────────────────────┘
```

### 5.2 Frontend overview

Single route at `apps/web/app/(consumer)/consumer/files/page.tsx`. Inside it:

- `personal-files-list.tsx` — header (search, upload button, quota bar) + list + recently-deleted subsection
- `personal-files-uploader.tsx` — file input + progress + per-file error
- `personal-files-row.tsx` — name, size, date, download button, delete button
- `hooks/use-personal-files.ts` — list + upload + delete + restore + quota state, with optimistic updates

A dedicated `apps/web/lib/personal-files-api.ts` module wraps the API calls.

### 5.3 Database

One new model + a counter row per user. Soft delete is a column, not a separate trash table.

```prisma
model PersonalFile {
  id             String     @id @default(cuid())
  userId         String
  storageKey     String     @unique          // bucket-relative key, e.g. user_<id>/2026/05/cuid_filename.pdf
  originalName   String
  displayName    String                       // collision-resolved (may have " (2)" etc.)
  mimeType       String
  sizeBytes      Int
  deletedAt      DateTime?
  createdAt      DateTime   @default(now())
  user           User       @relation(fields: [userId], references: [id])

  @@index([userId, deletedAt, createdAt])
}

model UserStorageUsage {
  userId         String     @id
  bytesUsed      BigInt     @default(0)
  fileCount      Int        @default(0)
  updatedAt      DateTime   @updatedAt
  user           User       @relation(fields: [userId], references: [id])
}
```

`bytesUsed` is updated atomically inside the same transaction as `PersonalFile.create` (or `update` for soft delete / restore, or `delete` for hard GC). Never recomputed by SUM() at request time.

### 5.4 Storage layout

The bucket is private. Keys are organised as `user_<userId>/<YYYY>/<MM>/<cuid>_<sanitized-filename>`:

- The `user_<userId>` prefix doubles as a defense-in-depth ownership boundary; if a route ever forgets to filter by userId, the storage layer would still refuse a request whose computed key prefix doesn't match the authenticated user.
- The `cuid` prefix in the filename guarantees uniqueness inside the storage layer; collision-resolution at the user-visible `displayName` level happens in the service.

## 6. Endpoints

All endpoints require an authenticated consumer JWT. Admin/staff JWTs are explicitly rejected with 403 — these are personal files; staff have no business reading them. The check lives in a single `assertConsumer(user)` helper called by every handler.

```
POST /api/personal-files
  multipart/form-data: file
  → 201 { id, displayName, sizeBytes, mimeType, createdAt }
  → 400 { error: 'invalid_type' | 'oversize' | 'corrupted' }
  → 413 { error: 'quota_exceeded', usedBytes, quotaBytes }

GET /api/personal-files?search=&sort=&includeDeleted=
  → 200 { files: PersonalFileDto[], usage: { bytesUsed, fileCount, quotaBytes } }

GET /api/personal-files/:id/download
  → 302 (Location header: signed URL with 5-min TTL)
  → 404 if not found OR not owned by caller
  Audit-logs DOWNLOAD

DELETE /api/personal-files/:id
  → 204
  Marks deletedAt = now(); does not touch storage. Audit-logs SOFT_DELETE.

POST /api/personal-files/:id/restore
  → 200 { id, displayName, ... }
  Clears deletedAt. Refuses if 30-day window expired (404).
  Audit-logs RESTORE.

GET /api/personal-files/quota
  → 200 { bytesUsed, fileCount, quotaBytes }
```

The `PersonalFileDto` shape:

```ts
type PersonalFileDto = {
  id: string;
  displayName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  deletedAt: string | null;
};
```

## 7. FileStorageProvider Interface

```ts
// apps/api/src/file-storage/file-storage-provider.ts
export interface FileStorageProvider {
  /** Write bytes to `key`. Overwrites if the key exists. */
  put(key: string, bytes: Buffer, mimeType: string): Promise<void>;

  /** Return a time-limited URL the client can GET. ttlSeconds <= 600. */
  getSignedDownloadUrl(key: string, ttlSeconds: number, opts?: { downloadName?: string }): Promise<string>;

  /** Hard delete a single key. Idempotent. */
  delete(key: string): Promise<void>;

  /** True if the key exists. */
  exists(key: string): Promise<boolean>;
}
```

### 7.1 LocalDiskFileStorage (v1 default)

Writes under `<UPLOADS_DIR>/personal-files/<key>`. Signed URLs are short-lived bearer tokens hashed-and-checked by an existing or new `/files/personal/:token` endpoint that streams the bytes; tokens are stored in an in-memory LRU keyed by `(token → key, expiresAt, mimeType, downloadName)`. The token is opaque to the client. This matches the auth-stream pattern already used for `wallet-receipts` and removes the need for the bucket to be web-served directly.

### 7.2 R2FileStorage (mock v1, real later)

Implementation uses `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` against R2's S3-compatible endpoint. Production env vars: `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT` (computed from account id), `R2_PUBLIC_DOMAIN` (optional).

In v1 these env vars are **deliberately placeholder/empty**. A `FileStorageModule` factory inspects the env at boot:

- If `R2_BUCKET` is set → instantiate `R2FileStorage`.
- Else → instantiate `LocalDiskFileStorage`.

The R2 implementation file ships with the abstraction wired and a one-line README pointing at the env vars. The LocalDisk implementation is the working v1 storage. When the user adds real R2 credentials, the system swaps providers on next boot — zero code change.

## 8. Validation Pipeline

Order of checks per upload, all server-side:

1. **Authn:** must be a consumer JWT (else 403).
2. **Quota precheck:** `usedBytes + incomingSize <= 500 MB` (else 413).
3. **Size check:** `incomingSize <= 10 MB` (else 400 oversize).
4. **Magic-byte sniff:** read the first ~4KB and match against an allowlist of file signatures. Use a small embedded table (PDF `%PDF`, JPEG `FF D8 FF`, PNG `89 50 4E 47`, HEIC ftyp+brand, DOCX/XLSX = ZIP signature `50 4B 03 04`, DOC/XLS OLE signature `D0 CF 11 E0`). Reject anything else with 400 `invalid_type`. Do NOT trust the multipart `Content-Type` header for the decision.
5. **Filename sanitisation:** strip path separators, control chars, and trailing dots; truncate to 200 chars; enforce a single extension matching the sniffed type (so `evil.pdf.exe` becomes `evil.pdf` only if the sniff agreed it's a PDF, otherwise rejected).
6. **Collision resolution:** if `displayName` already exists for this user (among non-deleted files), append ` (2)`, ` (3)`, etc.
7. **Atomic write:** put to a temp key (`<userId>/__tmp/<cuid>`), then `put` to the final key, then delete the temp key. (For LocalDisk this is `mkdir -p` + `rename`; for R2 this is `PutObject` to temp + `CopyObject` to final + `DeleteObject` of temp.)
8. **Transactional row insert:** `prisma.$transaction([create PersonalFile, update UserStorageUsage])`. If either fails, the storage layer's temp key is GC'd.
9. **Audit log:** `AUDIT_PERSONAL_FILE_UPLOAD` with `{ fileId, sizeBytes, mimeType }`.

## 9. Security and Ownership

- Every endpoint reads `userId` from the JWT and refuses any operation on a `PersonalFile` whose `userId` differs. No "admin override". The `assertConsumer(user)` guard fails closed on missing/invalid roles.
- Storage keys are prefixed with `user_<userId>/` so accidental cross-user reads are impossible at the storage layer too.
- Signed URLs have a 5-minute TTL and are single-issue per request — the URL is generated for a specific `(fileId, userId, mimeType, downloadName)` tuple at the moment of the GET; the client cannot reuse it past the TTL or share it with another user (the URL bakes in the storage key, which contains the userId prefix).
- `staff` and `admin` JWTs hitting any `/personal-files` endpoint receive 403 — not 404. Audit-logged.

## 10. Soft Delete and GC

- `DELETE /personal-files/:id` sets `deletedAt = now()`. Storage is not touched. Quota is **not** refunded — soft-deleted files still count against the user. (This is the behavior most consumers expect from Drive/Dropbox; it also makes restore atomic.)
- `POST /personal-files/:id/restore` clears `deletedAt`. Refuses if `now > deletedAt + 30d` (404 with `error: 'gc_window_expired'`).
- A daily NestJS cron (`@Cron('0 3 * * *')`) finds all `PersonalFile` with `deletedAt < now - 30d`, calls `provider.delete(storageKey)` for each, and deletes the row inside a transaction that decrements `UserStorageUsage.bytesUsed` and `fileCount`. Failures (storage delete throws) are logged and retried the next day; the row is not deleted unless the storage delete succeeded.

## 11. Frontend Behavior

- The list is the source of truth visible to the user. Quota is shown above it as a progress bar (`{bytesUsed} of {quotaBytes}`).
- Upload is optimistic: the file appears in the list immediately with a small spinner; on success the spinner clears and `id` is set; on failure the row is replaced with an error state and a retry button.
- Multi-file upload runs uploads in parallel (max 3 concurrent) so the user isn't blocked waiting for one slow upload.
- Search filters client-side over the loaded list (no server round-trip per keystroke); list is paginated server-side at 100 rows max — if a user has more, the response includes `nextCursor` and the UI shows "Load more". (Most users won't hit this; pagination exists so the UI doesn't choke when they do.)
- "Recently deleted" subsection is collapsed by default; expanding it loads `?includeDeleted=true`.
- Mobile: the upload button presents the device's native picker which offers camera + gallery (the `accept` attribute covers images so iOS/Android show camera as a source).

## 12. Error Handling

- **Upload too large:** inline error on the row with the file's name; the rest of the multi-upload continues.
- **Quota exceeded:** the upload button shows "Quota full — free up space"; uploads are disabled until a soft delete or restore brings usage below 500 MB.
- **Magic-byte mismatch:** inline error "This file isn't a supported type." No retry — the file is genuinely wrong.
- **Network error mid-upload:** spinner becomes a "Retry" button; the optimistic row stays.
- **Download URL signing fails:** toast "Download unavailable, please try again." No state change.
- **Soft-delete fails:** toast; the row stays in the list (no optimistic remove).

## 13. Audit Log Actions

The existing `AuditLog` table gets these new actions:

- `PERSONAL_FILE_UPLOAD`
- `PERSONAL_FILE_DOWNLOAD`
- `PERSONAL_FILE_SOFT_DELETE`
- `PERSONAL_FILE_RESTORE`
- `PERSONAL_FILE_HARD_DELETE` (cron)

Metadata for each: `{ fileId, displayName, sizeBytes, mimeType }`.

## 14. Testing

- **Unit (apps/api):** `personal-files.service.spec.ts` covering quota enforcement, magic-byte rejection, collision resolution, soft-delete flow, restore window expiry, ownership refusal.
- **Unit (apps/api):** `local-disk-file-storage.spec.ts` and `r2-file-storage.spec.ts` (using AWS SDK mocks).
- **E2E (Playwright, `tests/e2e/personal-files.spec.ts`):** consumer logs in via OTP devCode, uploads a fixture PDF, sees it in the list, downloads it, deletes it, restores it, deletes again, sees it under "Recently deleted".

## 15. Migration & Risks

- Two new tables (`PersonalFile`, `UserStorageUsage`) + one new bucket (`personal-files`). No data migration. Migration script seeds a `UserStorageUsage(userId, 0, 0)` row for every existing User.
- The R2 implementation ships unconfigured (env vars unset). If anyone in prod sets `R2_BUCKET` partially without other vars, the boot factory throws clearly rather than falling back silently to local disk.
- Local-disk in v1 means files written to disk are still tied to the API instance's persistent volume. This is a known limitation that the R2 swap will resolve. A `README` note in `apps/api/src/file-storage/` explicitly documents this.

## 16. Out of Scope (Deferred Follow-ups)

- Migrating existing `ticket-documents` / `wallet-receipts` / `clerk-receipts` buckets to the same `FileStorageProvider` abstraction. (The abstraction is general enough; it just wasn't worth doing in this PR.)
- Sharing files with assigned staff (would require a per-file ACL).
- Folders, tags, or any organisational hierarchy.
- File versioning.
- In-browser preview (PDF.js, image lightbox).
- Bulk download / zip archive.
- Mobile app deep links.

## 17. Open Questions for Plan-Time

- Cron scheduling — confirm whether the API already has `@nestjs/schedule` registered, or this becomes a small dependency add.
- Whether `UserStorageUsage` should be back-filled at migration time with `(0, 0)` or computed by SUM() at first use. Default: back-fill at migration time so the runtime path never has to handle the missing-row case.
