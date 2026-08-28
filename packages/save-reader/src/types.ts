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
  /**
   * Which way it faces, in degrees clockwise from north, seen from above.
   *
   * The save stores a full quaternion; this is the yaw taken out of it, which
   * is all a top-down drawing can use. Absent where the transform did not say.
   */
  readonly facing?: number | undefined;
  /** Absent for anything that neither makes, extracts nor burns — storage, walls, belts. */
  readonly role?: BuildingRole | undefined;
  /**
   * What is waiting in the machine's input buffer, by item.
   *
   * The difference between a machine that is starving and one that is backed
   * up, which uptime alone cannot tell apart: both read as a low number and
   * they want opposite fixes. An **empty record is the signal**, not the
   * absence of one — a constructor with nothing to work on has an input
   * inventory holding nothing. Absent means the building has no input buffer
   * at all.
   */
  readonly input?: Readonly<Record<ItemId, number>> | undefined;
  /**
   * What has piled up in the machine's output buffer, by item.
   *
   * A machine whose output is drained the moment it is made holds nothing here.
   * Anything much means whatever is downstream has stopped taking it.
   */
  readonly output?: Readonly<Record<ItemId, number>> | undefined;
  /**
   * The id of the power grid this building is wired to.
   *
   * Absent for anything unwired — which for storage and the HUB is simply how
   * they are, and for a smelter means it is standing there doing nothing.
   */
  readonly circuit?: number | undefined;
  /**
   * A generator's remaining fuel, in items.
   *
   * The game keeps this per burner, and it is how a coal plant that averages
   * 79% turns out to be four generators running and one standing empty.
   */
  readonly fuel?: number | undefined;
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
  /**
   * Index into `placements` of the belt or pipe this route belongs to, so a
   * drawing can light up the exact run that carries something.
   */
  readonly building?: number | undefined;
}

/**
 * One thing feeding another: what leaves `from` arrives at `to`.
 *
 * The save states this outright. Every connection component names the one it
 * is plugged into, and every connection is declared from both ends, so the
 * factory is a graph rather than something to be guessed at from geometry.
 * Direction comes out of the component names: a belt's `ConveyorAny0` is the
 * end items arrive at and `ConveyorAny1` the end they leave by, and a machine
 * names its `Input` and `Output` ports.
 */
export interface BuildingLink {
  /** Index into `placements`: where the items leave. */
  readonly from: number;
  /** Index into `placements`: where they arrive. */
  readonly to: number;
  /**
   * `pipe` links carry no direction — which way fluid moves depends on the
   * pumps — so `from` and `to` are merely the two ends of one.
   */
  readonly kind: 'belt' | 'pipe';
}

/**
 * One power grid, as the game wired it.
 *
 * Satisfactory does not blend circuits: a generator only feeds what it is
 * physically joined to, so a base with three grids can have one browning out
 * while another idles at a sixth of its capacity. Nothing else in the snapshot
 * could see that, which is why every machine on a dead grid used to read as a
 * machine with a supply problem.
 *
 * Both numbers are the save's own. Totalling nominal draw from the database
 * instead misses everything without a recipe — miners, pumps, the radar tower —
 * and on the reference save that understated the real figure by a third.
 */
export interface PowerCircuit {
  /** The game's own id for the grid, which is what it calls it in-world. */
  readonly id: number;
  /** Indices into `placements` of everything wired to it. */
  readonly members: readonly number[];
  /** What the buildings on it are asking for, in MW. */
  readonly demandMW: number;
  /** What the generators on it can supply, in MW. */
  readonly capacityMW: number;
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
  /**
   * When the game wrote this save, in milliseconds since the Unix epoch, or
   * `null` where the header does not say.
   *
   * `playDurationSeconds` is the session's own clock and is what a series of
   * saves should be ordered by; this is the wall clock, which is what a person
   * recognises a save by.
   */
  readonly savedAt: number | null;
  readonly lines: Readonly<Record<RecipeId, ActualLine>>;
  /** Every placed building, counted by class, belts and foundations included. */
  readonly buildings: Readonly<Record<string, number>>;
  /**
   * Everything sitting in containers, by item.
   *
   * Not production, and not consumption — a stock level. It is what turns "this
   * line is backed up" into "and here is where the last five thousand of them
   * went", and what says a Space Elevator part is built but never delivered.
   */
  readonly stored: Readonly<Record<ItemId, number>>;
  /** The same buildings, with positions, for spatial analysis. */
  readonly placements: readonly BuildingPlacement[];
  /** Belt, pipe and power-line routes, for drawing the base. */
  readonly paths: readonly BuildingPath[];
  /** What feeds what, from the connections the save records. */
  readonly links: readonly BuildingLink[];
  readonly milestones: readonly MilestoneId[];
  /** Every power grid in the world, with what it draws and what it can supply. */
  readonly circuits: readonly PowerCircuit[];
  readonly phase: PhaseProgress | null;
  /** Total placed objects the parser returned, for sanity-checking a load. */
  readonly objectCount: number;
}
