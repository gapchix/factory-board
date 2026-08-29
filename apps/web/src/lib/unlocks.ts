import {
  recipeUnlocks,
  unlockedRecipes,
  type GameDatabase,
  type GameSchematic,
  type RecipeId,
} from '@factory-board/planner';
import type { WorldSnapshot } from '@factory-board/save-reader';

/**
 * What this save can actually build, and what stands in the way of the rest.
 *
 * The planner has always answered "here is the factory" without knowing whether
 * the recipes in it exist for you yet. On the reference save that mattered more
 * than it sounds: of the seventeen lines it proposes for Space Elevator Phase 2,
 * six are behind two milestones the player has not bought, and of the hundred
 * and ten alternates the recipe picker offered, exactly none had been found.
 */
export interface UnlockState {
  /**
   * Whether anything is known at all.
   *
   * False with no save loaded, and false for a database generated before
   * unlocks were extracted. Everything then reads as available, because saying
   * nothing is the only honest answer and "locked" would be a guess.
   */
  readonly known: boolean;
  readonly unlocked: (recipe: RecipeId) => boolean;
  /** Every way to unlock a recipe. Any one of them is enough. */
  readonly behind: (recipe: RecipeId) => readonly GameSchematic[];
}

const NO_CLAIM: UnlockState = { known: false, unlocked: () => true, behind: () => [] };

export function unlockState(
  db: GameDatabase,
  snapshot: WorldSnapshot | null | undefined,
): UnlockState {
  if (!snapshot) return NO_CLAIM;

  const fromSchematics = unlockedRecipes(db, snapshot.milestones);
  if (!fromSchematics) return NO_CLAIM;

  /*
   * A machine standing in the world making the thing is proof you can make it,
   * whatever the schematic list says.
   *
   * The list is read from one array in the save that holds milestones,
   * tutorial steps and hard drives together, and the reference save proves it
   * holds them all — but no save on this machine has ever completed a MAM
   * research node, so that one path is reasoned about rather than observed.
   * This is the check that keeps being wrong about it from mattering: the
   * worst error available here is calling a line the player is looking at
   * impossible, and a running line can never be called that.
   */
  const unlocked = new Set(fromSchematics);
  for (const recipe of Object.keys(snapshot.lines)) unlocked.add(recipe);

  const index = recipeUnlocks(db);
  return {
    known: true,
    // A recipe nothing is known to unlock cannot be called locked either.
    unlocked: (recipe) => unlocked.has(recipe) || !index.has(recipe),
    behind: (recipe) => index.get(recipe) ?? [],
  };
}

/**
 * What to go and do about a locked recipe, in as few words as it takes.
 *
 * A hard drive is named by its kind rather than its own name, which is only
 * ever "Alternate: " and the recipe you are already looking at. A milestone is
 * worth naming — you can go and buy it.
 */
export function describeLock(sources: readonly GameSchematic[]): string | null {
  if (sources.length === 0) return null;

  const words = sources.map((source) =>
    source.kind === 'hard-drive'
      ? 'a hard drive'
      : source.kind === 'research'
        ? `MAM · ${source.name}`
        : source.kind === 'milestone'
          ? `Tier ${source.tier} · ${source.name}`
          : source.name,
  );
  return [...new Set(words)].join(' or ');
}
