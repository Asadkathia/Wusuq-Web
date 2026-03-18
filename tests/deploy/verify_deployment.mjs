#!/usr/bin/env node

import { writeFileSync } from 'node:fs';

const startedAt = new Date();
const apiBaseUrl = (process.env.DEPLOY_API_BASE_URL ?? '').replace(/\/$/, '');
const webBaseUrl = (process.env.DEPLOY_WEB_BASE_URL ?? '').replace(/\/$/, '');
const allowInsecure = process.env.DEPLOY_ALLOW_INSECURE === 'true';

const checks = [];

function pushCheck(name, status, details, required = true) {
  checks.push({ name, status, details, required });
}

function toUrl(pathBase, path) {
  return `${pathBase}${path}`;
}

async function fetchText(url) {
  const response = await fetch(url);
  const text = await response.text();
  return { response, text };
}

async function fetchJson(url) {
  const response = await fetch(url);
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = raw;
  }
  return { response, body };
}

function requireHttpsIfNeeded(url, label) {
  if (!allowInsecure && !url.startsWith('https://')) {
    throw new Error(`${label} must use https (set DEPLOY_ALLOW_INSECURE=true to bypass)`);
  }
}

async function run() {
  if (!apiBaseUrl) {
    pushCheck('API base URL configured', 'SKIP', 'Set DEPLOY_API_BASE_URL to verify API deploy', false);
  } else {
    try {
      requireHttpsIfNeeded(apiBaseUrl, 'DEPLOY_API_BASE_URL');
      pushCheck('API base URL configured', 'PASS', '');
    } catch (error) {
      pushCheck('API base URL configured', 'FAIL', error instanceof Error ? error.message : String(error));
    }

    try {
      const { response, body } = await fetchJson(toUrl(apiBaseUrl, '/health'));
      if (response.status !== 200) {
        throw new Error(`Expected 200, got ${response.status}`);
      }
      if (!body || !['ok', 'degraded'].includes(body.status)) {
        throw new Error(`Unexpected health payload: ${JSON.stringify(body)}`);
      }
      pushCheck('API /health', 'PASS', `status=${body.status}, database=${body.database}`);
    } catch (error) {
      pushCheck('API /health', 'FAIL', error instanceof Error ? error.message : String(error));
    }
  }

  if (!webBaseUrl) {
    pushCheck('Web base URL configured', 'SKIP', 'Set DEPLOY_WEB_BASE_URL to verify web deploy', false);
  } else {
    try {
      requireHttpsIfNeeded(webBaseUrl, 'DEPLOY_WEB_BASE_URL');
      pushCheck('Web base URL configured', 'PASS', '');
    } catch (error) {
      pushCheck('Web base URL configured', 'FAIL', error instanceof Error ? error.message : String(error));
    }

    try {
      const { response, text } = await fetchText(webBaseUrl);
      if (response.status !== 200) {
        throw new Error(`Expected 200, got ${response.status}`);
      }
      if (!text.includes('<html')) {
        throw new Error('Expected HTML response');
      }
      pushCheck('Web home page', 'PASS', 'Returned HTML with 200');
    } catch (error) {
      pushCheck('Web home page', 'FAIL', error instanceof Error ? error.message : String(error));
    }
  }

  const failedRequired = checks.some((c) => c.required && c.status === 'FAIL');
  const endedAt = new Date();
  const lines = [
    '# Wusuq Deployment Verification Log',
    '',
    `Executed At: ${endedAt.toISOString()}`,
    `API Base URL: ${apiBaseUrl || '(not set)'}`,
    `Web Base URL: ${webBaseUrl || '(not set)'}`,
    `Allow insecure URLs: ${allowInsecure ? 'true' : 'false'}`,
    `Duration: ${Math.round((endedAt.getTime() - startedAt.getTime()) / 1000)}s`,
    '',
    '## Results',
    '',
    '| Check | Status | Required | Details |',
    '| --- | --- | --- | --- |',
    ...checks.map((c) => `| ${c.name} | ${c.status} | ${c.required ? 'Yes' : 'No'} | ${c.details.replaceAll('|', '\\|')} |`),
    '',
    `Overall: ${failedRequired ? 'FAIL' : 'PASS'}`,
    '',
  ];

  writeFileSync('DOcs/runbooks/wusuq_deployment_verification_log.md', `${lines.join('\n')}`, 'utf8');

  for (const c of checks) {
    console.log(`${c.status.padEnd(4)} ${c.name}${c.details ? ` - ${c.details}` : ''}`);
  }
  console.log(`Overall: ${failedRequired ? 'FAIL' : 'PASS'}`);
  console.log('Wrote DOcs/runbooks/wusuq_deployment_verification_log.md');

  process.exit(failedRequired ? 1 : 0);
}

void run();
