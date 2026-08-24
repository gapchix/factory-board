import { parseGameDatabase } from '@factory-board/game-data/schema';
import type { GameDatabase } from '@factory-board/planner';
import raw from '@/generated/game-database.json';

/**
 * The database is inlined into the bundle at build time by
 * `scripts/sync-game-data.mjs`, then validated once here.
 *
 * Validating a build artefact we generated ourselves may look redundant, but it
 * is the only thing standing between a stale or half-written database and a
 * board full of NaN.
 */
export const gameDatabase: GameDatabase = parseGameDatabase(raw);
