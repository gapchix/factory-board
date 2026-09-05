/// <reference lib="webworker" />
import {
  decodeDocs,
  extractDatabase,
  parseGameDatabase,
  type ExtractionReport,
} from '@factory-board/game-data/browser';
import type { GameDatabase } from '@factory-board/planner';

/**
 * Turns a dropped `Docs.json` into a database, off the main thread.
 *
 * The file is ten megabytes of UTF-16 and the extraction walks every class in
 * it; that is a second or two of work, and a page that freezes for it reads as
 * broken. Same arrangement as `parse-save.worker.ts`.
 */
export interface ExtractRequest {
  readonly name: string;
  readonly buffer: ArrayBuffer;
}

export type ExtractResponse =
  | {
      readonly ok: true;
      readonly database: GameDatabase;
      readonly counts: ExtractionReport['counts'];
    }
  | { readonly ok: false; readonly error: string };

export function extractDocs(buffer: ArrayBuffer): ExtractResponse {
  try {
    const docs = decodeDocs(buffer);
    /*
     * No Steam manifest to read a build id from in a browser, so it is 0 — the
     * same as an Epic install's. It is display-only metadata, and nothing may
     * read 0 as "the demo": that is what the source on the provider is for.
     */
    const { database, counts } = extractDatabase(docs, { sourceBuildId: 0 });
    parseGameDatabase(database);
    if (counts.recipes === 0) {
      return {
        ok: false,
        error: 'That JSON has no recipes in it; it does not look like Docs.json.',
      };
    }
    return { ok: true, database, counts };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

const worker = self as unknown as DedicatedWorkerGlobalScope;

worker.onmessage = (event: MessageEvent<ExtractRequest>) => {
  worker.postMessage(extractDocs(event.data.buffer) satisfies ExtractResponse);
};
