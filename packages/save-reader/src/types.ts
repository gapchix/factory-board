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
  readonly milestones: readonly MilestoneId[];
  readonly phase: PhaseProgress | null;
  /** Total placed objects the parser returned, for sanity-checking a load. */
  readonly objectCount: number;
}
