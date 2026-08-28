import type { GameDatabase, ItemId, RecipeId, SolveResult } from '@factory-board/planner';
import type { WorldSnapshot } from '@factory-board/save-reader';
import { itemName, machineName } from './format';

/**
 * What to build first.
 *
 * "21 still to build" is a number, not a plan. Twenty-one machines have an
 * order, and it is not the order the solver happens to list them in: on the
 * reference save the steel chain does not exist at all, and until Steel Ingot
 * is standing, the Steel Beam, Steel Pipe, Modular Frame, Stator and Versatile
 * Framework assemblers that depend on it have nothing to eat. Building them
 * first is twenty minutes spent on machines that will sit idle.
 *
 * So the missing machines are sorted by what they unblock. A step **can be
 * built now** when everything its recipe eats is either raw ore or already
 * coming off a machine that exists — which is the real test, not whether the
 * plan mentions it. Everything else is **blocked**, and says by what.
 *
 * Within "now", the step that unblocks the most goes first. That is the whole
 * of the ordering: there is no scheduling here, no estimate of how long a
 * machine takes to place, and no claim about the best order — only the
 * difference between a machine that will run when you build it and one that
 * will not.
 */

export interface BuildStep {
  readonly recipe: RecipeId;
  /** What it makes. */
  readonly name: string;
  readonly machine: string;
  /** How many are missing. */
  readonly count: number;
  /** True when everything it eats already arrives from somewhere. */
  readonly ready: boolean;
  /** Steps that have to come first, by what they make. */
  readonly blockedBy: readonly string[];
  /** What this step lets you build, directly or further down. */
  readonly unlocks: readonly string[];
}

export function buildOrder(
  db: GameDatabase,
  result: SolveResult,
  snapshot: WorldSnapshot,
): readonly BuildStep[] {
  /** What the world already produces: raw ore, and anything a standing line makes. */
  const arriving = new Set<ItemId>();
  for (const [id, item] of Object.entries(db.items)) {
    if (item.isRaw) arriving.add(id);
  }
  for (const [recipeId, line] of Object.entries(snapshot.lines)) {
    if (line.count === 0) continue;
    for (const output of db.recipes[recipeId]?.outputs ?? []) arriving.add(output.item);
  }

  /** Recipe → what it is short of, in the plan's own terms. */
  const producerOf = new Map<ItemId, RecipeId>();
  for (const line of result.lines) {
    for (const output of db.recipes[line.recipe]?.outputs ?? []) {
      producerOf.set(output.item, line.recipe);
    }
  }

  const missing = result.lines
    .map((line) => ({
      line,
      count: Math.max(0, line.machinesToBuild - (snapshot.lines[line.recipe]?.count ?? 0)),
    }))
    .filter((entry) => entry.count > 0);

  /** Recipe → the recipes it waits on, among the ones still to build. */
  const waitsOn = new Map<RecipeId, Set<RecipeId>>();
  for (const { line } of missing) {
    const needs = new Set<RecipeId>();
    for (const input of db.recipes[line.recipe]?.inputs ?? []) {
      if (arriving.has(input.item)) continue;
      const producer = producerOf.get(input.item);
      if (producer && producer !== line.recipe) needs.add(producer);
    }
    waitsOn.set(line.recipe, needs);
  }

  /*
   * What each step unlocks, transitively. Walked from the dependency map rather
   * than counted one hop out, because Steel Ingot's value is the six things
   * downstream of it, not the two that name it directly.
   */
  const dependants = new Map<RecipeId, Set<RecipeId>>();
  for (const [recipe, needs] of waitsOn) {
    for (const need of needs) {
      const set = dependants.get(need) ?? new Set<RecipeId>();
      set.add(recipe);
      dependants.set(need, set);
    }
  }
  const unlocksOf = (recipe: RecipeId): Set<RecipeId> => {
    const seen = new Set<RecipeId>();
    const queue = [...(dependants.get(recipe) ?? [])];
    while (queue.length > 0) {
      const next = queue.pop()!;
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push(...(dependants.get(next) ?? []));
    }
    return seen;
  };

  const nameOf = (recipe: RecipeId) => {
    const product = db.recipes[recipe]?.outputs[0]?.item;
    return product ? itemName(db, product) : (db.recipes[recipe]?.name ?? recipe);
  };

  const steps: BuildStep[] = missing.map(({ line, count }) => {
    const needs = waitsOn.get(line.recipe) ?? new Set<RecipeId>();
    const unlocks = [...unlocksOf(line.recipe)].map(nameOf).sort();
    return {
      recipe: line.recipe,
      name: nameOf(line.recipe),
      machine: machineName(db, line.machine),
      count,
      ready: needs.size === 0,
      blockedBy: [...needs].map(nameOf).sort(),
      unlocks,
    };
  });

  /*
   * Ready first, then whatever unblocks the most, then the bigger job. A stable
   * tail-break on the name keeps the list from reshuffling between renders when
   * two steps are otherwise identical.
   */
  return steps.sort(
    (a, b) =>
      Number(b.ready) - Number(a.ready) ||
      b.unlocks.length - a.unlocks.length ||
      b.count - a.count ||
      a.name.localeCompare(b.name),
  );
}
