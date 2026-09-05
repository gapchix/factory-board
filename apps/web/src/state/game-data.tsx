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
import type { ExtractResponse } from '@/workers/extract-docs.worker';

/**
 * Where the recipe book the page is running on came from.
 *
 * `baked` is what the build put in — the maintainer's extract on a machine
 * with the game, the hand-written demo everywhere else, a hosted copy
 * included. `user` is a `Docs.json` someone dropped on the page, remembered
 * in this browser
 * ([ADR 34](../../../../docs/adr/0034-the-recipe-book-can-arrive-at-runtime.md)).
 *
 * Kept as a fact about provenance rather than read off the database, because
 * the database cannot say: the demo carries `sourceBuildId: 0`, and so does a
 * real extract from Epic or from a browser.
 */
export type GameDataSource =
  | { readonly kind: 'baked'; readonly name: BakedSource }
  | { readonly kind: 'user'; readonly name: string; readonly savedAt: number };

export type GameDataStatus =
  | { readonly kind: 'idle' }
  | { readonly kind: 'extracting'; readonly fileName: string }
  | { readonly kind: 'failed'; readonly message: string };

interface GameDataValue {
  readonly db: GameDatabase;
  readonly source: GameDataSource;
  readonly status: GameDataStatus;
  /** Turn a dropped `Docs.json` into the database the page runs on, and remember it. */
  readonly loadDocs: (file: File) => Promise<void>;
  /** Back to whatever the build put in. */
  readonly forget: () => Promise<void>;
}

const BAKED: GameDataSource = { kind: 'baked', name: bakedSource };

const GameDataContext = createContext<GameDataValue | null>(null);

/** Sizes a file the way a person would say it. */
function megabytes(bytes: number): string {
  return `${(bytes / 1_048_576).toFixed(bytes < 10 * 1_048_576 ? 1 : 0)} MB`;
}

export function GameDataProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<GameDatabase>(bakedDatabase);
  const [source, setSource] = useState<GameDataSource>(BAKED);
  const [status, setStatus] = useState<GameDataStatus>({ kind: 'idle' });
  const workerRef = useRef<Worker | null>(null);
  const pending = useRef<((response: ExtractResponse) => void) | null>(null);

  /*
   * The worker is made once and answers one extraction at a time. If it cannot
   * be constructed — an unusual browser, a strict CSP — the extraction runs on
   * the main thread instead, the page stalls for a second or two, and the file
   * is still read. Refusing it would be worse.
   */
  useEffect(() => {
    let worker: Worker | null = null;
    try {
      worker = new Worker(new URL('../workers/extract-docs.worker.ts', import.meta.url));
      worker.onmessage = (event: MessageEvent<ExtractResponse>) => {
        pending.current?.(event.data);
        pending.current = null;
      };
      worker.onerror = () => {
        pending.current?.({ ok: false, error: 'The extractor crashed on that file.' });
        pending.current = null;
      };
      workerRef.current = worker;
    } catch {
      workerRef.current = null;
    }
    return () => {
      worker?.terminate();
      workerRef.current = null;
    };
  }, []);

  /*
   * Restore after mount, never during render: IndexedDB does not exist while
   * the static export is being prerendered. Until this settles the page runs
   * on the baked book, which is a correct thing to run on — just not
   * necessarily the one this browser was left holding.
   */
  useEffect(() => {
    let cancelled = false;
    void loadStoredDatabase().then((stored) => {
      if (cancelled || !stored) return;
      setDb(stored.database);
      setSource({ kind: 'user', name: stored.name, savedAt: stored.savedAt });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const extract = useCallback(async (buffer: ArrayBuffer): Promise<ExtractResponse> => {
    const worker = workerRef.current;
    if (worker && !pending.current) {
      return new Promise<ExtractResponse>((resolve) => {
        pending.current = resolve;
        // Transfer rather than copy; the buffer is not needed on this side.
        worker.postMessage({ name: 'docs', buffer }, [buffer]);
      });
    }
    const { extractDocs } = await import('@/workers/extract-docs.worker');
    return extractDocs(buffer);
  }, []);

  const loadDocs = useCallback(
    async (file: File) => {
      setStatus({ kind: 'extracting', fileName: file.name });
      try {
        const buffer = await file.arrayBuffer();
        const size = buffer.byteLength;
        const response = await extract(buffer);
        if (!response.ok) {
          setStatus({
            kind: 'failed',
            message: `${file.name} (${megabytes(size)}) could not be read as a recipe book: ${response.error}`,
          });
          return;
        }
        const record = { name: file.name, savedAt: Date.now(), database: response.database };
        setDb(response.database);
        setSource({ kind: 'user', name: record.name, savedAt: record.savedAt });
        setStatus({ kind: 'idle' });
        // Remembered best-effort; the page already has it either way.
        void saveStoredDatabase(record);
      } catch (error) {
        setStatus({
          kind: 'failed',
          message: error instanceof Error ? error.message : 'That file could not be read.',
        });
      }
    },
    [extract],
  );

  const forget = useCallback(async () => {
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
