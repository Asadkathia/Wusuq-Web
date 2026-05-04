# Wusuq Role UAT Execution Log

Executed At: 2026-05-04T16:44:49.604Z
API Base URL: http://localhost:4000/api
Duration: 0s

## Results

| Role | Check | Status | Details |
| --- | --- | --- | --- |
| super-admin | credentials | SKIP | Missing role credentials in env vars |
| admin | credentials | SKIP | Missing role credentials in env vars |
| consumer | credentials | SKIP | Missing role credentials in env vars |
| clerk | credentials | SKIP | Missing role credentials in env vars |

Roles with missing credentials: 4
Overall: PASS

## Notes
- Provide role credentials via env vars to execute full role matrix.
- Expected RBAC status for `GET /users` is configurable per role env vars.
