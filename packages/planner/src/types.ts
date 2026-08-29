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
  /**
   * What burning one of these releases, in megajoules per *display* unit — so
   * per m³ for a fluid, not per litre.
   *
   * The game states fluid energy per litre, which makes Fuel look like 0.75
   * beside Coal's 300 and turns a generator's burn rate into a thousandfold
   * error in whichever direction you guess. Normalised here with every other
   * fluid figure, once, at the extractor.
   *
   * Absent for everything that is not a fuel, which is most of the book.
   */
  readonly energyMJ?: number | undefined;
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

/**
 * One thing a generator will burn, and what burning it costs per minute.
 *
 * Rates are for the generator at full output. Fuel burn is linear in load —
 * a generator carrying half a grid burns half the coal — so a rate here scales
 * straight down, and nothing needs a second figure for part load.
 */
export interface GeneratorFuel {
  readonly item: ItemId;
  /** Burned per minute at full output, in display units. */
  readonly ratePerMinute: number;
  /**
   * The second input some generators need alongside the fuel — water, for
   * every one that has it. Absent where the generator wants nothing else.
   */
  readonly supplemental?: { readonly item: ItemId; readonly ratePerMinute: number } | undefined;
  /** What comes back out: nuclear waste, and nothing else in the game today. */
  readonly byproduct?: { readonly item: ItemId; readonly ratePerMinute: number } | undefined;
}

/**
 * A building that makes power rather than drawing it.
 *
 * Deliberately not a `GameMachine`: a machine's `powerMW` is what it *takes*,
 * and putting a number that means the opposite in the same field is how a
 * total ends up 500 MW wrong with nothing to show for it.
 *
 * Only generators that burn something are here. The Geothermal Generator's
 * output depends on the purity of the vent it stands on, which is
 * world-generation data no save records — the same wall the node budget runs
 * into. A generator whose output cannot be stated is left out rather than
 * given a made-up one.
 */
export interface GameGenerator {
  readonly id: MachineId;
  readonly name: string;
  /** Output at full load, in MW. */
  readonly powerMW: number;
  /**
   * Every fuel it takes, in the game's own order, which puts the plain one
   * first: Coal before Compacted Coal, Fuel before Turbofuel.
   */
  readonly fuels: readonly GeneratorFuel[];
}

/**
 * Anything that moves a rate from one machine to another, and how much of one
 * it can move.
 *
 * A plan is a set of rates and a belt is a rate limit, and until these existed
 * the board could write "176 Iron Ingot a minute" over a Mk.1 belt that carries
 * sixty and say nothing at all.
 *
 * A **lift** is a belt that goes up: same rate, same tier, and never a choice
 * you make for throughput. It is here so the world can be read — a lift in the
 * middle of a run is as much of a limit as the belt either side of it — and is
 * left out of what gets *offered*.
 */
export interface GameCarrier {
  readonly id: MachineId;
  readonly name: string;
  readonly kind: 'belt' | 'lift' | 'pipe';
  /** Items a minute for a belt or lift, m³ a minute for a pipe. */
  readonly ratePerMinute: number;
}

/**
 * A miner, pump or extractor, and what it pulls out of the ground.
 *
 * The rate is for a **normal** node at 100% clock, because that is the only
 * one the game files state. What is under any particular miner is
 * world-generation data no save records — see SPEC — so the range a set of
 * these can deliver is half to double, and the board says so rather than
 * picking a number out of it.
 */
export interface GameExtractor {
  readonly id: MachineId;
  readonly name: string;
  /** At 100% clock on a normal node, in display units. */
  readonly ratePerMinute: number;
  /**
   * Whether the node underneath has a purity at all. Water does not: a Water
   * Extractor is 120 m³/min wherever it stands, because it draws from a lake
   * rather than a node.
   */
  readonly purityVaries: boolean;
  /** Pulls fluids rather than solids, which is what its form says. */
  readonly fluid: boolean;
  /**
   * The resources it will take, where the game names them — a Water Extractor
   * takes water and nothing else. Empty means anything of its form, which is
   * every miner: they take whatever node they are bolted to.
   */
  readonly resources: readonly ItemId[];
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
  /**
   * Every generator that burns a fuel, with what it makes and what that costs.
   *
   * Separate from `machines` because the two answer opposite questions — one
   * is draw, the other is supply — and a plan that added them together would
   * be wrong by twice the difference.
   */
  readonly generators: Readonly<Record<MachineId, GameGenerator>>;
  /** Belts, lifts and pipes, with what each can move in a minute. */
  readonly carriers: Readonly<Record<MachineId, GameCarrier>>;
  /** Miners, pumps and extractors, with what each pulls at a normal node. */
  readonly extractors: Readonly<Record<MachineId, GameExtractor>>;
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
