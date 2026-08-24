#!/usr/bin/env node
/**
 * `next dev` plus a watcher on the configured save file.
 *
 * Every time the game autosaves, the snapshot is re-parsed into
 * `src/generated/default-snapshot.json`. Next sees the file change and hot
 * reloads, so the dashboard tracks the factory while you play, without a server
 * and without re-uploading anything.
 */
import { spawn } from 'node:child_process';
import { watch } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { locateSave, syncSave } from './sync-save.mjs';

const here = dirname(fileURLToPath(import.meta.url));

await syncSave();

const savePath = locateSave();
if (savePath) {
  // Watch the directory, not the file: the game writes a new file and swaps it,
  // which drops a watch bound to the original inode.
  const dir = dirname(savePath);
  let timer = null;
  try {
    watch(dir, { persistent: false }, (_event, filename) => {
      if (!filename || !String(filename).toLowerCase().endsWith('.sav')) return;
      // Autosaves land as several write events; settle before re-parsing.
      clearTimeout(timer);
      timer = setTimeout(() => void syncSave({ quiet: false }), 750);
    });
    console.log(`watching ${dir} for autosaves`);
  } catch (error) {
    console.warn(`  could not watch ${dir}: ${error instanceof Error ? error.message : error}`);
  }
}

// Resolve Next's own bin and run it with this Node, rather than going through
// npx and a shell — no PATH lookup, no shell quoting, no deprecation warning.
const require = createRequire(import.meta.url);
const nextBin = require.resolve('next/dist/bin/next');

const next = spawn(process.execPath, [nextBin, 'dev', ...process.argv.slice(2)], {
  cwd: resolve(here, '..'),
  stdio: 'inherit',
});
next.on('exit', (code) => process.exit(code ?? 0));
