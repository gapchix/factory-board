#!/usr/bin/env node
/**
 * Reads every save in a folder through the save reader and reports how each
 * one went: how long, how big, what it contained — or what it threw.
 *
 * The reader was written against one base. This is how it meets others
 * before strangers do: point it at a folder of saves from other players,
 * other game versions, other mods, and read the table
 * ([ADR 36](../docs/adr/0036-the-board-meets-a-strangers-save.md)).
 *
 *   node scripts/check-saves.mjs                 # the game's own SaveGames folder
 *   node scripts/check-saves.mjs path/to/saves   # any folder, one level deep
 *
 * Needs the packages built: `npx tsc --build` at the repository root.
 * Nothing is written anywhere.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';

const { parseSaveFile } = await import('@factory-board/save-reader');

function defaultDir() {
  const local = process.env.LOCALAPPDATA;
  if (local) return join(local, 'FactoryGame', 'Saved', 'SaveGames');
  return join(
    homedir(),
    '.steam/steam/steamapps/compatdata/526870/pfx/drive_c/users/steamuser/AppData/Local/FactoryGame/Saved/SaveGames',
  );
}

function saves(dir, depth = 1) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory() && depth > 0) out.push(...saves(full, depth - 1));
    else if (
      entry.isFile() &&
      /\.sav$/i.test(entry.name) &&
      !entry.name.startsWith('ServerManager')
    ) {
      out.push(full);
    }
  }
  return out.sort();
}

const dir = resolve(process.argv[2] ?? defaultDir());
const files = saves(dir);
if (files.length === 0) {
  console.error(`no .sav files under ${dir}`);
  process.exit(1);
}

const rows = [];
for (const file of files) {
  const bytes = readFileSync(file);
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const name = file.split(/[\\/]/).pop();
  const started = performance.now();
  try {
    const snapshot = parseSaveFile(name.replace(/\.sav$/i, ''), buffer);
    rows.push({
      file: name,
      mb: (bytes.length / 1_048_576).toFixed(1),
      ms: Math.round(performance.now() - started),
      session: snapshot.sessionName,
      build: snapshot.saveBuildVersion,
      objects: snapshot.objectCount,
      lines: Object.keys(snapshot.lines).length,
      placements: snapshot.placements.length,
      paths: snapshot.paths.length,
      phase: snapshot.phase?.target?.replace(/^GP_Project_Assembly_/, '') ?? '-',
      x: snapshot.phase?.costMultiplier ?? 1,
      modded: snapshot.modded ? 'yes' : 'no',
      result: 'ok',
    });
  } catch (error) {
    rows.push({
      file: name,
      mb: (bytes.length / 1_048_576).toFixed(1),
      ms: Math.round(performance.now() - started),
      result: `THREW: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

console.table(rows);
const failed = rows.filter((row) => row.result !== 'ok').length;
console.log(`${rows.length} saves, ${failed} failed`);
