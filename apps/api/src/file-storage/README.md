# File Storage

Pluggable file storage for personal files (and, in future,
ticket-documents, wallet-receipts, clerk-receipts).

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
The `LocalFilesController` exposes `/files/personal/:token` for signed
downloads, matching the auth-stream pattern used by wallet-receipts and
ticket-documents.
