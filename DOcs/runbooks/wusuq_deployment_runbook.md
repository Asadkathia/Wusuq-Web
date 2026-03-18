# Wusuq Deployment Runbook (Vercel + Render + Neon)

Last Updated: 2026-03-19

## Current Status
- Web deployed on Vercel: `https://wusuq-web.vercel.app` (verified 200 HTML response)
- API deployed on Render: `https://wusuq-api.onrender.com` (health endpoint reachable, DB connected)
- Neon project provisioned: `wusuq` (`orange-wind-04356254`) with `dev/stage/prod` branches
- Deployment verification status: PASS (`/api/health` => `status=ok`, `database=up`)

## 1. Deployment Targets
- Web: Vercel (`apps/web`)
- API: Render (`render.yaml` service `wusuq-api`)
- DB: Neon Postgres (dev/stage/prod branches)

## 2. Required Environment Variables

### API (Render)
- `DATABASE_URL`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `PORT=4000`

### Web (Vercel)
- `NEXT_PUBLIC_API_BASE_URL`
- `NEXT_PUBLIC_AUTH_COOKIE_DOMAIN`
- `NEXT_PUBLIC_ENABLE_EXPERIMENTAL`

## 3. Neon Setup (Free-tier-first)
1. Create Neon project `wusuq`.
2. Create branches:
- `dev`
- `stage`
- `prod`
3. Get connection strings for each branch.
4. Map DB URLs:
- local `.env` -> `dev`
- Render preview -> `stage`
- Render production -> `prod`

## 4. Render Setup (API)
1. Create a new Web Service from repo root.
2. Use `render.yaml` blueprint or set:
- Build: `pnpm install --frozen-lockfile && pnpm --filter @wusuq/api build`
- Start: `pnpm --filter @wusuq/api start:prod`
- Health: `/api/health`
3. Add API env vars from section 2.
4. Deploy and verify:
- `GET /api/health` returns `ok` or `degraded`

## 5. Vercel Setup (Web)
1. Import repo in Vercel.
2. Set root directory to `apps/web`.
3. Confirm `apps/web/vercel.json` commands are applied.
4. Add web env vars from section 2.
5. Deploy and verify login page and protected routes.

## 6. Post-Deploy Smoke Checklist
- API health endpoint responds.
- Web dashboard loads.
- Auth login and refresh complete.
- Ticket list endpoint works with auth token.
- Finance and wallet list endpoints respond.

Automated check:
- `pnpm deploy:verify`
- or file-driven: `pnpm deploy:verify:file` (loads `.env.deploy`)
- Env vars for script:
  - `DEPLOY_API_BASE_URL=https://your-api-domain/api`
  - `DEPLOY_WEB_BASE_URL=https://your-web-domain`
  - optional for non-https local checks: `DEPLOY_ALLOW_INSECURE=true`
- File template:
  - `cp .env.deploy.example .env.deploy`
  - edit `.env.deploy` once, then run `pnpm deploy:verify:file`
- Output log: `DOcs/runbooks/wusuq_deployment_verification_log.md`

## 7. Rollback
- Vercel: redeploy previous successful build.
- Render: rollback to previous deployment.
- Neon: restore from branch snapshot if needed.

## 8. Signoff Artifacts
- `DOcs/runbooks/wusuq_uat_execution_log.md`
- `DOcs/runbooks/wusuq_role_uat_execution_log.md`
- `DOcs/runbooks/wusuq_deployment_verification_log.md`
- `DOcs/runbooks/wusuq_cutover_hypercare.md`
