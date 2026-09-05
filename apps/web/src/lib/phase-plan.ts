import type { GameDatabase, ItemId, ProductionTarget } from '@factory-board/planner';
import type { WorldSnapshot } from '@factory-board/save-reader';
import { itemName } from './format';
import { quotaFor } from './phases';

/**
 * The plan the save has already written for you.
 *
 * The Planner opened on an empty text box and a row of presets, and asked what
 * you wanted the factory to make. That is a blank page, and a blank page is a
 * reason not to start: the presets could not answer it either, because they are
 * fixed lists that know nothing about the save. "Phase 2" set 5 : 5 : 1 whether
 * you had delivered none of it or all but the last twenty.
 *
 * The save answers it outright. It says which phase you are on, what has been
 * delivered, what is sitting in a container built but never handed over, and
 * what the factory is producing right now. Everything needed to say *"466 Smart
 * Plating still to make, and you are making none"* — and to propose the rates
 * that get there — is already in the file the board parses on load.
 *
 * Rates land every part at the same moment, because a phase is delivered when
 * its last part is: finishing one of three early buys nothing.
 */

/** How fast the largest remaining part is proposed to be built, per minute. */
const PACE_PER_MINUTE = 5;

export interface PhasePart {
  readonly item: ItemId;
  readonly name: string;
  readonly required: number;
  readonly delivered: number;
  /** Built and sitting in a container — made, but not handed over. */
  readonly stored: number;
  /**
   * What still has to come off a machine: required, less what is delivered and
   * what is already standing in a box. Parts in storage still have to reach the
   * elevator, but nobody has to *make* them again.
   */
  readonly toMake: number;
  /** What the factory actually produces of it now, per minute. */
  readonly ratePerMinute: number;
}

export interface PhasePlan {
  readonly label: string;
  readonly parts: readonly PhasePart[];
  /** Targets that land every part at the same moment. */
  readonly targets: readonly ProductionTarget[];
  /** How long those targets take to clear what is left, in minutes. */
  readonly minutes: number;
  /** Nothing left to make: everything is delivered or already built. */
  readonly done: boolean;
}

/** What the factory actually produces of an item per minute, uptime included. */
function producedPerMinute(db: GameDatabase, snapshot: WorldSnapshot, item: ItemId): number {
  let total = 0;
  for (const line of Object.values(snapshot.lines)) {
    const recipe = db.recipes[line.recipe];
    const output = recipe?.outputs.find((port) => port.item === item);
    if (!recipe || !output || recipe.durationSeconds <= 0) continue;
    // Nominal rate, then what is actually standing there and how well it runs.
    const nominal = (output.amount / recipe.durationSeconds) * 60;
    total += nominal * line.count * line.clock * (line.uptime ?? 1);
  }
  return total;
}

/**
 * What the Space Elevator is waiting for, and the plan that would feed it.
 *
 * Null when the save is on no phase, on one whose quotas have not been
 * transcribed, or on one the save has already delivered past — see
 * [phases.ts](./phases.ts); inventing a denominator would be worse than
 * showing none.
 */
export function planForPhase(db: GameDatabase, snapshot: WorldSnapshot): PhasePlan | null {
  const definition = quotaFor(snapshot.phase);
  if (!definition) return null;

  const parts: PhasePart[] = Object.entries(definition.requires).map(([item, required]) => {
    const delivered = snapshot.phase?.delivered[item] ?? 0;
    const stored = snapshot.stored[item] ?? 0;
    return {
      item,
      name: itemName(db, item),
      required,
      delivered,
      stored,
      toMake: Math.max(0, required - delivered - stored),
      ratePerMinute: producedPerMinute(db, snapshot, item),
    };
  });

  const most = Math.max(...parts.map((part) => part.toMake));
  if (most <= 0) {
    return { label: definition.label, parts, targets: [], minutes: 0, done: true };
  }

  /*
   * One pace for the whole phase, set by whichever part has furthest to go, and
   * the rest scaled to land with it. Rounded up to whole units a minute: a
   * target of 4.66/min is a true number and a useless instruction.
   */
  const minutes = Math.ceil(most / PACE_PER_MINUTE);
  const targets = parts
    .filter((part) => part.toMake > 0)
    .map((part) => ({
      item: part.item,
      ratePerMinute: Math.max(1, Math.ceil(part.toMake / minutes)),
    }));

  const slowest = Math.max(
    ...targets.map((entry) => {
      const part = parts.find((candidate) => candidate.item === entry.item);
      return (part?.toMake ?? 0) / entry.ratePerMinute;
    }),
  );

  return { label: definition.label, parts, targets, minutes: Math.ceil(slowest), done: false };
}

/** "1h 40m", or "40m" — how long the proposed plan takes. */
export function duration(minutes: number): string {
  if (minutes < 60) return `${Math.max(1, Math.round(minutes))}m`;
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}
