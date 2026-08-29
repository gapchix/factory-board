import type { GameDatabase, GameSchematic, RecipeId, SchematicId } from './types.js';

/**
 * What a save's purchased schematics let you actually build.
 *
 * The game gates every recipe behind something you buy: a HUB milestone, a MAM
 * research node, or a hard drive pulled out of a crash site. A save records
 * which of those you own, and the database records what each one hands out, so
 * the pair answers a question the planner could never answer alone — whether
 * the factory it just designed is one you are able to build today.
 */

/**
 * The recipes this set of schematics unlocks.
 *
 * Returns `null` when the database records no unlocks at all — a database from
 * an older extractor, or a hand-built one. That is emphatically not the same
 * as an empty set: "nothing is known" must never be drawn as "you have
 * nothing", which is how a missing field becomes a confident lie.
 */
export function unlockedRecipes(
  db: GameDatabase,
  purchased: Iterable<SchematicId>,
): ReadonlySet<RecipeId> | null {
  const schematics = Object.values(db.schematics);
  if (schematics.length === 0) return null;

  const owned = purchased instanceof Set ? purchased : new Set(purchased);
  const unlocked = new Set<RecipeId>();
  for (const schematic of schematics) {
    if (!owned.has(schematic.id)) continue;
    for (const recipe of schematic.unlocks) unlocked.add(recipe);
  }
  return unlocked;
}

/**
 * What would unlock each recipe, indexed for repeated lookup.
 *
 * More than one entry means any single one of them is enough — Turbofuel comes
 * with its own hard drive and again with the sulfur research, and owning
 * either grants the recipe.
 */
export function recipeUnlocks(db: GameDatabase): ReadonlyMap<RecipeId, readonly GameSchematic[]> {
  const index = new Map<RecipeId, GameSchematic[]>();
  for (const schematic of Object.values(db.schematics)) {
    for (const recipe of schematic.unlocks) {
      const existing = index.get(recipe);
      if (existing) existing.push(schematic);
      else index.set(recipe, [schematic]);
    }
  }
  return index;
}
