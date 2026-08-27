import { boundsGap, groupNearby, unionBounds, type Bounds } from '@factory-board/layout';

/**
 * Which parts of a base are worth drawing beside it rather than in it.
 *
 * A base is a factory plus the places it reaches out to: a pump house on the
 * lake, a mining outpost up the hill, a smelting wing belted in from the next
 * plateau. `frameContent` already refuses to frame the furthest of them
 * ([ADR 11](../../../../docs/adr/0011-reach-is-bought-with-buildings.md)), and
 * what it refuses becomes an arrow at the edge
 * ([ADR 10](../../../../docs/adr/0010-the-frame-reaches-for-its-content.md)).
 *
 * That leaves the ones it *does* frame, and they are the expensive ones. On the
 * reference save the factory is 151 × 145 m and the frame is 417 × 145 m,
 * because a six-machine copper wing sits 185 m east and a four-building water
 * outpost 194 m west. Both are affordable by reach, and between them they cost
 * the factory more than half the scale it could be drawn at: 5.22 units per
 * metre becomes 2.53. Thirty-six buildings are drawn small so that ten can be
 * drawn in the right place.
 *
 * An atlas has answered this for centuries. The outlying pieces come out of the
 * frame and go in the margin at their own scale, each saying how far away it is
 * and in which direction. Nothing is dropped, nothing is moved, and the main
 * map gets to be about the main thing.
 */

/** Degrees per compass point, on the eight-point rose. */
const POINT = 45;
const ROSE = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;

export type Compass = (typeof ROSE)[number];

export interface Outpost<T> {
  readonly members: readonly T[];
  readonly bounds: Bounds;
  /** From the centre of the main frame to the centre of this, in metres. */
  readonly distanceM: number;
  /** Clockwise from north, 0–360. */
  readonly bearingDeg: number;
  readonly compass: Compass;
}

export interface Lifted<T> {
  /** What the main map frames. Null only when there was nothing to frame. */
  readonly core: Bounds | null;
  readonly inside: readonly T[];
  /** Nearest first, which is the order they are worth reading in. */
  readonly outposts: readonly Outpost<T>[];
}

export interface LiftOptions {
  /** Buildings this close are the same part of the base. Default 80 m. */
  readonly clusterRadiusM?: number;
  /**
   * The share of the map's longest side the core must keep. Default 0.6.
   *
   * The frame's longest side is what sets the scale, so this is a direct
   * bound on how much of itself the factory gives up to include a wing —
   * below three fifths it is being drawn at under two thirds the size it
   * could be.
   */
  readonly minCoreShare?: number;
  /**
   * A group holding this share of the buildings is never lifted. Default 0.2.
   *
   * The same protection `frameContent` gets from its seed rule
   * ([ADR 11](../../../../docs/adr/0011-reach-is-bought-with-buildings.md)):
   * a factory built in two halves must not have one half declared an outpost
   * and put in the margin, however far apart they stand. Cost is the wrong
   * question for something that is half of what you built.
   */
  readonly neverLiftShare?: number;
}

const DEFAULT_CLUSTER_RADIUS_M = 80;
const DEFAULT_MIN_CORE_SHARE = 0.6;
const DEFAULT_NEVER_LIFT_SHARE = 0.2;

function boundsOf(points: readonly { x: number; y: number }[]): Bounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    if (point.x < minX) minX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.x > maxX) maxX = point.x;
    if (point.y > maxY) maxY = point.y;
  }
  return { minX, minY, maxX, maxY };
}

const span = (bounds: Bounds) => Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);

const centreOf = (bounds: Bounds) => ({
  x: (bounds.minX + bounds.maxX) / 2,
  y: (bounds.minY + bounds.maxY) / 2,
});

/**
 * Which way one point lies from another, clockwise from north.
 *
 * The world's +y runs south, the same as the screen's, so north is −y and the
 * bearing is measured from it rather than from the +x axis.
 */
export function bearingOf(from: { x: number; y: number }, to: { x: number; y: number }): number {
  const degrees = (Math.atan2(to.x - from.x, from.y - to.y) * 180) / Math.PI;
  return (degrees + 360) % 360;
}

export function compassOf(bearingDeg: number): Compass {
  return ROSE[Math.round((((bearingDeg % 360) + 360) % 360) / POINT) % ROSE.length]!;
}

/**
 * Split a base into the factory and the outposts to draw beside it.
 *
 * The largest group of buildings is the factory and always stays. Every other
 * group is offered the frame in order of how near it is, and joins only if the
 * factory keeps its share of the map's longest side. A group that cannot pay
 * does not block the ones behind it — a cheap group further out is still worth
 * having, and the expensive near one becomes an outpost either way.
 */
export function liftOutposts<T>(
  items: readonly T[],
  position: (item: T) => { x: number; y: number },
  options: LiftOptions = {},
): Lifted<T> {
  if (items.length === 0) return { core: null, inside: [], outposts: [] };

  const radius = options.clusterRadiusM ?? DEFAULT_CLUSTER_RADIUS_M;
  const minShare = options.minCoreShare ?? DEFAULT_MIN_CORE_SHARE;
  const neverLift = options.neverLiftShare ?? DEFAULT_NEVER_LIFT_SHARE;

  const groups = groupNearby(items, position, radius)
    .map((members) => ({ members, bounds: boundsOf(members.map(position)) }))
    .sort((a, b) => b.members.length - a.members.length);

  const core = groups[0]!;
  // A base of one piece has no margin to fill, and a single group can never
  // fail its own test.
  if (groups.length === 1) {
    return { core: core.bounds, inside: items, outposts: [] };
  }

  const coreSpan = Math.max(1e-6, span(core.bounds));
  const substantial = neverLift * items.length;
  let frame = core.bounds;
  const pending = groups.slice(1);

  for (;;) {
    let nearest = -1;
    let nearestGap = Infinity;
    pending.forEach((group, index) => {
      const grown = unionBounds(frame, group.bounds);
      const affordable = coreSpan / Math.max(1e-6, span(grown)) >= minShare;
      // A group too big to be a margin note is framed whatever it costs.
      if (!affordable && group.members.length < substantial) return;
      const gap = boundsGap(frame, group.bounds);
      if (gap < nearestGap) {
        nearestGap = gap;
        nearest = index;
      }
    });
    if (nearest < 0) break;
    const [absorbed] = pending.splice(nearest, 1);
    frame = unionBounds(frame, absorbed!.bounds);
  }

  const lifted = new Set(pending.flatMap((group) => group.members));
  return {
    core: frame,
    inside: items.filter((item) => !lifted.has(item)),
    outposts: toOutposts(pending, frame),
  };
}

/**
 * Turn groups of buildings into outposts measured from a frame.
 *
 * Used for what `frameContent` refused to frame at all: those are already
 * known to be out, and only need clustering into places and measuring.
 */
export function outpostsOf<T>(
  items: readonly T[],
  position: (item: T) => { x: number; y: number },
  frame: Bounds,
  options: Pick<LiftOptions, 'clusterRadiusM'> = {},
): Outpost<T>[] {
  if (items.length === 0) return [];
  const radius = options.clusterRadiusM ?? DEFAULT_CLUSTER_RADIUS_M;
  return toOutposts(
    groupNearby(items, position, radius).map((members) => ({
      members,
      bounds: boundsOf(members.map(position)),
    })),
    frame,
  );
}

function toOutposts<T>(
  groups: readonly { members: T[]; bounds: Bounds }[],
  frame: Bounds,
): Outpost<T>[] {
  const centre = centreOf(frame);
  return groups
    .map((group) => {
      const at = centreOf(group.bounds);
      const bearingDeg = bearingOf(centre, at);
      return {
        members: group.members,
        bounds: group.bounds,
        distanceM: Math.hypot(at.x - centre.x, at.y - centre.y),
        bearingDeg,
        compass: compassOf(bearingDeg),
      };
    })
    .sort((a, b) => a.distanceM - b.distanceM);
}
