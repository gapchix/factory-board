/**
 * Domain types shared by the planner and everything that feeds it.
 *
 * Unit convention: every `amount` and `ratePerMinute` in this package is already
 * in *display* units. Fluids are stored as cubic metres, not the litres the game
 * files use internally — the extractor normalises that once, so nothing
 * downstream has to remember to divide by 1000.
 */

export type ItemId = string;
export type RecipeId = string;
export type MachineId = string;
export type MilestoneId = string;

export interface GameItem {
  readonly id: ItemId;
  readonly name: string;
  /** Mined, pumped or drilled — never manufactured, even if a recipe claims to. */
  readonly isRaw: boolean;
  /** Measured in m³/min rather than items/min. */
  readonly isFluid: boolean;
}

export interface RecipePort {
  readonly item: ItemId;
  readonly amount: number;
}

export interface GameRecipe {
  readonly id: RecipeId;
  readonly name: string;
  readonly durationSeconds: number;
  readonly machine: MachineId;
  readonly inputs: readonly RecipePort[];
  readonly outputs: readonly RecipePort[];
  readonly isAlternate: boolean;
}

export interface GameMachine {
  readonly id: MachineId;
  readonly name: string;
  /**
   * Nominal draw used for plan totals. For machines whose consumption varies
   * with the recipe (Converter, Particle Accelerator, Quantum Encoder) this is
   * the midpoint of `powerRangeMW`, so totals are an estimate, not a ceiling.
   */
  readonly powerMW: number;
  /**
   * Present only for variable-power machines.
   *
   * Explicitly `| undefined` because the project runs with
   * `exactOptionalPropertyTypes`, and the Zod-inferred shape this must stay
   * assignable to models an optional field that way.
   */
  readonly powerRangeMW?: { readonly min: number; readonly max: number } | undefined;
}

export interface GameMilestone {
  readonly id: MilestoneId;
  readonly name: string;
  readonly tier: number;
  readonly cost: readonly RecipePort[];
  readonly unlocks: readonly RecipeId[];
}

export interface GameDatabase {
  /**
   * Steam build id of the install this was extracted from, or 0 when unknown.
   *
   * This is Steam's numbering, NOT the `buildVersion` recorded in save files —
   * the two are unrelated and must never be compared.
   */
  readonly sourceBuildId: number;
  readonly items: Readonly<Record<ItemId, GameItem>>;
  readonly recipes: Readonly<Record<RecipeId, GameRecipe>>;
  readonly machines: Readonly<Record<MachineId, GameMachine>>;
  readonly milestones: Readonly<Record<MilestoneId, GameMilestone>>;
}

export interface ProductionTarget {
  readonly item: ItemId;
  readonly ratePerMinute: number;
}

export interface SolveOptions {
  /** Pin a specific recipe for an item, e.g. to pick an alternate. */
  readonly recipeChoices?: Readonly<Record<ItemId, RecipeId>>;
  /** Safety valve for pathological recipe graphs. Defaults to 40. */
  readonly maxDepth?: number;
}

export type SolveWarningCode =
  | 'unknown-item'
  | 'no-recipe'
  | 'cycle-detected'
  | 'max-depth-exceeded'
  | 'recipe-does-not-produce-item';

export interface SolveWarning {
  readonly code: SolveWarningCode;
  readonly item: ItemId;
  readonly message: string;
}

export interface PlannedLine {
  readonly recipe: RecipeId;
  readonly recipeName: string;
  readonly machine: MachineId;
  readonly primaryOutput: ItemId;
  /** Fractional machine count the maths actually calls for. */
  readonly machinesExact: number;
  /** What you have to place in the world. */
  readonly machinesToBuild: number;
  readonly outputPerMinute: number;
  /** Power drawn by `machinesToBuild` machines at 100% clock. */
  readonly powerMW: number;
}

export interface SolveResult {
  readonly lines: readonly PlannedLine[];
  /** Items the plan needs but cannot make: ore, water, crude oil. */
  readonly rawInputs: Readonly<Record<ItemId, number>>;
  readonly produced: Readonly<Record<ItemId, number>>;
  readonly consumed: Readonly<Record<ItemId, number>>;
  /** produced − consumed, where positive. Byproducts show up here. */
  readonly surplus: Readonly<Record<ItemId, number>>;
  readonly totalMachines: number;
  readonly totalPowerMW: number;
  readonly warnings: readonly SolveWarning[];
}
