/// <reference lib="webworker" />
import { extractDocs, type ExtractResponse } from '@/lib/extract-docs';

/**
 * Turns a dropped `Docs.json` into a database, off the main thread.
 *
 * The file is ten megabytes of UTF-16 and the extraction walks every class in
 * it; that is a second or two of work, and a page that freezes for it reads as
 * broken. Same arrangement as `parse-save.worker.ts`.
 *
 * Only ever loaded through `new Worker(...)`. The guard below is what stops
 * this handler from being installed on a window if that ever changes: the
 * main-thread fallback lives in `lib/extract-docs.ts` and imports nothing
 * from here.
 */
export interface ExtractRequest {
  readonly buffer: ArrayBuffer;
}

if (typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope) {
  const worker = self as unknown as DedicatedWorkerGlobalScope;
  worker.onmessage = (event: MessageEvent<ExtractRequest>) => {
    const buffer = event.data?.buffer;
    const response: ExtractResponse =
      buffer instanceof ArrayBuffer
        ? extractDocs(buffer)
        : { ok: false, error: 'The extractor was sent something that is not a file.' };
    worker.postMessage(response);
  };
}
