/**
 * Marking direction along a polyline.
 *
 * A belt drawn as a plain line says two machines are joined; it does not say
 * which way the ore moves, which is most of what you want to know when a cell is
 * starving. Chevrons along the run say it — but only if they are evenly spaced
 * along the *route*, not per segment: a belt bends every few metres, and one
 * arrow per segment gives a dense clump at every corner and nothing on the
 * straights.
 */

export interface PathMarker {
  readonly x: number;
  readonly y: number;
  /** Direction of travel here, in radians, measured as `atan2(dy, dx)`. */
  readonly angle: number;
}

export interface SampleOptions {
  /** Runs shorter than this get no marker at all. Default 0. */
  readonly minLength?: number;
}

/**
 * Points spaced roughly `spacing` apart along the polyline, each carrying the
 * direction of the segment it lands on.
 *
 * Spacing is nominal: the count is rounded, then the markers are distributed
 * evenly and inset by half a gap, so a run always gets at least one and they sit
 * symmetrically rather than crowding one end.
 */
export function sampleAlong(
  points: readonly (readonly [number, number])[],
  spacing: number,
  options: SampleOptions = {},
): PathMarker[] {
  if (points.length < 2 || spacing <= 0) return [];

  const segments: { x: number; y: number; dx: number; dy: number; length: number }[] = [];
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const from = points[i - 1]!;
    const to = points[i]!;
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const length = Math.hypot(dx, dy);
    if (length === 0) continue;
    segments.push({ x: from[0], y: from[1], dx, dy, length });
    total += length;
  }
  if (total === 0 || total < (options.minLength ?? 0)) return [];

  const count = Math.max(1, Math.round(total / spacing));
  const step = total / count;

  const markers: PathMarker[] = [];
  let segment = 0;
  let travelled = 0;
  for (let i = 0; i < count; i += 1) {
    const target = (i + 0.5) * step;
    while (segment < segments.length - 1 && travelled + segments[segment]!.length < target) {
      travelled += segments[segment]!.length;
      segment += 1;
    }
    const current = segments[segment]!;
    const along = Math.min(1, Math.max(0, (target - travelled) / current.length));
    markers.push({
      x: current.x + current.dx * along,
      y: current.y + current.dy * along,
      angle: Math.atan2(current.dy, current.dx),
    });
  }
  return markers;
}

export type Polyline = readonly (readonly [number, number])[];

export interface JoinOptions {
  /**
   * How close one run's end must be to another's start to count as the same
   * joint. Default 1 — coordinates arrive rounded to whole metres, so two ends
   * of the same joint can land a metre apart.
   */
  readonly toleranceM?: number;
}

const cellKey = (x: number, y: number, cell: number) =>
  `${Math.floor(x / cell)}:${Math.floor(y / cell)}`;

/**
 * Joins runs that continue one another into single polylines.
 *
 * A conveyor is a building, and a long belt is a dozen of them. Drawn one
 * object at a time the base's spine reads as confetti — a short stroke with a
 * notch at every join, because each stroke's casing overdraws its neighbour's
 * end — and direction markers land per segment rather than along the route.
 *
 * Two runs are joined only when the link is unambiguous in both directions:
 * exactly one run starts where this one ends, and exactly one run ends there.
 * That is what keeps a splitter a splitter — one belt in and two out is three
 * runs, not an arbitrary pick of two welded together.
 *
 * Nothing else is bridged. Most of the gaps left in a real belt network have a
 * building standing in them — a splitter, a machine — and reaching across those
 * was measured on a real base: it bought one join out of a hundred, because a
 * splitter has two belts leaving it and the link is genuinely ambiguous. Drawing
 * the thing in the gap says more than guessing a line through it.
 *
 * Runs are only ever joined end-to-start, never reversed, because for a belt
 * the point order *is* the direction the items travel.
 */
export function joinRuns(runs: readonly Polyline[], options: JoinOptions = {}): Polyline[] {
  const usable = runs.filter((run) => run.length >= 2);
  if (usable.length === 0) return [];

  const tolerance = Math.max(0, options.toleranceM ?? 1);
  // One cell has to be wide enough that any pair the rule could join is either
  // in it or in one of its eight neighbours.
  const cell = Math.max(tolerance, 0.5);

  const index = <T>(points: readonly T[], at: (item: T) => readonly [number, number]) => {
    const grid = new Map<string, number[]>();
    points.forEach((item, i) => {
      const [x, y] = at(item);
      const key = cellKey(x, y, cell);
      const bucket = grid.get(key);
      if (bucket) bucket.push(i);
      else grid.set(key, [i]);
    });
    return (x: number, y: number): number[] => {
      const found: number[] = [];
      for (let dx = -1; dx <= 1; dx += 1) {
        for (let dy = -1; dy <= 1; dy += 1) {
          for (const i of grid.get(cellKey(x + dx * cell, y + dy * cell, cell)) ?? []) {
            if (!found.includes(i)) found.push(i);
          }
        }
      }
      return found;
    };
  };

  const startsNear = index(usable, (run) => run[0]!);

  const links: { from: number; to: number }[] = [];
  usable.forEach((run, from) => {
    const [x, y] = run[run.length - 1]!;
    for (const to of startsNear(x, y)) {
      if (to === from) continue;
      const [sx, sy] = usable[to]![0]!;
      if (Math.hypot(sx - x, sy - y) <= tolerance) links.push({ from, to });
    }
  });

  const leaving = new Array<number>(usable.length).fill(0);
  const arriving = new Array<number>(usable.length).fill(0);
  for (const link of links) {
    leaving[link.from] = leaving[link.from]! + 1;
    arriving[link.to] = arriving[link.to]! + 1;
  }

  const next = new Array<number>(usable.length).fill(-1);
  for (const link of links) {
    if (leaving[link.from] !== 1 || arriving[link.to] !== 1) continue;
    next[link.from] = link.to;
  }

  const continues = new Array<boolean>(usable.length).fill(false);
  for (const to of next) if (to >= 0) continues[to] = true;

  const used = new Array<boolean>(usable.length).fill(false);
  const walk = (start: number): Polyline => {
    const points: (readonly [number, number])[] = [];
    let at = start;
    while (at >= 0 && !used[at]) {
      used[at] = true;
      const run = usable[at]!;
      // The joint belongs to whichever run reached it first.
      points.push(...(points.length === 0 ? run : run.slice(1)));
      at = next[at]!;
    }
    return points;
  };

  const joined: Polyline[] = [];
  usable.forEach((_, index) => {
    if (!continues[index] && !used[index]) joined.push(walk(index));
  });
  // Anything left is a loop with no beginning; start it anywhere.
  usable.forEach((_, index) => {
    if (!used[index]) joined.push(walk(index));
  });
  return joined;
}
