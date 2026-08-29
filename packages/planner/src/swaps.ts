import { defaultRecipeFor, recipesProducing, solve } from './solve.js';
import type {
  GameDatabase,
  ItemId,
  ProductionTarget,
  RecipeId,
  SolveOptions,
  SolveResult,
  SolveWarning,
} from './types.js';

/** Rates below this are floating-point noise, not a difference. */
const EPSILON = 1e-6;

/**
 * One recipe you could use for an item, and what using it would cost.
 *
 * Every figure is a difference against the plan as it stands, for the *whole*
 * plan rather than the one line — which is the only honest way to price a
 * swap. Cast Screws removes the rod constructors feeding the screw
 * constructors, so counting the screw line alone would report a saving of
 * nothing and miss the six machines that actually go away.
 *
 * Negative is cheaper.
 */
export interface RecipeSwap {
  /** The item this is a way of making. */
  readonly item: ItemId;
  readonly recipe: RecipeId;
  readonly recipeName: string;
  readonly isAlternate: boolean;
  /** The recipe the plan uses today. Its own figures are all zero. */
  readonly current: boolean;
  /** Machines across the whole plan, after rounding each line up as you must build it. */
  readonly machines: number;
  readonly powerMW: number;
  /** Change per raw resource, per minute. Ore traded for other ore shows as two entries. */
  readonly raw: Readonly<Record<ItemId, number>>;
  /** Trouble this choice introduces that the current plan does not have. */
  readonly warnings: readonly SolveWarning[];
}

function rawDelta(
  before: SolveResult,
  after: SolveResult,
): { raw: Record<ItemId, number>; total: number } {
  const raw: Record<ItemId, number> = {};
  let total = 0;
  for (const item of new Set([...Object.keys(before.rawInputs), ...Object.keys(after.rawInputs)])) {
    const delta = (after.rawInputs[item] ?? 0) - (before.rawInputs[item] ?? 0);
    if (Math.abs(delta) <= EPSILON) continue;
    raw[item] = delta;
    total += delta;
  }
  return { raw, total };
}

function newWarnings(before: SolveResult, after: SolveResult): SolveWarning[] {
  const known = new Set(before.warnings.map((w) => `${w.code}:${w.item}`));
  return after.warnings.filter((w) => !known.has(`${w.code}:${w.item}`));
}

/**
 * Price every recipe that could make `item`, against the plan as it stands.
 *
 * Cheapest first, by machines and then by power, so the list reads as a
 * ranking. The recipe in use is in it, flagged and scoring zero, because where
 * it lands among the others is the answer to "is what I am doing any good".
 */
export function priceSwaps(
  db: GameDatabase,
  targets: readonly ProductionTarget[],
  options: SolveOptions,
  item: ItemId,
): readonly RecipeSwap[] {
  const baseline = solve(db, targets, options);
  return priceAgainst(db, targets, options, item, baseline);
}

/**
 * The same, for every item the plan makes — the whole board of choices at once.
 *
 * A plan of twenty lines is a few dozen solves, which is milliseconds, and it
 * buys the question players actually ask: not "what else could make screws"
 * but "of everything I could swap, what is worth swapping".
 */
export function priceAllSwaps(
  db: GameDatabase,
  targets: readonly ProductionTarget[],
  options: SolveOptions = {},
): readonly RecipeSwap[] {
  const baseline = solve(db, targets, options);
  const items = [...new Set(baseline.lines.map((line) => line.primaryOutput))];
  return items.flatMap((item) => priceAgainst(db, targets, options, item, baseline));
}

function priceAgainst(
  db: GameDatabase,
  targets: readonly ProductionTarget[],
  options: SolveOptions,
  item: ItemId,
  baseline: SolveResult,
): RecipeSwap[] {
  const choices = options.recipeChoices ?? {};
  const inUse = choices[item] ?? defaultRecipeFor(db, item)?.id;

  const swaps: RecipeSwap[] = [];
  for (const candidate of recipesProducing(db, item)) {
    const current = candidate.id === inUse;
    const after = current
      ? baseline
      : solve(db, targets, { ...options, recipeChoices: { ...choices, [item]: candidate.id } });
    const { raw } = rawDelta(baseline, after);

    swaps.push({
      item,
      recipe: candidate.id,
      recipeName: candidate.name,
      isAlternate: candidate.isAlternate,
      current,
      machines: after.totalMachines - baseline.totalMachines,
      powerMW: after.totalPowerMW - baseline.totalPowerMW,
      raw,
      warnings: current ? [] : newWarnings(baseline, after),
    });
  }

  swaps.sort(
    (a, b) =>
      a.machines - b.machines ||
      a.powerMW - b.powerMW ||
      a.recipeName.localeCompare(b.recipeName),
  );
  return swaps;
}
