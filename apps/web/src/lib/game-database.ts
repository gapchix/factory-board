import { parseGameDatabase } from '@factory-board/game-data/schema';
import type { GameDatabase } from '@factory-board/planner';
import { z } from 'zod';
import raw from '@/generated/game-database.json';

/**
 * The database baked into the bundle at build time by
 * `scripts/sync-game-data.mjs`, validated once here.
 *
 * Validating a build artefact we generated ourselves may look redundant, but it
 * is the only thing standing between a stale or half-written database and a
 * board full of NaN.
 *
 * This is the database the page *opens* with. It is not necessarily the one it
 * runs on: a recipe book can be dropped on the page at any time and replaces
 * it for that browser, which is what `state/game-data.tsx` holds
 * ([ADR 34](../../../../docs/adr/0034-the-recipe-book-can-arrive-at-runtime.md)).
 * Nothing outside the provider should read this directly.
 */
const envelopeSchema = z.object({
  source: z.enum(['extracted', 'hosted', 'demo']),
  database: z.unknown(),
});

/**
 * Which one the sync script put in: the maintainer's extract, the book a hosted
 * build ships ([ADR 38](../../../../docs/adr/0038-the-hosted-copy-ships-a-recipe-book.md)),
 * or the demo.
 */
export type BakedSource = z.infer<typeof envelopeSchema>['source'];

const envelope = envelopeSchema.parse(raw as unknown);

export const bakedDatabase: GameDatabase = parseGameDatabase(envelope.database);
export const bakedSource: BakedSource = envelope.source;
