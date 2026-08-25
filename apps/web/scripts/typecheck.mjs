#!/usr/bin/env node
/**
 * Type-checks the app, but only where it can be.
 *
 * The app inlines the extracted game database, which is generated from the
 * developer's own Satisfactory install and never committed (see docs/adr/0003).
 * Without it `tsc` fails on a missing import, which is why the root `typecheck`
 * covered the packages alone — and why a type error in the app went unseen until
 * `next build`.
 *
 * So: check it when the data is there, say plainly why not when it is not. Same
 * bargain the integration tests strike.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const app = resolve(here, '..');
const database = resolve(app, 'src/generated/game-database.json');
const extracted = resolve(app, '../../packages/game-data/generated/game-database.json');

if (!existsSync(database) && !existsSync(extracted)) {
  console.log('apps/web typecheck skipped: no game database. Run `npm run extract` first.');
  process.exit(0);
}

if (!existsSync(database)) {
  const sync = spawnSync(process.execPath, [resolve(here, 'sync-game-data.mjs')], {
    stdio: 'inherit',
  });
  if (sync.status !== 0) process.exit(sync.status ?? 1);
}

const tsc = spawnSync(
  process.execPath,
  [resolve(app, '../../node_modules/typescript/bin/tsc'), '--noEmit'],
  {
    cwd: app,
    stdio: 'inherit',
  },
);
process.exit(tsc.status ?? 1);
