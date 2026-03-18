# Wusuq Hypercare Check Snapshot

Executed At: 2026-03-18T22:36:07.307Z
Duration: 96s

## Summary
- deploy:verify: PASS (exit 0) - Deployment verification passed
- uat:roles: PASS (exit 0) - Role matrix passed

Overall: PASS

## deploy:verify output
```text
> wusuq-rebuild@0.1.0 deploy:verify /Users/asad/Projects/Wusuq-Web
> node tests/deploy/verify_deployment.mjs

PASS API base URL configured
PASS API /health - status=ok, database=up
PASS Web base URL configured
PASS Web home page - Returned HTML with 200
Overall: PASS
Wrote DOcs/runbooks/wusuq_deployment_verification_log.md
(no stderr)
```

## uat:roles output
```text
> wusuq-rebuild@0.1.0 uat:roles /Users/asad/Projects/Wusuq-Web
> node tests/uat/role_uat_matrix.mjs

PASS [super-admin] login
PASS [super-admin] rbac/users
PASS [super-admin] refresh
PASS [super-admin] logout
PASS [admin] login
PASS [admin] rbac/users
PASS [admin] refresh
PASS [admin] logout
PASS [consumer] login
PASS [consumer] rbac/users
PASS [consumer] refresh
PASS [consumer] logout
PASS [clerk] login
PASS [clerk] rbac/users
PASS [clerk] refresh
PASS [clerk] logout
Roles with missing credentials: 0
Overall: PASS
Wrote DOcs/runbooks/wusuq_role_uat_execution_log.md
(no stderr)
```
