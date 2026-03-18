#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';

function parseEnvFile(path) {
  if (!existsSync(path)) return {};
  const content = readFileSync(path, 'utf8');
  const env = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function runCommand(cmd, args, env) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => {
      stdout += d.toString();
    });
    child.stderr.on('data', (d) => {
      stderr += d.toString();
    });
    child.on('close', (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

const startedAt = new Date();
const fileEnv = {
  ...parseEnvFile('.env.deploy'),
  ...parseEnvFile('.env.uat.roles'),
};
const env = { ...process.env, ...fileEnv };

const checks = [];

const deploy = await runCommand('pnpm', ['deploy:verify'], env);
checks.push({
  check: 'deploy:verify',
  status: deploy.code === 0 ? 'PASS' : 'FAIL',
  code: deploy.code,
  summary: deploy.code === 0 ? 'Deployment verification passed' : 'Deployment verification failed',
});

const roles = await runCommand('pnpm', ['uat:roles'], env);
checks.push({
  check: 'uat:roles',
  status: roles.code === 0 ? 'PASS' : 'FAIL',
  code: roles.code,
  summary: roles.code === 0 ? 'Role matrix passed' : 'Role matrix failed',
});

const endedAt = new Date();
const failed = checks.some((c) => c.status === 'FAIL');

const lines = [
  '# Wusuq Hypercare Check Snapshot',
  '',
  `Executed At: ${endedAt.toISOString()}`,
  `Duration: ${Math.round((endedAt.getTime() - startedAt.getTime()) / 1000)}s`,
  '',
  '## Summary',
  ...checks.map((c) => `- ${c.check}: ${c.status} (exit ${c.code}) - ${c.summary}`),
  '',
  `Overall: ${failed ? 'FAIL' : 'PASS'}`,
  '',
  '## deploy:verify output',
  '```text',
  deploy.stdout.trim() || '(no stdout)',
  deploy.stderr.trim() || '(no stderr)',
  '```',
  '',
  '## uat:roles output',
  '```text',
  roles.stdout.trim() || '(no stdout)',
  roles.stderr.trim() || '(no stderr)',
  '```',
  '',
];

writeFileSync('DOcs/runbooks/wusuq_hypercare_check_log.md', lines.join('\n'), 'utf8');

for (const c of checks) {
  console.log(`${c.status} ${c.check} (exit ${c.code})`);
}
console.log(`Overall: ${failed ? 'FAIL' : 'PASS'}`);
console.log('Wrote DOcs/runbooks/wusuq_hypercare_check_log.md');

process.exit(failed ? 1 : 0);
