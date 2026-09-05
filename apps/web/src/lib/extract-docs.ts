import {
  decodeDocs,
  extractDatabase,
  parseGameDatabase,
  type ExtractionReport,
} from '@factory-board/game-data/browser';
import type { GameDatabase } from '@factory-board/planner';

/**
 * Turns the bytes of a dropped `Docs.json` into a database.
 *
 * A plain function, in `lib`, on purpose: it runs in a Worker when one can be
 * made and on the main thread when one cannot, and the two callers must not
 * share a module with the Worker's message handler. Importing the *worker
 * module* on the main thread evaluates its top level, where `self` is the
 * window — which installed a `message` handler on the page that echoed every
 * message back to itself, forever. The worker imports this; nothing imports
 * the worker.
 */
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
    const extracted = extractDatabase(docs, { sourceBuildId: 0 });
    if (extracted.counts.recipes === 0) {
      return {
        ok: false,
        error: 'That JSON has no recipes in it; it does not look like Docs.json.',
      };
    }
    // The validated copy, not the raw one: same shape as the baked book, and
    // no key a file chose (a class named `__proto__`, say) survives into it.
    const database = parseGameDatabase(extracted.database);
    return { ok: true, database, counts: extracted.counts };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
