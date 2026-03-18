# Wusuq Role UAT Execution Log

Executed At: 2026-03-18T22:36:07.279Z
API Base URL: https://wusuq-api.onrender.com/api
Duration: 20s

## Results

| Role | Check | Status | Details |
| --- | --- | --- | --- |
| super-admin | login | PASS |  |
| super-admin | rbac/users | PASS |  |
| super-admin | refresh | PASS |  |
| super-admin | logout | PASS |  |
| admin | login | PASS |  |
| admin | rbac/users | PASS |  |
| admin | refresh | PASS |  |
| admin | logout | PASS |  |
| consumer | login | PASS |  |
| consumer | rbac/users | PASS |  |
| consumer | refresh | PASS |  |
| consumer | logout | PASS |  |
| clerk | login | PASS |  |
| clerk | rbac/users | PASS |  |
| clerk | refresh | PASS |  |
| clerk | logout | PASS |  |

Roles with missing credentials: 0
Overall: PASS

## Notes
- Provide role credentials via env vars to execute full role matrix.
- Expected RBAC status for `GET /users` is configurable per role env vars.
