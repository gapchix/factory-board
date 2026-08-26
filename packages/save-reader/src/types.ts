import type { ItemId, MachineId, MilestoneId, RecipeId } from '@factory-board/planner';

/** One production line as it actually exists in the world. */
export interface ActualLine {
  readonly recipe: RecipeId;
  readonly machine: MachineId;
  /** How many machines are set to this recipe. */
  readonly count: number;
  /**
   * Share of the last measurement window the machines spent producing, 0–1,
   * averaged across them. `null` when the game has not measured yet — a machine
   * built moments ago has no history, which is different from one sitting idle.
   */
  readonly uptime: number | null;
  /** Average clock speed, where 1 is 100%. */
  readonly clock: number;
}

/**
 * What a building is *for*, when the save says so plainly.
 *
 * Read from the properties rather than from a list of class names: a
 * manufacturer carries `mCurrentRecipe`, an extractor `mExtractableResource`,
 * a generator a fuel inventory. So a game update that adds another miner or
 * burner is classified correctly by a package that has never heard of it.
 */
export type BuildingRole = 'production' | 'extraction' | 'power';

/**
 * One placed building, positioned in metres.
 *
 * The game stores centimetres as floats; metres rounded to integers is plenty
 * for laying out a base — a factory cell is 8 m across — and keeps the payload
 * small on a save with tens of thousands of belts.
 */
export interface BuildingPlacement {
  /** Machine or building id, matching `GameDatabase.machines` where it is one. */
  readonly machine: MachineId;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Set when the building is a manufacturer with a recipe selected. */
  readonly recipe?: RecipeId | undefined;
  /** Absent for anything that neither makes, extracts nor burns — storage, walls, belts. */
  readonly role?: BuildingRole | undefined;
  /**
   * What the building handles: the resource an extractor is pulling out of its
   * node, or the fuel a generator is burning. A production machine says it with
   * its recipe instead, so this is left off there.
   *
   * Node *purity* is still world-generation data and still absent — see
   * SPEC.md. What a placed miner is producing is a different question, and the
   * save does answer it.
   */
  readonly resource?: ItemId | undefined;
  /**
   * Share of the last measurement window this building spent producing, 0–1.
   *
   * Only for buildings no production line covers — extractors and generators.
   * Machines with a recipe report theirs through `lines`, and repeating it per
   * placement would grow the snapshot for every smelter in the base.
   */
  readonly uptime?: number | undefined;
}

/**
 * A belt, pipe or power line, as a polyline in metres.
 *
 * These are what make a map legible. Without them a base is an unreadable
 * scatter of dots; with them you can see the spine, the runs out to the miners,
 * and which cell feeds which.
 */
export interface BuildingPath {
  readonly kind: 'belt' | 'pipe' | 'power';
  /** [x, y] pairs in metres, in order. */
  readonly points: readonly (readonly [number, number])[];
}

export interface PhaseProgress {
  /** e.g. `GP_Project_Assembly_Phase_1`, or null on a fresh save. */
  readonly current: string | null;
  readonly target: string | null;
  /** Items already delivered towards `target`. */
  readonly delivered: Readonly<Record<ItemId, number>>;
}

/** Everything the board needs from a save file, and nothing else. */
export interface WorldSnapshot {
  readonly sessionName: string;
  readonly playDurationSeconds: number;
  /**
   * The game's internal build version, from the save header.
   * Unrelated to `GameDatabase.sourceBuildId`; never compare the two.
   */
  readonly saveBuildVersion: number;
  readonly lines: Readonly<Record<RecipeId, ActualLine>>;
  /** Every placed building, counted by class, belts and foundations included. */
  readonly buildings: Readonly<Record<string, number>>;
  /** The same buildings, with positions, for spatial analysis. */
  readonly placements: readonly BuildingPlacement[];
  /** Belt, pipe and power-line routes, for drawing the base. */
  readonly paths: readonly BuildingPath[];
  readonly milestones: readonly MilestoneId[];
  readonly phase: PhaseProgress | null;
  /** Total placed objects the parser returned, for sanity-checking a load. */
  readonly objectCount: number;
}
