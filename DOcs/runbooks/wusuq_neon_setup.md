# Wusuq Neon Setup Record

Last Updated: 2026-03-19

## Project
- Name: `wusuq`
- Project ID: `orange-wind-04356254`
- Region: `aws-us-east-1`
- Organization ID: `org-weathered-sunset-10295420`

## Branches
- `main` (default)
- `dev`
- `stage`
- `prod`

## Initialization Completed
- Prisma schema applied to `dev`, `stage`, `prod` via `prisma db push`
- Seed executed on `dev`, `stage`, `prod`
- Super-admin seeded: `superadmin@wusuq.com`

## Local Artifacts (gitignored)
- `apps/api/.env.neon.generated`
  - Contains branch-specific Neon connection strings
  - Includes suggested Render production env values
- `.env.deploy`
  - Configured with live web/api URLs for `pnpm deploy:verify:file`

## Remaining Action
- Set Render service env vars using generated values:
  - `DATABASE_URL` (use `DATABASE_URL_PROD`)
  - `JWT_ACCESS_SECRET`
  - `JWT_REFRESH_SECRET`
- Redeploy Render and confirm `/api/health` shows `database=up`
