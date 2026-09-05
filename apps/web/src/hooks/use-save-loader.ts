'use client';

import type { WorldSnapshot } from '@factory-board/save-reader';
import { useCallback } from 'react';
import { megabytes } from '@/lib/format';
import { toDigestSource } from '@/lib/history';
import { useBoard } from '@/state/board';
import type { ParseResponse } from '@/workers/parse-save.worker';

/**
 * Loads `.sav` files and turns them into snapshots.
 *
 * Parsing happens in a Worker so a large save cannot freeze the page — one
 * Worker per file, made for it and terminated after it, so a worker that
 * fails to load or is killed by the browser leaves nothing stuck behind it.
 * If a Worker cannot be made at all, the file is parsed on the main thread
 * rather than refused.
 *
 * Several at once are all read: the newest becomes the board, and the rest
 * go to the board as well, to be written into the history against whatever
 * recipe book is current — so a book dropped alongside them is the book they
 * are digested with, and a book dropped later re-digests them like the
 * newest. On a machine without the dev server there is no watcher seeding
 * the autosaves, so dropping the three slots together is how a hosted board
 * gets a series instead of a point
 * ([ADR 36](../../../../docs/adr/0036-the-board-meets-a-strangers-save.md)).
 */

/**
 * Past this, reading the file in a browser tab is a memory question with no
 * good answer: the parser inflates every chunk and holds the whole world as
 * objects, several times the size of the file. The biggest saves seen in the
 * wild are well under this.
 */
const MAX_SAVE_BYTES = 250 * 1_048_576;

/** How long a parse may take before the worker is assumed dead. */
const PARSE_TIMEOUT_MS = 180_000;

/** The worker could not start at all, as opposed to the parser refusing the file. */
class WorkerUnavailable extends Error {
  constructor() {
    super('worker unavailable');
    this.name = 'WorkerUnavailable';
  }
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

/** One parse, in one Worker made for it. Rejects if the worker cannot be made or does not answer. */
function parseInWorker(name: string, buffer: ArrayBuffer): Promise<WorldSnapshot> {
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('../workers/parse-save.worker.ts', import.meta.url));
    } catch {
      reject(new WorkerUnavailable());
      return;
    }
    const timer = setTimeout(() => {
      worker.terminate();
      reject(new Error('The save parser did not answer in time.'));
    }, PARSE_TIMEOUT_MS);
    const settle = () => {
      clearTimeout(timer);
      worker.terminate();
    };
    worker.onmessage = (event: MessageEvent<ParseResponse>) => {
      settle();
      if (event.data.ok) resolve(event.data.snapshot);
      else reject(new Error(event.data.error));
    };
    worker.onerror = () => {
      settle();
      reject(new WorkerUnavailable());
    };
    // Transfer rather than copy; the buffer is not needed on this side.
    worker.postMessage({ id: 1, name, buffer }, [buffer]);
  });
}

async function parse(file: File): Promise<WorldSnapshot> {
  const name = file.name.replace(/\.sav$/i, '');
  try {
    return await parseInWorker(name, await file.arrayBuffer());
  } catch (error) {
    // The parser refused the file, or the worker timed out: a real answer.
    if (!(error instanceof WorkerUnavailable)) throw error;
    // No Worker to be had — an unusual browser, a strict CSP, a worker script
    // that did not load. The main thread, then: the page stalls, the file is read.
    const { parseSaveFile } = await import('@factory-board/save-reader');
    return parseSaveFile(name, await file.arrayBuffer());
  }
}

export function useSaveLoader() {
  const { dispatch } = useBoard();

  const loadSaves = useCallback(
    async (files: readonly File[]) => {
      if (files.length === 0) return;
      const tooBig = files.find((file) => file.size > MAX_SAVE_BYTES);
      if (tooBig) {
        dispatch({
          type: 'failed',
          message:
            `${tooBig.name} is ${megabytes(tooBig.size)}, more than a browser tab can hold as a ` +
            'parsed world. If it really is a Satisfactory save, please report it with the size.',
        });
        return;
      }

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
      dispatch({
        type: 'loaded',
        snapshot: newest!.snapshot,
        source: { kind: 'file', name: newest!.file.name },
        earlier: earlier.map(({ file, snapshot }) => ({
          source: file.name,
          snapshot: toDigestSource(snapshot),
        })),
      });
      if (failures.length > 0) {
        dispatch({ type: 'failed', message: failures.join(' ') });
      }
    },
    [dispatch],
  );

  const loadSave = useCallback((file: File) => loadSaves([file]), [loadSaves]);

  return { loadSave, loadSaves };
}
