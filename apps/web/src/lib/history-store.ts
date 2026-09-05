import { z } from 'zod';
import type { HistoryPoint } from './history';

/**
 * Where a session's saves are kept.
 *
 * IndexedDB rather than `localStorage`, because this is the one thing the board
 * stores that grows without end: a save every few minutes for as long as
 * someone plays. It is also the one thing that cannot be recovered if it is
 * lost — the game keeps three rotating autosave slots, so a moment not written
 * down here is gone within a quarter of an hour.
 *
 * Every call answers rather than throwing. Private browsing, a blocked origin,
 * a full disk: history is a luxury, and the board it belongs to has to work
 * without it.
 */

const DB_NAME = 'factory-board';
const DB_VERSION = 1;
const STORE = 'history';

/**
 * Roughly a week of continuous play at one autosave every five minutes. Past
 * that the oldest go, because a session that long is a chart nobody can read
 * and the recent past is what the questions are about.
 */
const MAX_POINTS = 2000;

/**
 * Records are parsed on the way out, like everything else that crosses a
 * boundary — this store outlives any number of releases, so a point written
 * last month is a stranger to the code reading it.
 *
 * Lenient rather than strict on purpose: a field this version has learned about
 * gets a sensible default rather than throwing the save away. History is the
 * one thing here that cannot be recovered, so the bar for discarding a record
 * is that it is not recognisably a record at all.
 */
const lineSchema = z.object({
  count: z.number().nonnegative().catch(0),
  uptime: z.number().nullable().catch(null),
});

const pointSchema = z.object({
  session: z.string().min(1),
  playSeconds: z.number().finite(),
  savedAt: z.number().nullable().catch(null),
  source: z.string().catch(''),
  buildings: z.number().catch(0),
  machines: z.number().catch(0),
  extractors: z.number().catch(0),
  generators: z.number().catch(0),
  powerMW: z.number().catch(0),
  uptime: z.number().nullable().catch(null),
  milestones: z.number().catch(0),
  phase: z.string().nullable().catch(null),
  delivered: z.record(z.string(), z.number()).catch({}),
  costMultiplier: z.number().positive().catch(1),
  lines: z.record(z.string(), lineSchema).catch({}),
});

type AssertNoMissingKeys<Domain, Shape> =
  Exclude<keyof Domain, keyof Shape> extends never
    ? true
    : { error: 'schema is missing keys'; missing: Exclude<keyof Domain, keyof Shape> };

const _pointKeys: AssertNoMissingKeys<HistoryPoint, z.infer<typeof pointSchema>> = true;
void _pointKeys;

const parsePoints = (records: unknown[]): HistoryPoint[] => {
  const points: HistoryPoint[] = [];
  for (const record of records) {
    const parsed = pointSchema.safeParse(record);
    if (parsed.success) points.push(parsed.data);
  }
  return points;
};

let opening: Promise<IDBDatabase | null> | null = null;

function open(): Promise<IDBDatabase | null> {
  if (opening) return opening;
  opening = new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') {
        resolve(null);
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: ['session', 'playSeconds'] });
          store.createIndex('session', 'session', { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      // Firefox in private mode never settles either handler.
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return opening;
}

function run<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> {
  return open().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) {
          resolve(null);
          return;
        }
        try {
          const transaction = db.transaction(STORE, mode);
          const request = work(transaction.objectStore(STORE));
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => resolve(null);
          transaction.onabort = () => resolve(null);
        } catch {
          resolve(null);
        }
      }),
  );
}

/** Every point of a session, oldest first. */
export async function pointsFor(session: string): Promise<HistoryPoint[]> {
  const found = await run<unknown[]>('readonly', (store) =>
    store.index('session').getAll(IDBKeyRange.only(session)),
  );
  return parsePoints(found ?? []).sort((a, b) => a.playSeconds - b.playSeconds);
}

/** Sessions with something recorded, most recently played first. */
export async function sessions(): Promise<{ session: string; points: number; last: number }[]> {
  const all = await run<unknown[]>('readonly', (store) => store.getAll());
  const found = new Map<string, { session: string; points: number; last: number }>();
  for (const point of parsePoints(all ?? [])) {
    const entry = found.get(point.session) ?? { session: point.session, points: 0, last: 0 };
    entry.points += 1;
    entry.last = Math.max(entry.last, point.savedAt ?? 0);
    found.set(point.session, entry);
  }
  return [...found.values()].sort((a, b) => b.last - a.last);
}

/**
 * Write a save down, replacing whatever was recorded at the same moment of the
 * same session — reloading a save should leave one point, not two.
 *
 * Returns whether anything was written, so the page can say plainly when
 * history is unavailable rather than pretending to be recording.
 */
export async function recordPoint(point: HistoryPoint): Promise<boolean> {
  const written = await run('readwrite', (store) => store.put(point));
  if (written === null) return false;
  await prune(point.session);
  return true;
}

async function prune(session: string): Promise<void> {
  const count = await run<number>('readonly', (store) =>
    store.index('session').count(IDBKeyRange.only(session)),
  );
  if (count === null || count <= MAX_POINTS) return;
  const points = await pointsFor(session);
  for (const point of points.slice(0, count - MAX_POINTS)) {
    await run('readwrite', (store) => store.delete([point.session, point.playSeconds]));
  }
}

/** Throw a session's history away. It is the player's data; they can burn it. */
export async function forgetSession(session: string): Promise<void> {
  const points = await pointsFor(session);
  for (const point of points) {
    await run('readwrite', (store) => store.delete([point.session, point.playSeconds]));
  }
}

/** Whether this browser will keep anything at all, so a page can say so plainly. */
export async function isAvailable(): Promise<boolean> {
  return (await open()) !== null;
}
