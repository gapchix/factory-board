import type { GameDatabase, RecipeId } from '@factory-board/planner';
import type { WorldSnapshot } from '@factory-board/save-reader';

/**
 * The lines a save runs that the recipe book in hand has never heard of.
 *
 * A real save opened against the demo database reads as a base where nothing
 * can be explained: every line is "no reason found" with a class name for a
 * label, which looks like the board is broken when the board is merely
 * holding the wrong book. This is the number that says so — and once the
 * player's own `Docs.json` is in, it should be zero, which is also how the
 * page knows the book matches the world.
 *
 * Not zero on a modded save, ever, and that is correct: mod recipes are in no
 * `Docs.json`.
 */
export function unknownLines(
  db: GameDatabase,
  snapshot: Pick<WorldSnapshot, 'lines'> | null | undefined,
): RecipeId[] {
  if (!snapshot) return [];
  return Object.keys(snapshot.lines)
    .filter((recipe) => db.recipes[recipe] === undefined)
    .sort();
}
