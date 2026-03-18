#!/usr/bin/env node

import { writeFileSync } from 'node:fs';

const startedAt = new Date();
const apiBaseUrl = (process.env.UAT_API_BASE_URL ?? 'http://localhost:4000/api').replace(
  /\/$/,
  '',
);
const identifier = process.env.UAT_IDENTIFIER;
const password = process.env.UAT_PASSWORD;
const enableRateLimitCheck = process.env.UAT_CHECK_RATE_LIMIT !== 'false';

const results = [];

async function runStep(name, fn, required = true) {
  try {
    await fn();
    results.push({ name, status: 'PASS', required, details: '' });
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    results.push({ name, status: required ? 'FAIL' : 'SKIP', required, details });
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

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

let accessToken;
let refreshToken;

await runStep('GET /health', async () => {
  const { response, body } = await requestJson(`${apiBaseUrl}/health`, { method: 'GET' });
  assert(response.status === 200, `Expected 200, got ${response.status}`);
  assert(
    body && ['ok', 'degraded'].includes(body.status),
    `Unexpected health status: ${JSON.stringify(body)}`,
  );
});

if (enableRateLimitCheck) {
  await runStep('POST /auth/refresh rate-limit burst', async () => {
    const attempts = 12;
    let sawTooManyRequests = false;

    for (let i = 0; i < attempts; i += 1) {
      const { response } = await requestJson(`${apiBaseUrl}/auth/refresh`, {
        method: 'POST',
        body: JSON.stringify({
          refreshToken: 'invalid-smoke-token',
        }),
      });

      if (response.status === 429) {
        sawTooManyRequests = true;
        break;
      }
    }

    assert(
      sawTooManyRequests,
      'Expected at least one 429 response during auth burst test',
    );
  });
}

if (identifier && password) {
  await runStep('POST /auth/login', async () => {
    const { response, body } = await requestJson(`${apiBaseUrl}/auth/login`, {
      method: 'POST',
      body: JSON.stringify({ identifier, password }),
    });

    assert(response.status === 201 || response.status === 200, `Unexpected status ${response.status}`);
    assert(body?.accessToken && body?.refreshToken, 'Missing access/refresh token in login response');
    accessToken = body.accessToken;
    refreshToken = body.refreshToken;
  });

  await runStep('POST /auth/refresh', async () => {
    assert(refreshToken, 'Refresh token not available');
    const { response, body } = await requestJson(`${apiBaseUrl}/auth/refresh`, {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    });

    assert(response.status === 201 || response.status === 200, `Unexpected status ${response.status}`);
    assert(body?.accessToken && body?.refreshToken, 'Missing tokens in refresh response');
    accessToken = body.accessToken;
  });

  await runStep('POST /auth/logout', async () => {
    assert(accessToken, 'Access token not available');
    const { response, body } = await requestJson(`${apiBaseUrl}/auth/logout`, {
      method: 'POST',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    assert(response.status === 201 || response.status === 200, `Unexpected status ${response.status}`);
    assert(body?.success === true, `Unexpected logout response: ${JSON.stringify(body)}`);
  });
} else {
  results.push({
    name: 'Auth flow (login/refresh/logout)',
    status: 'SKIP',
    required: false,
    details: 'Set UAT_IDENTIFIER and UAT_PASSWORD to enable auth smoke tests',
  });
}

const endedAt = new Date();
const failedRequired = results.some((item) => item.required && item.status === 'FAIL');

const lines = [
  '# Wusuq UAT Execution Log',
  '',
  `Executed At: ${endedAt.toISOString()}`,
  `API Base URL: ${apiBaseUrl}`,
  `Rate-limit check: ${enableRateLimitCheck ? 'enabled' : 'disabled'}`,
  `Duration: ${Math.round((endedAt.getTime() - startedAt.getTime()) / 1000)}s`,
  '',
  '## Results',
  '',
  '| Check | Status | Required | Details |',
  '| --- | --- | --- | --- |',
  ...results.map(
    (r) =>
      `| ${r.name} | ${r.status} | ${r.required ? 'Yes' : 'No'} | ${r.details.replaceAll('|', '\\|')} |`,
  ),
  '',
  `Overall: ${failedRequired ? 'FAIL' : 'PASS'}`,
  '',
  '## Notes',
  '- This is a smoke-level execution log for Phase 8 progression.',
  '- Full role-based UAT remains tracked in DOcs/runbooks/wusuq_uat_checklist.md.',
  '',
];

writeFileSync('DOcs/runbooks/wusuq_uat_execution_log.md', `${lines.join('\n')}`, 'utf8');

for (const result of results) {
  const msg = `${result.status.padEnd(4)} ${result.name}${result.details ? ` - ${result.details}` : ''}`;
  console.log(msg);
}
console.log(`Overall: ${failedRequired ? 'FAIL' : 'PASS'}`);
console.log('Wrote DOcs/runbooks/wusuq_uat_execution_log.md');

process.exit(failedRequired ? 1 : 0);
