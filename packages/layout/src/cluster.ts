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
 */

export interface Placement {
  readonly machine: string;
  readonly x: number;
  readonly y: number;
  readonly z?: number | undefined;
  readonly recipe?: string | undefined;
}

export interface Bounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export interface Zone {
  readonly id: string;
  /** Generic name; callers with a game database rename by dominant product. */
  readonly label: string;
  readonly bounds: Bounds;
  readonly center: { readonly x: number; readonly y: number };
  /** Extent in metres. */
  readonly widthM: number;
  readonly depthM: number;
  /** Machines that define the zone. */
  readonly anchors: readonly Placement[];
  /** Everything else sitting inside it. */
  readonly attachedCount: number;
  readonly machineCounts: Readonly<Record<string, number>>;
  /** Recipe id → machines running it. */
  readonly recipeCounts: Readonly<Record<string, number>>;
  readonly dominantRecipe: string | undefined;
}

export interface ClusterOptions {
  /**
   * Two machines join the same zone when they are within this many metres.
   * 32 m is about four foundations — machines further apart than that read as
   * separate builds rather than one cell.
   */
  readonly radiusM?: number;
  /** Zones with fewer anchors than this are dropped as strays. Default 2. */
  readonly minAnchors?: number;
  /** What counts as a zone-defining machine. Default: anything with a recipe. */
  readonly isAnchor?: (placement: Placement) => boolean;
}

export interface ClusterResult {
  readonly zones: readonly Zone[];
  /** Anchors in clusters too small to keep. */
  readonly strays: readonly Placement[];
  /** Buildings that fell outside every zone. */
  readonly unassignedCount: number;
  readonly bounds: Bounds | null;
}

const DEFAULT_RADIUS_M = 32;
const DEFAULT_MIN_ANCHORS = 2;

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

/**
 * Single-linkage clustering of the anchors, via a grid so it stays linear-ish
 * rather than comparing every pair. Cells are one radius wide, so any two points
 * within the radius are in the same cell or an adjacent one.
 */
export function clusterZones(
  placements: readonly Placement[],
  options: ClusterOptions = {},
): ClusterResult {
  const radius = options.radiusM ?? DEFAULT_RADIUS_M;
  const minAnchors = options.minAnchors ?? DEFAULT_MIN_ANCHORS;
  const isAnchor = options.isAnchor ?? ((p: Placement) => p.recipe !== undefined);

  const anchors = placements.filter(isAnchor);
  const others = placements.filter((p) => !isAnchor(p));

  if (anchors.length === 0) {
    return {
      zones: [],
      strays: [],
      unassignedCount: placements.length,
      bounds: placements.length > 0 ? boundsOf(placements) : null,
    };
  }

  const cellKey = (x: number, y: number) => `${Math.floor(x / radius)}:${Math.floor(y / radius)}`;
  const grid = new Map<string, number[]>();
  anchors.forEach((anchor, index) => {
    const key = cellKey(anchor.x, anchor.y);
    const bucket = grid.get(key);
    if (bucket) bucket.push(index);
    else grid.set(key, [index]);
  });

  const sets = new DisjointSet(anchors.length);
  const radiusSquared = radius * radius;

  anchors.forEach((anchor, index) => {
    const cellX = Math.floor(anchor.x / radius);
    const cellY = Math.floor(anchor.y / radius);
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (const other of grid.get(`${cellX + dx}:${cellY + dy}`) ?? []) {
          if (other <= index) continue;
          const candidate = anchors[other]!;
          const distX = candidate.x - anchor.x;
          const distY = candidate.y - anchor.y;
          if (distX * distX + distY * distY <= radiusSquared) sets.union(index, other);
        }
      }
    }
  });

  const grouped = new Map<number, Placement[]>();
  anchors.forEach((anchor, index) => {
    const root = sets.find(index);
    const group = grouped.get(root);
    if (group) group.push(anchor);
    else grouped.set(root, [anchor]);
  });

  const kept = [...grouped.values()]
    .filter((group) => group.length >= minAnchors)
    .sort((a, b) => b.length - a.length);
  const strays = [...grouped.values()].filter((group) => group.length < minAnchors).flat();

  const zones: Zone[] = kept.map((group, index) => {
    const bounds = boundsOf(group);
    const recipeCounts = tally(group.map((p) => p.recipe));
    const dominantRecipe = Object.entries(recipeCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
    return {
      id: `zone-${index + 1}`,
      label: `Zone ${index + 1}`,
      bounds,
      center: { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 },
      widthM: bounds.maxX - bounds.minX,
      depthM: bounds.maxY - bounds.minY,
      anchors: group,
      attachedCount: 0,
      machineCounts: tally(group.map((p) => p.machine)),
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
    strays,
    unassignedCount,
    bounds: boundsOf(placements),
  };
}
