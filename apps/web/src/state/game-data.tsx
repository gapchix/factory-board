'use client';

import type { GameDatabase } from '@factory-board/planner';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { bakedDatabase, bakedSource, type BakedSource } from '@/lib/game-database';
import {
  forgetStoredDatabase,
  loadStoredDatabase,
  saveStoredDatabase,
} from '@/lib/game-data-store';
import type { ExtractResponse } from '@/lib/extract-docs';
import { megabytes } from '@/lib/format';
import { track } from '@/lib/track';

/**
 * Where the recipe book the page is running on came from.
 *
 * `baked` is what the build put in — the maintainer's extract on a machine
 * with the game, the hand-written demo everywhere else, a hosted copy
 * included. `user` is a `Docs.json` someone dropped on the page, remembered
 * in this browser where the browser allows it
 * ([ADR 34](../../../../docs/adr/0034-the-recipe-book-can-arrive-at-runtime.md)).
 *
 * Kept as a fact about provenance rather than read off the database, because
 * the database cannot say: the demo carries `sourceBuildId: 0`, and so does a
 * real extract from Epic or from a browser.
 */
export type GameDataSource =
  | { readonly kind: 'baked'; readonly name: BakedSource }
  | {
      readonly kind: 'user';
      readonly name: string;
      readonly savedAt: number;
      /** False when IndexedDB refused the write: the book works until the tab closes. */
      readonly remembered: boolean;
    };

export type GameDataStatus =
  | { readonly kind: 'idle' }
  | { readonly kind: 'extracting'; readonly fileName: string }
  | { readonly kind: 'failed'; readonly message: string };

interface GameDataValue {
  readonly db: GameDatabase;
  readonly source: GameDataSource;
  readonly status: GameDataStatus;
  /**
   * Turn a dropped `Docs.json` into the database the page runs on, and
   * remember it. Resolves to the new database, or null when the file was
   * refused, or when the result was overtaken by a Forget or another drop.
   */
  readonly loadDocs: (file: File) => Promise<GameDatabase | null>;
  /** Back to whatever the build put in. */
  readonly forget: () => Promise<void>;
}

const BAKED: GameDataSource = { kind: 'baked', name: bakedSource };

/**
 * Nothing legitimate is this big. The game's own file is about ten megabytes
 * and grows by a few hundred kilobytes a patch; past this the file is not a
 * recipe book, and decoding it as one is a gigabyte of string.
 */
const MAX_BOOK_BYTES = 100 * 1_048_576;

/** How long an extraction may take before the worker is assumed dead. */
const EXTRACT_TIMEOUT_MS = 60_000;

const GameDataContext = createContext<GameDataValue | null>(null);

/**
 * One extraction, in one Worker made for it.
 *
 * A Worker per file rather than one for the page: a request that is never
 * answered — a worker script that failed to load after a redeploy, a worker
 * the browser killed for memory — used to leave a single shared slot occupied
 * for the life of the tab, with every later book routed to the main thread.
 * Making one, using it, and terminating it leaves nothing to get stuck.
 * Rejects when the worker cannot be made or does not answer; the caller then
 * runs the same function on the main thread.
 */
function extractInWorker(buffer: ArrayBuffer): Promise<ExtractResponse> {
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('../workers/extract-docs.worker.ts', import.meta.url));
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));
      return;
    }
    const timer = setTimeout(() => {
      worker.terminate();
      reject(new Error('The extractor did not answer in time.'));
    }, EXTRACT_TIMEOUT_MS);
    const settle = () => {
      clearTimeout(timer);
      worker.terminate();
    };
    worker.onmessage = (event: MessageEvent<ExtractResponse>) => {
      settle();
      resolve(event.data);
    };
    worker.onerror = () => {
      settle();
      reject(new Error('The extractor could not start.'));
    };
    // Transfer rather than copy; the buffer is not needed on this side.
    worker.postMessage({ buffer }, [buffer]);
  });
}

export function GameDataProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<GameDatabase>(bakedDatabase);
  const [source, setSource] = useState<GameDataSource>(BAKED);
  const [status, setStatus] = useState<GameDataStatus>({ kind: 'idle' });
  /*
   * Which user action is current. Every drop and every Forget bumps it, and a
   * result — the restore from IndexedDB, an extraction that was in flight —
   * is applied only if nothing happened since it started. Without this a slow
   * restore reverted a book that had just been dropped, and a Forget during
   * an extraction was quietly undone when the extraction finished.
   */
  const generation = useRef(0);
  const busy = useRef(false);

  /*
   * Restore after mount, never during render: IndexedDB does not exist while
   * the static export is being prerendered. Until this settles the page runs
   * on the baked book, which is a correct thing to run on — just not
   * necessarily the one this browser was left holding.
   */
  useEffect(() => {
    let cancelled = false;
    void loadStoredDatabase().then((stored) => {
      if (cancelled || !stored || generation.current !== 0) return;
      setDb(stored.database);
      setSource({ kind: 'user', name: stored.name, savedAt: stored.savedAt, remembered: true });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const loadDocs = useCallback(async (file: File): Promise<GameDatabase | null> => {
    // One at a time. A second book while one is being read is dropped on the
    // floor rather than raced against the first; the notice says one is being read.
    if (busy.current) return null;
    if (file.size > MAX_BOOK_BYTES) {
      setStatus({
        kind: 'failed',
        message:
          `${file.name} is ${megabytes(file.size)}, which is not a recipe book — ` +
          'the game’s Docs/en-US.json is about 10 MB.',
      });
      return null;
    }

    const mine = ++generation.current;
    busy.current = true;
    setStatus({ kind: 'extracting', fileName: file.name });
    try {
      const buffer = await file.arrayBuffer();
      const size = buffer.byteLength;
      let response: ExtractResponse;
      try {
        response = await extractInWorker(buffer);
      } catch {
        /*
         * No Worker — an unusual browser, a strict CSP, a worker script that
         * did not load. The page stalls for a second or two and the file is
         * still read; refusing it would be worse. The buffer may already have
         * been transferred, so it is read again.
         */
        const { extractDocs } = await import('@/lib/extract-docs');
        response = extractDocs(await file.arrayBuffer());
      }
      // Overtaken by a Forget or a later drop: this result is nobody's.
      if (mine !== generation.current) return null;
      if (!response.ok) {
        setStatus({
          kind: 'failed',
          message: `${file.name} (${megabytes(size)}) could not be read as a recipe book: ${response.error}`,
        });
        return null;
      }
      const record = { name: file.name, savedAt: Date.now(), database: response.database };
      const remembered = await saveStoredDatabase(record);
      if (mine !== generation.current) return null;
      setDb(response.database);
      setSource({ kind: 'user', name: record.name, savedAt: record.savedAt, remembered });
      setStatus({ kind: 'idle' });
      track('book_loaded');
      return response.database;
    } catch (error) {
      if (mine === generation.current) {
        setStatus({
          kind: 'failed',
          message: error instanceof Error ? error.message : 'That file could not be read.',
        });
      }
      return null;
    } finally {
      busy.current = false;
    }
  }, []);

  const forget = useCallback(async () => {
    generation.current += 1;
    await forgetStoredDatabase();
    setDb(bakedDatabase);
    setSource(BAKED);
    setStatus({ kind: 'idle' });
  }, []);

  const value = useMemo<GameDataValue>(
    () => ({ db, source, status, loadDocs, forget }),
    [db, source, status, loadDocs, forget],
  );

  return <GameDataContext.Provider value={value}>{children}</GameDataContext.Provider>;
}

export function useGameData(): GameDataValue {
  const context = useContext(GameDataContext);
  if (!context) throw new Error('useGameData must be used inside <GameDataProvider>');
  return context;
}
