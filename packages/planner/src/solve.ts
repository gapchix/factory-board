import type {
  GameDatabase,
  GameRecipe,
  ItemId,
  PlannedLine,
  ProductionTarget,
  RecipeId,
  SolveOptions,
  SolveResult,
  SolveWarning,
} from './types.js';

const DEFAULT_MAX_DEPTH = 40;
/** Fractional machine counts land on values like 2.9999999996; round before ceil. */
const EPSILON = 1e-9;

/**
 * Every recipe that lists `item` among its outputs, in database order.
 * Callers use this to offer a recipe picker.
 */
export function recipesProducing(db: GameDatabase, item: ItemId): GameRecipe[] {
  return Object.values(db.recipes).filter((r) => r.outputs.some((o) => o.item === item));
}

/**
 * The recipe the planner reaches for when the user hasn't picked one: the first
 * non-alternate, falling back to the first of any kind.
 */
export function defaultRecipeFor(db: GameDatabase, item: ItemId): GameRecipe | undefined {
  const candidates = recipesProducing(db, item);
  return candidates.find((r) => !r.isAlternate) ?? candidates[0];
}

function outputPerMinute(recipe: GameRecipe, item: ItemId): number | undefined {
  const port = recipe.outputs.find((o) => o.item === item);
  if (!port) return undefined;
  return (port.amount * 60) / recipe.durationSeconds;
}

/**
 * Expand a set of production targets into the machines needed to hit them.
 *
 * Raw resources always terminate the expansion. The game ships late-game
 * Converter recipes that turn SAM into iron ore, and they are not flagged as
 * alternates — without this rule the solver happily "solves" a starter factory
 * by mining SAM and converting it, which is nonsense at any tier the plan is for.
 */
export function solve(
  db: GameDatabase,
  targets: readonly ProductionTarget[],
  options: SolveOptions = {},
): SolveResult {
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const choices = options.recipeChoices ?? {};

  const machineCounts = new Map<RecipeId, number>();
  const rawInputs = new Map<ItemId, number>();
  const produced = new Map<ItemId, number>();
  const consumed = new Map<ItemId, number>();
  const warnings: SolveWarning[] = [];
  const warned = new Set<string>();

  const warn = (code: SolveWarning['code'], item: ItemId, message: string): void => {
    const key = `${code}:${item}`;
    if (warned.has(key)) return;
    warned.add(key);
    warnings.push({ code, item, message });
  };

  const bump = (map: Map<string, number>, key: string, value: number): void => {
    map.set(key, (map.get(key) ?? 0) + value);
  };

  const expand = (
    item: ItemId,
    ratePerMinute: number,
    ancestors: ReadonlySet<ItemId>,
    depth: number,
  ): void => {
    if (ratePerMinute <= 0) return;

    const definition = db.items[item];
    if (!definition) {
      warn('unknown-item', item, `No definition for "${item}"; treating it as a raw input.`);
      bump(rawInputs, item, ratePerMinute);
      return;
    }

    if (definition.isRaw) {
      bump(rawInputs, item, ratePerMinute);
      return;
    }

    if (depth > maxDepth) {
      warn(
        'max-depth-exceeded',
        item,
        `Stopped expanding "${definition.name}" after ${maxDepth} levels.`,
      );
      bump(rawInputs, item, ratePerMinute);
      return;
    }

    if (ancestors.has(item)) {
      warn(
        'cycle-detected',
        item,
        `"${definition.name}" feeds itself through the chosen recipes; treating it as a raw input.`,
      );
      bump(rawInputs, item, ratePerMinute);
      return;
    }

    const chosenId = choices[item];
    const recipe = chosenId ? db.recipes[chosenId] : defaultRecipeFor(db, item);
    if (!recipe) {
      warn('no-recipe', item, `Nothing produces "${definition.name}"; treating it as a raw input.`);
      bump(rawInputs, item, ratePerMinute);
      return;
    }

    const perMachine = outputPerMinute(recipe, item);
    if (perMachine === undefined || perMachine <= 0) {
      warn(
        'recipe-does-not-produce-item',
        item,
        `Recipe "${recipe.name}" does not output "${definition.name}"; treating it as a raw input.`,
      );
      bump(rawInputs, item, ratePerMinute);
      return;
    }

    const machines = ratePerMinute / perMachine;
    bump(machineCounts, recipe.id, machines);

    for (const output of recipe.outputs) {
      bump(produced, output.item, (output.amount * 60 * machines) / recipe.durationSeconds);
    }

    const nextAncestors = new Set(ancestors);
    nextAncestors.add(item);

    for (const input of recipe.inputs) {
      const needed = (input.amount * 60 * machines) / recipe.durationSeconds;
      bump(consumed, input.item, needed);
      expand(input.item, needed, nextAncestors, depth + 1);
    }
  };

  for (const target of targets) {
    expand(target.item, target.ratePerMinute, new Set(), 0);
  }

  const lines: PlannedLine[] = [];
  let totalMachines = 0;
  let totalPowerMW = 0;

  for (const [recipeId, exact] of machineCounts) {
    const recipe = db.recipes[recipeId];
    if (!recipe) continue;
    const primary = recipe.outputs[0];
    if (!primary) continue;

    const toBuild = Math.ceil(exact - EPSILON);
    const powerMW = toBuild * (db.machines[recipe.machine]?.powerMW ?? 0);

    totalMachines += toBuild;
    totalPowerMW += powerMW;

    lines.push({
      recipe: recipeId,
      recipeName: recipe.name,
      machine: recipe.machine,
      primaryOutput: primary.item,
      machinesExact: exact,
      machinesToBuild: toBuild,
      outputPerMinute: (primary.amount * 60 * exact) / recipe.durationSeconds,
      powerMW,
    });
  }

  lines.sort(
    (a, b) => b.machinesToBuild - a.machinesToBuild || a.recipeName.localeCompare(b.recipeName),
  );

  const surplus: Record<ItemId, number> = {};
  for (const [item, made] of produced) {
    const net = made - (consumed.get(item) ?? 0);
    if (net > EPSILON) surplus[item] = net;
  }

  return {
    lines,
    rawInputs: Object.fromEntries(rawInputs),
    produced: Object.fromEntries(produced),
    consumed: Object.fromEntries(consumed),
    surplus,
    totalMachines,
    totalPowerMW,
    warnings,
  };
}
