#!/usr/bin/env node
/**
 * What the browser tests run against: the static export, served.
 *
 * Playwright starts this as its web server. If there is no export yet it
 * builds one first — with the demo, so a local run never tests against, or
 * leaks, the maintainer's own save. In CI the build step has already run and
 * this only serves.
 *
 * Set E2E_BUILD=1 to rebuild regardless.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const app = resolve(here, '..');
const out = resolve(app, 'out', 'index.html');

if (!existsSync(out) || process.env.E2E_BUILD === '1') {
  console.log('e2e: no export found, building the demo');
  const build = spawnSync('npm', ['run', 'build'], {
    cwd: app,
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, FACTORY_BOARD_DEMO: '1' },
  });
  if (build.status !== 0) process.exit(build.status ?? 1);
}

process.argv[2] = process.argv[2] ?? '8740';
await import('./serve-out.mjs');
