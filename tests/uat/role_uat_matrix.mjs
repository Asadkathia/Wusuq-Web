#!/usr/bin/env node

import { writeFileSync } from 'node:fs';

const apiBaseUrl = (process.env.UAT_API_BASE_URL ?? 'http://localhost:4000/api').replace(
  /\/$/,
  '',
);

const roles = [
  {
    key: 'super-admin',
    identifier: process.env.UAT_SUPERADMIN_IDENTIFIER,
    password: process.env.UAT_SUPERADMIN_PASSWORD,
    expectedUsersStatus: Number(process.env.UAT_SUPERADMIN_USERS_STATUS ?? '200'),
  },
  {
    key: 'admin',
    identifier: process.env.UAT_ADMIN_IDENTIFIER,
    password: process.env.UAT_ADMIN_PASSWORD,
    expectedUsersStatus: Number(process.env.UAT_ADMIN_USERS_STATUS ?? '200'),
  },
  {
    key: 'consumer',
    identifier: process.env.UAT_CONSUMER_IDENTIFIER,
    password: process.env.UAT_CONSUMER_PASSWORD,
    expectedUsersStatus: Number(process.env.UAT_CONSUMER_USERS_STATUS ?? '403'),
  },
  {
    key: 'clerk',
    identifier: process.env.UAT_CLERK_IDENTIFIER,
    password: process.env.UAT_CLERK_PASSWORD,
    expectedUsersStatus: Number(process.env.UAT_CLERK_USERS_STATUS ?? '403'),
  },
];

const startedAt = new Date();
const rows = [];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function requestJson(url, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
  });

  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = raw;
  }

  return { response, body };
}

async function runRole(role) {
  if (!role.identifier || !role.password) {
    rows.push({
      role: role.key,
      check: 'credentials',
      status: 'SKIP',
      details: 'Missing role credentials in env vars',
    });
    return;
  }

  let accessToken;
  let refreshToken;

  try {
    const login = await requestJson(`${apiBaseUrl}/auth/login`, {
      method: 'POST',
      body: JSON.stringify({
        identifier: role.identifier,
        password: role.password,
      }),
    });

    assert(
      login.response.status === 200 || login.response.status === 201,
      `login status ${login.response.status}`,
    );
    assert(login.body?.accessToken, 'missing accessToken');
    assert(login.body?.refreshToken, 'missing refreshToken');
    accessToken = login.body.accessToken;
    refreshToken = login.body.refreshToken;
    rows.push({ role: role.key, check: 'login', status: 'PASS', details: '' });
  } catch (error) {
    rows.push({
      role: role.key,
      check: 'login',
      status: 'FAIL',
      details: error instanceof Error ? error.message : String(error),
    });
    return;
  }

  try {
    const users = await requestJson(`${apiBaseUrl}/users`, {
      method: 'GET',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    assert(
      users.response.status === role.expectedUsersStatus,
      `expected ${role.expectedUsersStatus}, got ${users.response.status}`,
    );
    rows.push({ role: role.key, check: 'rbac/users', status: 'PASS', details: '' });
  } catch (error) {
    rows.push({
      role: role.key,
      check: 'rbac/users',
      status: 'FAIL',
      details: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    const refresh = await requestJson(`${apiBaseUrl}/auth/refresh`, {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    });

    assert(
      refresh.response.status === 200 || refresh.response.status === 201,
      `refresh status ${refresh.response.status}`,
    );
    assert(refresh.body?.accessToken, 'missing refresh access token');
    accessToken = refresh.body.accessToken;
    rows.push({ role: role.key, check: 'refresh', status: 'PASS', details: '' });
  } catch (error) {
    rows.push({
      role: role.key,
      check: 'refresh',
      status: 'FAIL',
      details: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    const logout = await requestJson(`${apiBaseUrl}/auth/logout`, {
      method: 'POST',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    assert(
      logout.response.status === 200 || logout.response.status === 201,
      `logout status ${logout.response.status}`,
    );
    assert(logout.body?.success === true, 'logout did not return success=true');
    rows.push({ role: role.key, check: 'logout', status: 'PASS', details: '' });
  } catch (error) {
    rows.push({
      role: role.key,
      check: 'logout',
      status: 'FAIL',
      details: error instanceof Error ? error.message : String(error),
    });
  }
}

for (const role of roles) {
  // Sequential to avoid throttling cross-talk in auth endpoints.
  await runRole(role);
}

const endedAt = new Date();
const failed = rows.some((row) => row.status === 'FAIL');
const skippedRoles = roles.filter(
  (r) => !r.identifier || !r.password,
).length;

const lines = [
  '# Wusuq Role UAT Execution Log',
  '',
  `Executed At: ${endedAt.toISOString()}`,
  `API Base URL: ${apiBaseUrl}`,
  `Duration: ${Math.round((endedAt.getTime() - startedAt.getTime()) / 1000)}s`,
  '',
  '## Results',
  '',
  '| Role | Check | Status | Details |',
  '| --- | --- | --- | --- |',
  ...rows.map(
    (row) =>
      `| ${row.role} | ${row.check} | ${row.status} | ${row.details.replaceAll('|', '\\|')} |`,
  ),
  '',
  `Roles with missing credentials: ${skippedRoles}`,
  `Overall: ${failed ? 'FAIL' : 'PASS'}`,
  '',
  '## Notes',
  '- Provide role credentials via env vars to execute full role matrix.',
  '- Expected RBAC status for `GET /users` is configurable per role env vars.',
  '',
];

writeFileSync('DOcs/runbooks/wusuq_role_uat_execution_log.md', lines.join('\n'), 'utf8');

for (const row of rows) {
  const msg = `${row.status.padEnd(4)} [${row.role}] ${row.check}${row.details ? ` - ${row.details}` : ''}`;
  console.log(msg);
}
console.log(`Roles with missing credentials: ${skippedRoles}`);
console.log(`Overall: ${failed ? 'FAIL' : 'PASS'}`);
console.log('Wrote DOcs/runbooks/wusuq_role_uat_execution_log.md');

process.exit(failed ? 1 : 0);
