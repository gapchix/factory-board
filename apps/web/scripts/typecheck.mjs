#!/usr/bin/env node
/**
 * Type-checks the app.
 *
 * The app inlines a game database, and until the demo existed that had to be
 * the extracted one — generated from a local Satisfactory install and never
 * committed (see docs/adr/0003). Without it `tsc` failed on a missing import,
 * so this skipped itself wherever the game was absent, which meant CI never
 * type-checked the app at all and a type error went unseen until `next build`.
 *
 * There is always a database now: the extracted one where the game is
 * installed, the built-in demo everywhere else (docs/adr/0029). So this always
 * runs, and the sync step below is what guarantees it.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const app = resolve(here, '..');
const database = resolve(app, 'src/generated/game-database.json');

// Sync first, so the database is there whether it is the extracted one or the
// demo. This is the whole reason the check no longer has to skip itself.
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
