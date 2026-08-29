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
/** A milestone, a MAM research node or a hard drive — the same id space. */
export type SchematicId = string;

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

/**
 * Anything placeable, for display purposes.
 *
 * Broader than `machines`: miners, generators, the HUB, belts and storage all
 * appear here so a map can name them. Without it the UI falls back to printing
 * raw class names like `GeneratorBiomass_Automated` at the player.
 */
export interface GameBuilding {
  readonly id: MachineId;
  readonly name: string;
  /**
   * How much ground it stands on, in metres, along its own axes — width across
   * X, length along Y, before any rotation is applied.
   *
   * From the game's hard clearance box. Absent for the things that declare
   * none, which is most of what is not a building you place on the ground.
   */
  readonly footprintM?: { readonly width: number; readonly length: number } | undefined;
}

export interface GameMilestone {
  readonly id: MilestoneId;
  readonly name: string;
  readonly tier: number;
  readonly cost: readonly RecipePort[];
  readonly unlocks: readonly RecipeId[];
}

/**
 * Where an unlock comes from, which is the difference between "buy the
 * milestone" and "go and find a hard drive".
 */
export type SchematicKind = 'milestone' | 'research' | 'hard-drive' | 'other';

/**
 * One thing you unlock, and the recipes it hands you.
 *
 * The game keeps every unlock in one list — HUB milestones, MAM research and
 * hard-drive alternates alike — and a save records which of them the player
 * has bought. That pairing is what lets a plan say a line is not buildable
 * yet, and what it would take to make it so.
 *
 * A recipe can have more than one of these: Turbofuel arrives with its own
 * hard drive *or* with the sulfur research that also grants it, and owning
 * either is enough.
 */
export interface GameSchematic {
  readonly id: SchematicId;
  readonly name: string;
  readonly kind: SchematicKind;
  /** The tech tier the game files state, or 0 where they state none. */
  readonly tier: number;
  /** Recipes this unlocks. Only ever recipes the database also knows. */
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
  /** Display names for every placeable building, machines included. */
  readonly buildings: Readonly<Record<MachineId, GameBuilding>>;
  readonly milestones: Readonly<Record<MilestoneId, GameMilestone>>;
  /**
   * Every unlock that hands out a recipe, milestones included.
   *
   * Overlaps `milestones` on purpose. That record is the tier ladder with its
   * costs, which is what a progression view shows; this one answers a
   * different question — what stands between you and a recipe — and has to
   * cover research and hard drives to answer it at all.
   */
  readonly schematics: Readonly<Record<SchematicId, GameSchematic>>;
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
