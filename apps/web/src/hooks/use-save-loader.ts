'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useBoard } from '@/state/board';
import type { ParseResponse } from '@/workers/parse-save.worker';

/**
 * Loads a `.sav` and turns it into a snapshot.
 *
 * Parsing happens in a Worker so a large save cannot freeze the page. If the
 * Worker cannot be constructed — an unusual browser, a strict CSP — it falls
 * back to the main thread rather than refusing to open the file at all.
 */
export function useSaveLoader() {
  const { dispatch } = useBoard();
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    let worker: Worker | null = null;
    try {
      worker = new Worker(new URL('../workers/parse-save.worker.ts', import.meta.url));
      worker.onmessage = (event: MessageEvent<ParseResponse>) => {
        if (event.data.ok) dispatch({ type: 'loaded', snapshot: event.data.snapshot });
        else dispatch({ type: 'failed', message: event.data.error });
      };
      worker.onerror = () => dispatch({ type: 'failed', message: 'The save parser crashed.' });
      workerRef.current = worker;
    } catch {
      workerRef.current = null;
    }
    return () => {
      worker?.terminate();
      workerRef.current = null;
    };
  }, [dispatch]);

  return useCallback(
    async (file: File) => {
      dispatch({ type: 'parsing', fileName: file.name });
      const name = file.name.replace(/\.sav$/i, '');
      try {
        const buffer = await file.arrayBuffer();
        const worker = workerRef.current;
        if (worker) {
          // Transfer rather than copy; the buffer is not needed on this side.
          worker.postMessage({ name, buffer }, [buffer]);
          return;
        }
        const { parseSaveFile } = await import('@factory-board/save-reader');
        dispatch({ type: 'loaded', snapshot: parseSaveFile(name, buffer) });
      } catch (error) {
        dispatch({
          type: 'failed',
          message: error instanceof Error ? error.message : 'That file could not be read.',
        });
      }
    },
    [dispatch],
  );
}
