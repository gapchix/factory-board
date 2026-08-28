#!/usr/bin/env node
/**
 * Bakes a default save snapshot into the app at dev/build time.
 *
 * The app is a static export with no server, so the browser cannot open a path
 * from an environment variable — nothing in the page is allowed to read your
 * disk. Instead this runs in Node before Next does, parses the save once, and
 * writes the *result* into the bundle. `npm run dev` also watches the file and
 * re-runs this, so the dashboard follows your autosaves while you play.
 *
 * Configure with either variable in `apps/web/.env.local`:
 *
 *   SATISFACTORY_SAVE=C:/…/SaveGames/76561198.../polska.sav   # one exact save
 *   SATISFACTORY_SAVES_DIR=C:/…/SaveGames/76561198...         # newest .sav wins
 *
 * With neither set it auto-detects the usual location. With no save found at
 * all it writes an "absent" marker and the app simply asks you to drop one in.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outFile = resolve(here, '../src/generated/default-snapshot.json');

for (const envFile of ['.env.local', '.env']) {
  try {
    process.loadEnvFile(resolve(here, '..', envFile));
  } catch {
    // Missing or unreadable env file is the normal case.
  }
}

/**
 * Every `.sav` under a directory, newest first, one level of subfolders deep.
 *
 * The game keeps three rotating autosave slots plus whatever you saved by hand,
 * so this is already a time series — it is just one nobody was reading. History
 * used to start empty and fill only while the page was open, which meant a
 * feature about how a session is going had one point in it on first open.
 */
function allSaves(dir) {
  if (!existsSync(dir)) return [];
  const candidates = [];
  const visit = (path, depth) => {
    let entries;
    try {
      entries = readdirSync(path, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(path, entry.name);
      if (entry.isDirectory() && depth > 0) visit(full, depth - 1);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith('.sav')) {
        // ServerManager is bookkeeping, not a world.
        if (entry.name.startsWith('ServerManager')) continue;
        candidates.push({ full, mtime: statSync(full).mtimeMs });
      }
    }
  };
  visit(dir, 1);
  candidates.sort((a, b) => b.mtime - a.mtime);
  return candidates;
}

/** Newest `.sav` under a directory, or null. */
function newestSave(dir) {
  return allSaves(dir)[0]?.full ?? null;
}

/**
 * How many earlier saves are read to seed the history.
 *
 * Each one is a full parse, and this runs before `next dev` every time. Three
 * autosave slots plus a manual save is what a session actually holds, so past
 * about this many the extra seconds buy nothing.
 */
const SEED_LIMIT = 6;

/**
 * A save reduced to what a history digest reads, and nothing else.
 *
 * The digest itself is computed in the browser by `lib/history`, so the rule
 * about what a point contains stays in one place ([ADR 16]). This only has to
 * carry the fields that rule looks at — which is why `placements` arrives as a
 * list of bare roles: the digest counts them and reads nothing else off them,
 * and shipping 400 real placements per save would put back the weight ADR 16
 * took out.
 */
function forHistory(snapshot) {
  return {
    sessionName: snapshot.sessionName,
    playDurationSeconds: snapshot.playDurationSeconds,
    savedAt: snapshot.savedAt,
    lines: snapshot.lines,
    milestones: snapshot.milestones,
    phase: snapshot.phase,
    placements: snapshot.placements.map((placement) =>
      placement.role === undefined ? {} : { role: placement.role },
    ),
  };
}

function defaultSavesDir() {
  const local = process.env.LOCALAPPDATA;
  if (local) return join(local, 'FactoryGame', 'Saved', 'SaveGames');
  // Proton/Wine layout on Linux and macOS.
  return join(
    homedir(),
    '.steam',
    'steam',
    'steamapps',
    'compatdata',
    '526870',
    'pfx',
    'drive_c',
    'users',
    'steamuser',
    'AppData',
    'Local',
    'FactoryGame',
    'Saved',
    'SaveGames',
  );
}

function locateSave() {
  const explicit = process.env.SATISFACTORY_SAVE;
  if (explicit) {
    if (!existsSync(explicit)) {
      console.warn(`  SATISFACTORY_SAVE points at a file that does not exist:\n    ${explicit}`);
      return null;
    }
    return explicit;
  }
  const dir = process.env.SATISFACTORY_SAVES_DIR ?? defaultSavesDir();
  return newestSave(dir);
}

function write(payload) {
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, JSON.stringify(payload));
}

export async function syncSave({ quiet = false } = {}) {
  const log = (message) => {
    if (!quiet) console.log(message);
  };

  // Asked for outright, so the real save is not even looked for.
  const forced = process.env.FACTORY_BOARD_DEMO === '1';
  const path = forced ? null : locateSave();
  if (!path) {
    /*
     * A demo base rather than an empty page. Every view needs a save to say
     * anything at all, so without one the app could only ask for a file that
     * someone who does not own the game cannot produce — see `demo-save` in the
     * game-data package for what it holds and why it is deliberately broken in
     * two interesting ways.
     */
    const { demoSnapshot } = await import('@factory-board/game-data');
    write({
      present: true,
      source: 'demo',
      loadedAt: new Date().toISOString(),
      snapshot: demoSnapshot(),
      earlier: [],
    });
    log(
      forced
        ? 'default save: the built-in demo base, because FACTORY_BOARD_DEMO=1'
        : 'default save: none found, using the built-in demo base',
    );
    return null;
  }

  try {
    // Imported lazily so a missing package build reports itself here, with a
    // hint, rather than as a module-load crash before we can explain.
    const { parseSaveFile } = await import('@factory-board/save-reader');
    const name = path.split(/[\\/]/).pop() ?? 'save';
    const snapshot = parseSaveFile(name.replace(/\.sav$/i, ''), toArrayBuffer(readFileSync(path)));
    /*
     * The rest of this session's saves, oldest first, so the history has a
     * series in it before the page has been open for an hour. Only this
     * session's: two worlds in one folder are two histories.
     */
    const earlier = [];
    const dir = process.env.SATISFACTORY_SAVES_DIR ?? defaultSavesDir();
    for (const candidate of allSaves(dir).slice(0, SEED_LIMIT + 1)) {
      if (candidate.full === path) continue;
      try {
        const other = candidate.full.split(/[\\/]/).pop() ?? 'save';
        const parsed = parseSaveFile(
          other.replace(/.sav$/i, ''),
          toArrayBuffer(readFileSync(candidate.full)),
        );
        if (parsed.sessionName !== snapshot.sessionName) continue;
        earlier.push({ source: other, snapshot: forHistory(parsed) });
      } catch {
        // A half-written autosave is normal while the game is running.
      }
    }
    earlier.reverse();

    write({
      present: true,
      source: name,
      loadedAt: new Date().toISOString(),
      snapshot,
      earlier,
    });
    log(
      `default save: ${name} — ${snapshot.sessionName}, ` +
        `${Object.keys(snapshot.lines).length} lines, ${snapshot.objectCount} objects` +
        (earlier.length > 0 ? `, ${earlier.length} earlier saves for history` : ''),
    );
    return snapshot;
  } catch (error) {
    write({ present: false });
    console.warn(
      `  could not read ${path}\n    ${error instanceof Error ? error.message : error}\n` +
        '    (if this mentions a missing package, run `npm run typecheck` at the repo root first)',
    );
    return null;
  }
}

function toArrayBuffer(buffer) {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

export { locateSave };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await syncSave();
}
