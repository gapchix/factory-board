import type { GameDatabase } from '@factory-board/planner';
import type { WorldSnapshot } from '@factory-board/save-reader';
import { itemName } from './format';
import { PHASES } from './phases';

/**
 * A save, reduced to what a session's history needs.
 *
 * Autosaves are already a time series — the game writes one every few minutes
 * and nothing in the ecosystem treats them as one. Keeping them is the whole
 * feature; keeping them *whole* is not. A snapshot is 40 KB of which the
 * placements and routes are almost all, and they answer "where", which is a
 * question the map asks of the present. History asks "how is this going", so it
 * keeps the answer to that and throws the rest away: about a kilobyte a save,
 * a day of play in the space of one snapshot.
 */

export interface LineState {
  readonly count: number;
  readonly uptime: number | null;
}

export interface HistoryPoint {
  readonly session: string;
  /** The session's own clock, and what the series is ordered by. */
  readonly playSeconds: number;
  /** Wall clock, where the header said. */
  readonly savedAt: number | null;
  readonly source: string;
  readonly buildings: number;
  readonly machines: number;
  readonly extractors: number;
  readonly generators: number;
  readonly powerMW: number;
  readonly uptime: number | null;
  readonly milestones: number;
  readonly phase: string | null;
  readonly delivered: Readonly<Record<string, number>>;
  readonly lines: Readonly<Record<string, LineState>>;
}

export function digestOf(db: GameDatabase, snapshot: WorldSnapshot, source: string): HistoryPoint {
  let machines = 0;
  let powerMW = 0;
  let weighted = 0;
  let weight = 0;
  const lines: Record<string, LineState> = {};

  for (const line of Object.values(snapshot.lines)) {
    machines += line.count;
    powerMW += (db.machines[line.machine]?.powerMW ?? 0) * line.count;
    if (line.uptime !== null) {
      weighted += line.uptime * line.count;
      weight += line.count;
    }
    lines[line.recipe] = { count: line.count, uptime: line.uptime };
  }

  let extractors = 0;
  let generators = 0;
  for (const placement of snapshot.placements) {
    if (placement.role === 'extraction') extractors += 1;
    else if (placement.role === 'power') generators += 1;
  }

  return {
    session: snapshot.sessionName,
    playSeconds: Math.round(snapshot.playDurationSeconds),
    savedAt: snapshot.savedAt,
    source,
    buildings: snapshot.placements.length,
    machines,
    extractors,
    generators,
    powerMW,
    uptime: weight > 0 ? weighted / weight : null,
    milestones: snapshot.milestones.length,
    phase: snapshot.phase?.target ?? null,
    delivered: snapshot.phase?.delivered ?? {},
    lines,
  };
}

/* ------------------------------------------------------------ what changed */

export type ChangeKind = 'added' | 'gone' | 'built' | 'removed' | 'stopped' | 'recovered';

export interface LineChange {
  readonly kind: ChangeKind;
  readonly recipe: string;
  readonly name: string;
  /** Machines before and after, for the counts; uptime before and after, for the rest. */
  readonly from: number;
  readonly to: number;
}

export interface Changes {
  readonly playSeconds: number;
  readonly elapsedMs: number | null;
  readonly buildings: number;
  readonly machines: number;
  readonly powerMW: number;
  readonly milestones: number;
  readonly delivered: number;
  readonly lines: readonly LineChange[];
}

/** A line running this well was working; below it, it is not. */
const WORKING = 0.6;
const STOPPED = 0.05;

const nameOf = (db: GameDatabase, recipe: string): string => {
  const product = db.recipes[recipe]?.outputs[0]?.item;
  return product ? itemName(db, product) : (db.recipes[recipe]?.name ?? recipe);
};

/**
 * What happened between two saves.
 *
 * Ordered by what a player would want to be told first: a line that has stopped
 * outranks one that was merely built, because the first costs you production
 * you thought you had and the second is something you already know — you built
 * it.
 */
export function changesBetween(db: GameDatabase, from: HistoryPoint, to: HistoryPoint): Changes {
  const lines: LineChange[] = [];
  const recipes = new Set([...Object.keys(from.lines), ...Object.keys(to.lines)]);

  for (const recipe of recipes) {
    const before = from.lines[recipe];
    const after = to.lines[recipe];
    const name = nameOf(db, recipe);

    if (!before && after) {
      lines.push({ kind: 'added', recipe, name, from: 0, to: after.count });
      continue;
    }
    if (before && !after) {
      lines.push({ kind: 'gone', recipe, name, from: before.count, to: 0 });
      continue;
    }
    if (!before || !after) continue;

    if (after.count !== before.count) {
      lines.push({
        kind: after.count > before.count ? 'built' : 'removed',
        recipe,
        name,
        from: before.count,
        to: after.count,
      });
    }

    // A line that has never been measured is not a line that has stopped.
    if (before.uptime === null || after.uptime === null) continue;
    if (before.uptime >= WORKING && after.uptime <= STOPPED) {
      lines.push({ kind: 'stopped', recipe, name, from: before.uptime, to: after.uptime });
    } else if (before.uptime <= STOPPED && after.uptime >= WORKING) {
      lines.push({ kind: 'recovered', recipe, name, from: before.uptime, to: after.uptime });
    }
  }

  const rank: Record<ChangeKind, number> = {
    stopped: 0,
    gone: 1,
    removed: 2,
    added: 3,
    built: 4,
    recovered: 5,
  };
  lines.sort((a, b) => rank[a.kind] - rank[b.kind] || a.name.localeCompare(b.name));

  const totalDelivered = (point: HistoryPoint) =>
    Object.values(point.delivered).reduce((sum, amount) => sum + amount, 0);

  return {
    playSeconds: to.playSeconds - from.playSeconds,
    elapsedMs: from.savedAt !== null && to.savedAt !== null ? to.savedAt - from.savedAt : null,
    buildings: to.buildings - from.buildings,
    machines: to.machines - from.machines,
    powerMW: to.powerMW - from.powerMW,
    milestones: to.milestones - from.milestones,
    delivered: totalDelivered(to) - totalDelivered(from),
    lines,
  };
}

/* --------------------------------------------------------------- burn-down */

export interface PhaseProgress {
  readonly label: string;
  /** 0–1 of the whole phase, counted across every item it asks for. */
  readonly share: number;
  readonly items: readonly {
    readonly item: string;
    readonly name: string;
    readonly delivered: number;
    readonly required: number;
  }[];
  /**
   * Play seconds until the phase is done at the rate of the recent past, or
   * null when nothing has been delivered in the window to measure.
   */
  readonly secondsLeft: number | null;
}

/** Share of a phase delivered at that point, counting every item it asks for. */
function shareOf(point: HistoryPoint, phase: string): number {
  const required = PHASES[phase]?.requires;
  if (!required) return 0;
  let delivered = 0;
  let total = 0;
  for (const [item, amount] of Object.entries(required)) {
    delivered += Math.min(point.delivered[item] ?? 0, amount);
    total += amount;
  }
  return total > 0 ? delivered / total : 0;
}

/**
 * The current phase, how far through it the latest save is, and how long the
 * rest will take at the rate of the last stretch.
 *
 * The estimate is deliberately naive — a straight line through the window — and
 * says nothing at all when the window shows no progress. A projection built on
 * one delivery is worse than no projection.
 */
export function phaseProgress(
  db: GameDatabase,
  points: readonly HistoryPoint[],
): PhaseProgress | null {
  const latest = points[points.length - 1];
  if (!latest?.phase) return null;
  const definition = PHASES[latest.phase];
  if (!definition) return null;

  const items = Object.entries(definition.requires).map(([item, required]) => ({
    item,
    name: itemName(db, item),
    delivered: Math.min(latest.delivered[item] ?? 0, required),
    required,
  }));

  const share = shareOf(latest, latest.phase);

  // Rate over the same phase only: the moment a phase is delivered the counter
  // resets, and measuring across that boundary reads as going backwards.
  const window = points.filter((point) => point.phase === latest.phase);
  const first = window[0];
  let secondsLeft: number | null = null;
  if (first && first !== latest && share < 1) {
    const gained = share - shareOf(first, latest.phase);
    const seconds = latest.playSeconds - first.playSeconds;
    if (gained > 0 && seconds > 0) secondsLeft = Math.round(((1 - share) * seconds) / gained);
  }

  return { label: definition.label, share, items, secondsLeft };
}
