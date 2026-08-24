/// <reference lib="webworker" />
import { parseSaveFile } from '@factory-board/save-reader';
import type { WorldSnapshot } from '@factory-board/save-reader';

export interface ParseRequest {
  readonly name: string;
  readonly buffer: ArrayBuffer;
}

export type ParseResponse =
  | { readonly ok: true; readonly snapshot: WorldSnapshot }
  | { readonly ok: false; readonly error: string };

const worker = self as unknown as DedicatedWorkerGlobalScope;

worker.onmessage = (event: MessageEvent<ParseRequest>) => {
  try {
    const snapshot = parseSaveFile(event.data.name, event.data.buffer);
    worker.postMessage({ ok: true, snapshot } satisfies ParseResponse);
  } catch (error) {
    worker.postMessage({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    } satisfies ParseResponse);
  }
};
