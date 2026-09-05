/**
 * The extractor, for a browser tab.
 *
 * The package's main entry finds a Satisfactory install on disk, and finding
 * things on disk needs `node:fs`, which a bundler will not put in a page.
 * Everything that turns a `Docs.json` into a database was already free of
 * Node: this entry is that half on its own, so the web app can take the file
 * from a drop zone instead of from a path
 * ([ADR 34](../../../docs/adr/0034-the-recipe-book-can-arrive-at-runtime.md)).
 *
 * Same split as `./schema`, for the same reason — see "Two entry points" in
 * docs/ARCHITECTURE.md, which is three now.
 */
export { decodeDocs } from './docs.js';
export type { DocsClass, DocsGroup } from './docs.js';
export { extractDatabase } from './extract.js';
export type { ExtractOptions, ExtractionReport } from './extract.js';
export { InvalidGameDatabaseError, parseGameDatabase } from './schema.js';
export { demoDatabase } from './demo.js';
