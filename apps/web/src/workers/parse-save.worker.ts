/// <reference lib="webworker" />
import { parseSaveFile } from '@factory-board/save-reader';
import type { WorldSnapshot } from '@factory-board/save-reader';

export interface ParseRequest {
  /** Echoed back, so several files in flight can be told apart. */
  readonly id: number;
  readonly name: string;
  readonly buffer: ArrayBuffer;
}

export type ParseResponse =
  | { readonly id: number; readonly ok: true; readonly snapshot: WorldSnapshot }
  | { readonly id: number; readonly ok: false; readonly error: string };

const worker = self as unknown as DedicatedWorkerGlobalScope;

worker.onmessage = (event: MessageEvent<ParseRequest>) => {
  const { id, name, buffer } = event.data;
  try {
    const snapshot = parseSaveFile(name, buffer);
    worker.postMessage({ id, ok: true, snapshot } satisfies ParseResponse);
  } catch (error) {
    worker.postMessage({
      id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    } satisfies ParseResponse);
  }
};
