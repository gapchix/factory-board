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
const snapshot = resolve(app, 'src/generated/default-snapshot.json');

/*
 * Sync both first, so they are there whether they are the extracted database
 * and a real save or the demo. This is the whole reason the check no longer has
 * to skip itself — and both matter: the app imports each of them statically, so
 * a missing snapshot fails `tsc` exactly as a missing database does. That is
 * how this first went red in CI, where neither has ever existed.
 */
for (const [file, script] of [
  [database, 'sync-game-data.mjs'],
  [snapshot, 'sync-save.mjs'],
]) {
  if (existsSync(file)) continue;
  const sync = spawnSync(process.execPath, [resolve(here, script)], { stdio: 'inherit' });
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
