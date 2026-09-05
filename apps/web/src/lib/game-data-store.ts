import { parseGameDatabase } from '@factory-board/game-data/schema';
import type { GameDatabase } from '@factory-board/planner';
import { z } from 'zod';

/**
 * Where a recipe book someone dropped on the page is kept.
 *
 * A `Docs.json` is ten megabytes of UTF-16 that takes a second or two to turn
 * into a database, and asking for it on every visit would make the hosted
 * board a two-file chore every time. So the *result* is kept, once, in this
 * browser — about 230 KB — and the page opens on it from then on
 * ([ADR 34](../../../../docs/adr/0034-the-recipe-book-can-arrive-at-runtime.md)).
 *
 * Its own IndexedDB database rather than a second store in the history's: the
 * history is the one thing here that cannot be recovered if it is lost, and a
 * version bump on its database for the sake of something that can be dropped
 * on the page again is not a trade worth making.
 *
 * Every call answers rather than throwing, like the history store. Private
 * browsing, a blocked origin, a full disk: remembering is a convenience, and
 * the board has to work without it.
 */

const DB_NAME = 'factory-board-game-data';
const DB_VERSION = 1;
const STORE = 'databases';
const KEY = 'current';

/**
 * Parsed on the way out, like everything that crosses a boundary. This record
 * outlives releases: a database written by last month's extractor is a
 * stranger to today's schema, and the honest answer to one that no longer
 * validates is "drop the file again", not a board full of `undefined`.
 */
const recordSchema = z.object({
  version: z.literal(1),
  name: z.string().min(1),
  savedAt: z.number().finite(),
  database: z.unknown(),
});

export interface StoredDatabase {
  readonly name: string;
  readonly savedAt: number;
  readonly database: GameDatabase;
}

let opening: Promise<IDBDatabase | null> | null = null;

function open(): Promise<IDBDatabase | null> {
  if (opening) return opening;
  const pending: Promise<IDBDatabase | null> = new Promise<IDBDatabase | null>((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') {
        resolve(null);
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      // Firefox in private mode never settles either handler.
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  }).then((db) => {
    // A refusal is not cached: the next call asks again, in case it was
    // momentary. A success is.
    if (!db) opening = null;
    return db;
  });
  opening = pending;
  return pending;
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

/**
 * The remembered database, or null — including when one was there and no
 * longer reads, in which case it is removed so the next visit does not ask
 * the same question again.
 */
export async function loadStoredDatabase(): Promise<StoredDatabase | null> {
  const found = await run<unknown>('readonly', (store) => store.get(KEY));
  if (found === null || found === undefined) return null;
  const record = recordSchema.safeParse(found);
  if (record.success) {
    try {
      const database = parseGameDatabase(record.data.database);
      return { name: record.data.name, savedAt: record.data.savedAt, database };
    } catch {
      // Written by an extractor this schema has moved on from.
    }
  }
  await forgetStoredDatabase();
  return null;
}

/** Remember a database. Answers whether it was written. */
export async function saveStoredDatabase(record: StoredDatabase): Promise<boolean> {
  const stored: z.infer<typeof recordSchema> = { version: 1, ...record };
  const key = await run('readwrite', (store) => store.put(stored, KEY));
  return key !== null;
}

export async function forgetStoredDatabase(): Promise<void> {
  await run('readwrite', (store) => store.delete(KEY));
}
