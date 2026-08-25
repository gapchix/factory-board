/**
 * Deciding what a map of a factory should show.
 *
 * A base is not a rectangle of stuff. There is the factory, there are the
 * outposts you belted in from a hundred metres away, and there is the one miner
 * you walked half a kilometre to place. Framing all of it shrinks the factory to
 * a smudge in the corner; framing only the dense middle silently drops buildings
 * you did build — including, in the save this was written against, one of four
 * coal generators.
 *
 * So the frame is decided in two steps. Any group of buildings big enough to
 * count as part of the base helps set its extent — otherwise a factory built in
 * two halves would have one half framed and the other declared an outlier. The
 * frame then *grows towards* whatever is near it, absorbing the closest
 * remaining group while it is within reach, and reach scales with what has been
 * framed so far: a big factory reaches further than a small one. Whatever is
 * still out of reach is reported rather than discarded, so the caller can point
 * at it.
 */

import { groupNearby, type Bounds } from './cluster.js';

export interface FrameOptions {
  /** Points this close belong to the same part of the base. Default 80 m. */
  readonly clusterRadiusM?: number;
  /** The frame reaches at least this far for a neighbour. Default 120 m. */
  readonly minReachM?: number;
  /** And further for a large base: this fraction of its longest side. Default 0.6. */
  readonly reachRatio?: number;
}

export interface FrameResult<T> {
  /** Null only when there was nothing to frame. */
  readonly bounds: Bounds | null;
  /** Items the frame covers, in input order. */
  readonly inside: readonly T[];
  /** Items too far away to be worth framing, in input order. */
  readonly outside: readonly T[];
}

const DEFAULT_CLUSTER_RADIUS_M = 80;
const DEFAULT_MIN_REACH_M = 120;
const DEFAULT_REACH_RATIO = 0.6;

/**
 * A group has to be a real part of the base to help set its extent, rather than
 * a shack that drags the frame across the map. Both tests matter: the absolute
 * one stops a pair of buildings counting on a small base, and the relative one
 * stops a five-machine outpost counting against a two-hundred-machine factory.
 */
const MIN_SEED_POINTS = 4;
const SEED_SHARE = 0.2;

function boundsOfPoints(points: readonly { x: number; y: number }[]): Bounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

export function unionBounds(a: Bounds, b: Bounds): Bounds {
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

/** Straight-line distance between two boxes; zero when they touch or overlap. */
export function boundsGap(a: Bounds, b: Bounds): number {
  const dx = Math.max(0, a.minX - b.maxX, b.minX - a.maxX);
  const dy = Math.max(0, a.minY - b.maxY, b.minY - a.maxY);
  return Math.hypot(dx, dy);
}

export function frameContent<T>(
  items: readonly T[],
  position: (item: T) => { x: number; y: number },
  options: FrameOptions = {},
): FrameResult<T> {
  if (items.length === 0) return { bounds: null, inside: [], outside: [] };

  const clusterRadius = options.clusterRadiusM ?? DEFAULT_CLUSTER_RADIUS_M;
  const minReach = options.minReachM ?? DEFAULT_MIN_REACH_M;
  const reachRatio = options.reachRatio ?? DEFAULT_REACH_RATIO;

  const groups = groupNearby(items, position, clusterRadius)
    .map((members) => ({ members, bounds: boundsOfPoints(members.map(position)) }))
    .sort((a, b) => b.members.length - a.members.length);

  const largest = groups[0]!;
  const seedSize = Math.max(MIN_SEED_POINTS, SEED_SHARE * largest.members.length);
  const seeds = new Set(
    // The largest group is always a seed, however small the base is.
    [largest, ...groups.slice(1).filter((group) => group.members.length >= seedSize)],
  );
  const pending = groups.filter((group) => !seeds.has(group));
  let bounds = [...seeds].reduce((box, group) => unionBounds(box, group.bounds), largest.bounds);

  // Absorb the nearest group still within reach, then re-measure: each addition
  // enlarges the frame, which lengthens its reach for the next one.
  for (;;) {
    const reach = Math.max(
      minReach,
      reachRatio * Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY),
    );
    let nearest = -1;
    let nearestGap = Infinity;
    pending.forEach((group, index) => {
      const gap = boundsGap(bounds, group.bounds);
      if (gap < nearestGap) {
        nearestGap = gap;
        nearest = index;
      }
    });
    if (nearest < 0 || nearestGap > reach) break;
    const [absorbed] = pending.splice(nearest, 1);
    bounds = unionBounds(bounds, absorbed!.bounds);
  }

  const exiled = new Set(pending.flatMap((group) => group.members));
  return {
    bounds,
    inside: items.filter((item) => !exiled.has(item)),
    outside: items.filter((item) => exiled.has(item)),
  };
}
