'use client';

import type { WorldSnapshot } from '@factory-board/save-reader';
import { useCallback, useEffect, useRef } from 'react';
import { digestOf } from '@/lib/history';
import { recordPoint } from '@/lib/history-store';
import { useBoard } from '@/state/board';
import { useGameData } from '@/state/game-data';
import type { ParseResponse } from '@/workers/parse-save.worker';

/**
 * Loads `.sav` files and turns them into snapshots.
 *
 * Parsing happens in a Worker so a large save cannot freeze the page. If the
 * Worker cannot be constructed — an unusual browser, a strict CSP — it falls
 * back to the main thread rather than refusing to open the file at all.
 *
 * Several at once are all read: the newest becomes the board, and the rest
 * are written into the history. On a machine without the dev server there is
 * no watcher seeding the autosaves, so dropping the three slots together is
 * how a hosted board gets a series instead of a point
 * ([ADR 36](../../../../docs/adr/0036-the-board-meets-a-strangers-save.md)).
 */

/** Sizes a file the way a person would say it. */
export function megabytes(bytes: number): string {
  return `${(bytes / 1_048_576).toFixed(bytes < 10 * 1_048_576 ? 1 : 0)} MB`;
}

/**
 * What to say when a save will not read.
 *
 * The parser's own message first — it names the version it choked on — then
 * the three reasons a save turns up unreadable in practice, so the reader has
 * something to try before they file a bug.
 */
function explainFailure(file: File, error: unknown): string {
  const reason = error instanceof Error ? error.message : String(error);
  return (
    `${file.name} (${megabytes(file.size)}) could not be read: ${reason} ` +
    'Saves from Update 5 and older are not supported. Modded saves can fail on mod content. ' +
    'Otherwise try another autosave slot.'
  );
}

type Pending = { resolve: (snapshot: WorldSnapshot) => void; reject: (error: Error) => void };

export function useSaveLoader() {
  const { dispatch } = useBoard();
  const { db } = useGameData();
  const workerRef = useRef<Worker | null>(null);
  const pending = useRef(new Map<number, Pending>());
  const nextId = useRef(1);

  useEffect(() => {
    let worker: Worker | null = null;
    const waiting = pending.current;
    try {
      worker = new Worker(new URL('../workers/parse-save.worker.ts', import.meta.url));
      worker.onmessage = (event: MessageEvent<ParseResponse>) => {
        const job = waiting.get(event.data.id);
        if (!job) return;
        waiting.delete(event.data.id);
        if (event.data.ok) job.resolve(event.data.snapshot);
        else job.reject(new Error(event.data.error));
      };
      worker.onerror = () => {
        for (const job of waiting.values()) job.reject(new Error('The save parser crashed.'));
        waiting.clear();
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

  const parse = useCallback(async (file: File): Promise<WorldSnapshot> => {
    const name = file.name.replace(/\.sav$/i, '');
    const buffer = await file.arrayBuffer();
    const worker = workerRef.current;
    if (worker) {
      return new Promise<WorldSnapshot>((resolve, reject) => {
        const id = nextId.current++;
        pending.current.set(id, { resolve, reject });
        // Transfer rather than copy; the buffer is not needed on this side.
        worker.postMessage({ id, name, buffer }, [buffer]);
      });
    }
    const { parseSaveFile } = await import('@factory-board/save-reader');
    return parseSaveFile(name, buffer);
  }, []);

  const loadSaves = useCallback(
    async (files: readonly File[]) => {
      if (files.length === 0) return;
      const label = files.length === 1 ? files[0]!.name : `${files.length} saves`;
      dispatch({
        type: 'parsing',
        fileName: label,
        bytes: files.reduce((sum, file) => sum + file.size, 0),
      });

      const read: { file: File; snapshot: WorldSnapshot }[] = [];
      const failures: string[] = [];
      for (const file of files) {
        try {
          read.push({ file, snapshot: await parse(file) });
        } catch (error) {
          failures.push(explainFailure(file, error));
        }
      }

      if (read.length === 0) {
        dispatch({ type: 'failed', message: failures[0] ?? 'That file could not be read.' });
        return;
      }

      /*
       * Newest by the session's own clock, which is what a series is ordered
       * by; the wall clock is what a person recognises a save by, and files
       * copied about keep neither reliably.
       */
      read.sort((a, b) => b.snapshot.playDurationSeconds - a.snapshot.playDurationSeconds);
      const [newest, ...earlier] = read;
      for (const { file, snapshot } of earlier) {
        void recordPoint(digestOf(db, snapshot, file.name));
      }
      dispatch({
        type: 'loaded',
        snapshot: newest!.snapshot,
        source: { kind: 'file', name: newest!.file.name },
      });
      if (failures.length > 0) {
        dispatch({ type: 'failed', message: failures.join(' ') });
      }
    },
    [db, dispatch, parse],
  );

  const loadSave = useCallback((file: File) => loadSaves([file]), [loadSaves]);

  return { loadSave, loadSaves };
}
