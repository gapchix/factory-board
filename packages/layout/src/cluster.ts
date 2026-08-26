/**
 * Turning a pile of building coordinates into named areas of a factory.
 *
 * The one non-obvious decision is what gets to *define* a zone. Clustering every
 * placed object does not work: conveyor belts are placed every few metres along
 * their run, so a single belt from a distant miner chain-links two unrelated
 * areas into one blob, and a whole base collapses into a single zone.
 *
 * So machines anchor the zones — they are what a factory cell actually is — and
 * everything else (belts, poles, foundations) is attached afterwards to whichever
 * zone it sits in. Infrastructure then describes zones instead of defining them.
 *
 * The same trap has a second door. Once generators and miners are allowed to
 * anchor zones too, they bridge factory cells the way belts did — sparser, but
 * far enough to reach. Hence passes: each kind of anchor is clustered among its
 * own, in the order the caller gives, and a later pass's cluster that sits
 * inside a zone an earlier pass already found joins that zone rather than
 * redrawing it. A burner among the smelters is part of that cell; a line of
 * them marching out to the coal is a place of its own.
 */

export interface Placement {
  readonly machine: string;
  readonly x: number;
  readonly y: number;
  readonly z?: number | undefined;
  readonly recipe?: string | undefined;
  /**
   * What the caller considers this building to be for. Opaque here — the
   * layout never reads it, it only hands it back on the zone's anchors — but it
   * is what a caller passes a multi-pass clustering on.
   */
  readonly role?: string | undefined;
}

export interface Bounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export interface Zone<T extends Placement = Placement> {
  readonly id: string;
  /** Which pass found it — `'default'` unless the caller named its own. */
  readonly pass: string;
  /** Generic name; callers with a game database rename by dominant product. */
  readonly label: string;
  readonly bounds: Bounds;
  readonly center: { readonly x: number; readonly y: number };
  /** Extent in metres. */
  readonly widthM: number;
  readonly depthM: number;
  /** Machines that define the zone. */
  readonly anchors: readonly T[];
  /** Everything else sitting inside it. */
  readonly attachedCount: number;
  readonly machineCounts: Readonly<Record<string, number>>;
  /** Recipe id → machines running it. */
  readonly recipeCounts: Readonly<Record<string, number>>;
  readonly dominantRecipe: string | undefined;
}

/**
 * One round of clustering, over the anchors it accepts and no others.
 *
 * Passes exist because letting every kind of anchor cluster together lets one
 * kind bridge two zones of another: on a real base, generators and miners
 * dotted between two factory cells chained them into a single 109 m blob.
 * Clustering each kind among its own, in order, keeps the earlier pass's zones
 * exactly as they were.
 */
export interface AnchorPass<T extends Placement = Placement> {
  /** Recorded on every zone this pass produces. */
  readonly id: string;
  readonly accepts: (placement: T) => boolean;
  /** Defaults to the top-level `radiusM`. */
  readonly radiusM?: number;
  /** Defaults to the top-level `minAnchors`. */
  readonly minAnchors?: number;
}

export interface ClusterOptions<T extends Placement = Placement> {
  /**
   * Two machines join the same zone when they are within this many metres.
   * 32 m is about four foundations — machines further apart than that read as
   * separate builds rather than one cell.
   */
  readonly radiusM?: number;
  /** Zones with fewer anchors than this are dropped as strays. Default 2. */
  readonly minAnchors?: number;
  /** What counts as a zone-defining machine. Default: anything with a recipe. */
  readonly isAnchor?: (placement: T) => boolean;
  /**
   * Cluster in rounds rather than all at once, earlier passes first. A
   * placement accepted by two passes belongs to the earlier one, and a later
   * pass's cluster that sits inside an earlier pass's zone joins it instead of
   * becoming a zone of its own. Defaults to a single pass over `isAnchor`.
   */
  readonly passes?: readonly AnchorPass<T>[];
}

export interface ClusterResult<T extends Placement = Placement> {
  readonly zones: readonly Zone<T>[];
  /** Anchors in clusters too small to keep. */
  readonly strays: readonly T[];
  /** Buildings that fell outside every zone. */
  readonly unassignedCount: number;
  readonly bounds: Bounds | null;
}

const DEFAULT_RADIUS_M = 32;
const DEFAULT_MIN_ANCHORS = 2;
const DEFAULT_PASS = 'default';

/** Union–find over anchor indices. */
class DisjointSet {
  private readonly parent: number[];

  constructor(size: number) {
    this.parent = Array.from({ length: size }, (_, i) => i);
  }

  find(a: number): number {
    let root = a;
    while (this.parent[root] !== root) root = this.parent[root]!;
    // Path compression, so repeated lookups stay near-constant.
    let walk = a;
    while (this.parent[walk] !== root) {
      const next = this.parent[walk]!;
      this.parent[walk] = root;
      walk = next;
    }
    return root;
  }

  union(a: number, b: number): void {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA !== rootB) this.parent[rootB] = rootA;
  }
}

/**
 * Single-linkage grouping of arbitrary points, returning groups of the original
 * items. Two items join when they are within `radiusM` of each other, and the
 * relation is transitive — a chain of close items is one group.
 *
 * A grid of one-radius cells keeps this near-linear: any two points within the
 * radius are in the same cell or one of its eight neighbours.
 */
export function groupNearby<T>(
  items: readonly T[],
  position: (item: T) => { x: number; y: number },
  radiusM: number,
): T[][] {
  if (items.length === 0) return [];
  const radius = Math.max(0.0001, radiusM);
  const points = items.map(position);

  const grid = new Map<string, number[]>();
  points.forEach((point, index) => {
    const key = `${Math.floor(point.x / radius)}:${Math.floor(point.y / radius)}`;
    const bucket = grid.get(key);
    if (bucket) bucket.push(index);
    else grid.set(key, [index]);
  });

  const sets = new DisjointSet(items.length);
  const radiusSquared = radius * radius;
  points.forEach((point, index) => {
    const cellX = Math.floor(point.x / radius);
    const cellY = Math.floor(point.y / radius);
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (const other of grid.get(`${cellX + dx}:${cellY + dy}`) ?? []) {
          if (other <= index) continue;
          const candidate = points[other]!;
          const distX = candidate.x - point.x;
          const distY = candidate.y - point.y;
          if (distX * distX + distY * distY <= radiusSquared) sets.union(index, other);
        }
      }
    }
  });

  const grouped = new Map<number, T[]>();
  items.forEach((item, index) => {
    const root = sets.find(index);
    const group = grouped.get(root);
    if (group) group.push(item);
    else grouped.set(root, [item]);
  });
  return [...grouped.values()];
}

function boundsOf(points: readonly Placement[]): Bounds {
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

function contains(bounds: Bounds, x: number, y: number, pad: number): boolean {
  return (
    x >= bounds.minX - pad &&
    x <= bounds.maxX + pad &&
    y >= bounds.minY - pad &&
    y <= bounds.maxY + pad
  );
}

function tally(values: Iterable<string | undefined>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) {
    if (value === undefined) continue;
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

/** A group of anchors on its way to becoming a zone, still being added to. */
interface Cluster<T extends Placement> {
  pass: string;
  passIndex: number;
  anchors: T[];
  bounds: Bounds;
}

/**
 * The zone a later pass's cluster belongs to, if any: the nearest zone from an
 * earlier pass whose footprint already holds every one of its anchors.
 *
 * Every anchor, rather than just the middle one, because that is the
 * difference between a burner standing among the smelters it powers — part of
 * that cell — and a line of them marching out towards the coal, which is a
 * place of its own.
 */
function hostFor<T extends Placement>(
  zones: readonly Cluster<T>[],
  group: readonly T[],
  passIndex: number,
  pad: number,
): Cluster<T> | undefined {
  let best: Cluster<T> | undefined;
  let bestDistance = Infinity;
  for (const zone of zones) {
    if (zone.passIndex >= passIndex) continue;
    if (!group.every((anchor) => contains(zone.bounds, anchor.x, anchor.y, pad))) continue;
    const centerX = (zone.bounds.minX + zone.bounds.maxX) / 2;
    const centerY = (zone.bounds.minY + zone.bounds.maxY) / 2;
    const distX = group[0]!.x - centerX;
    const distY = group[0]!.y - centerY;
    const distance = distX * distX + distY * distY;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = zone;
    }
  }
  return best;
}

/**
 * Single-linkage clustering of the anchors, one pass at a time.
 *
 * Within a pass this is `groupNearby` over the anchors that pass accepts, so
 * it stays linear-ish rather than comparing every pair. Across passes, an
 * earlier pass's zones are left exactly as they were, and a later pass's
 * cluster that sits wholly inside one of them joins it rather than becoming a
 * zone of its own.
 */
export function clusterZones<T extends Placement>(
  placements: readonly T[],
  options: ClusterOptions<T> = {},
): ClusterResult<T> {
  const radius = options.radiusM ?? DEFAULT_RADIUS_M;
  const minAnchors = options.minAnchors ?? DEFAULT_MIN_ANCHORS;
  const isAnchor = options.isAnchor ?? ((p: T) => p.recipe !== undefined);
  const passes = options.passes ?? [{ id: DEFAULT_PASS, accepts: isAnchor }];

  // A placement two passes would both take belongs to the earlier one.
  const claimed = new Array<boolean>(placements.length).fill(false);
  const perPass = passes.map((pass) => {
    const anchors: T[] = [];
    placements.forEach((placement, index) => {
      if (claimed[index] || !pass.accepts(placement)) return;
      claimed[index] = true;
      anchors.push(placement);
    });
    return anchors;
  });
  const others = placements.filter((_, index) => !claimed[index]);

  if (perPass.every((anchors) => anchors.length === 0)) {
    return {
      zones: [],
      strays: [],
      unassignedCount: placements.length,
      bounds: placements.length > 0 ? boundsOf(placements) : null,
    };
  }

  const kept: Cluster<T>[] = [];
  const strays: T[] = [];

  passes.forEach((pass, passIndex) => {
    const groups = groupNearby(perPass[passIndex] ?? [], (p) => p, pass.radiusM ?? radius).sort(
      (a, b) => b.length - a.length,
    );

    for (const group of groups) {
      const host = hostFor(kept, group, passIndex, radius);
      if (host) {
        host.anchors.push(...group);
        host.bounds = boundsOf(host.anchors);
        continue;
      }
      if (group.length >= (pass.minAnchors ?? minAnchors)) {
        kept.push({ pass: pass.id, passIndex, anchors: group, bounds: boundsOf(group) });
      } else {
        strays.push(...group);
      }
    }
  });

  /*
   * An anchor left over is still part of any zone it happens to be standing
   * in: the lone smelter at the edge of a mining outpost belongs to that
   * outpost. What makes a stray is being alone *and* nowhere near anything —
   * which is the thing worth reporting.
   */
  const stranded: T[] = [];
  for (const stray of strays) {
    const host = hostFor(kept, [stray], passes.length, radius);
    if (host) {
      host.anchors.push(stray);
      host.bounds = boundsOf(host.anchors);
    } else {
      stranded.push(stray);
    }
  }

  const zones: Zone<T>[] = kept.map((cluster, index) => {
    const { anchors, bounds } = cluster;
    const recipeCounts = tally(anchors.map((p) => p.recipe));
    const dominantRecipe = Object.entries(recipeCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
    return {
      id: `zone-${index + 1}`,
      pass: cluster.pass,
      label: `Zone ${index + 1}`,
      bounds,
      center: { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 },
      widthM: bounds.maxX - bounds.minX,
      depthM: bounds.maxY - bounds.minY,
      anchors,
      attachedCount: 0,
      machineCounts: tally(anchors.map((p) => p.machine)),
      recipeCounts,
      dominantRecipe,
    };
  });

  // Attach the rest to whichever zone's footprint they sit in, nearest first so
  // a belt between two cells lands on the closer one.
  let unassignedCount = 0;
  const attached = new Array<number>(zones.length).fill(0);
  for (const other of others) {
    let best = -1;
    let bestDistance = Infinity;
    zones.forEach((zone, index) => {
      if (!contains(zone.bounds, other.x, other.y, radius)) return;
      const distX = other.x - zone.center.x;
      const distY = other.y - zone.center.y;
      const distance = distX * distX + distY * distY;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index;
      }
    });
    if (best >= 0) attached[best] = (attached[best] ?? 0) + 1;
    else unassignedCount += 1;
  }

  return {
    zones: zones.map((zone, index) => ({ ...zone, attachedCount: attached[index] ?? 0 })),
    strays: stranded,
    unassignedCount,
    bounds: boundsOf(placements),
  };
}
