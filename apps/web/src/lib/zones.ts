import {
  clusterZones,
  type AnchorPass,
  type Bounds,
  type ClusterResult,
} from '@factory-board/layout';
import type { GameDatabase } from '@factory-board/planner';
import type { BuildingPlacement, WorldSnapshot } from '@factory-board/save-reader';
import { buildingName, itemName } from './format';

/**
 * The zones of a base, named and totalled — everything the board says about
 * where things are, in one place, because the map, the zone cards and the
 * planner all have to agree about it.
 *
 * Two things here are load-bearing beyond the arithmetic.
 *
 * **Machines define a zone; miners and burners describe one.** They are
 * clustered in separate passes for that reason — see the layout package for
 * the blob that comes of doing it in one.
 *
 * **A reference to a zone is a point on the ground.** Zone ids are positional,
 * so the next autosave renumbers them, and names are derived from what is
 * built there, so they move too. A coordinate does neither, which is why a
 * hand-given name and a plan target's zone are both stored as a point and
 * resolved against whatever zone is standing there now.
 */

export interface ZonePoint {
  readonly x: number;
  readonly y: number;
}

/** A name the player gave a place, pinned to the ground rather than to a zone. */
export interface ZoneName {
  readonly at: ZonePoint;
  readonly name: string;
}

export type ZoneKind = 'production' | 'extraction' | 'power';

export interface ZoneTally {
  readonly id: string;
  readonly name: string;
  readonly count: number;
}

export interface ZoneView {
  readonly id: string;
  /** What a link to this zone carries. */
  readonly slug: string;
  readonly name: string;
  /** The name the base itself gives this zone, whatever the player calls it. */
  readonly derived: string;
  /** True when the name came from the player rather than from the recipes. */
  readonly renamed: boolean;
  readonly kind: ZoneKind;
  readonly bounds: Bounds;
  /** The point that references to this zone pin themselves to. */
  readonly at: ZonePoint;
  /** Machines running a recipe. */
  readonly machines: number;
  /** Extractors and generators standing in it. */
  readonly support: number;
  readonly extractors: number;
  readonly generators: number;
  readonly powerMW: number;
  readonly uptime: number | null;
  readonly attached: number;
  readonly size: string;
  readonly products: readonly ZoneTally[];
  readonly extracts: readonly ZoneTally[];
  readonly burns: readonly ZoneTally[];
  readonly recipeCounts: Readonly<Record<string, number>>;
}

export interface ZoneBoard {
  readonly zones: readonly ZoneView[];
  readonly cluster: ClusterResult<BuildingPlacement>;
  /** Bounding box of everything placed, as text. */
  readonly spread: string;
}

const PASSES: readonly AnchorPass<BuildingPlacement>[] = [
  { id: 'production', accepts: (placement) => placement.recipe !== undefined },
  // One miner on its own is still somewhere you built — an outpost, not a
  // stray — so support zones are allowed to stand on a single anchor.
  { id: 'support', accepts: (placement) => placement.role !== undefined, minAnchors: 1 },
];

/**
 * How far outside a zone a pinned point still counts as being in it.
 *
 * A point is written down as the zone's centre, so it only drifts as the zone
 * grows around it. Enough slack to survive that, not enough to reach the next
 * zone along.
 */
const PIN_REACH_M = 16;

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function tally(values: Iterable<string | undefined>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) {
    if (value === undefined) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

const ranked = (counts: Map<string, number>): [string, number][] =>
  [...counts.entries()].sort((a, b) => b[1] - a[1]);

const distanceSquared = (a: ZonePoint, b: ZonePoint) =>
  (a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y);

const inside = (bounds: Bounds, at: ZonePoint, pad: number) =>
  at.x >= bounds.minX - pad &&
  at.x <= bounds.maxX + pad &&
  at.y >= bounds.minY - pad &&
  at.y <= bounds.maxY + pad;

/** The zone a pinned point refers to now: nearest of the ones standing on it. */
export function zoneAt(
  zones: readonly ZoneView[],
  at: ZonePoint | undefined,
): ZoneView | undefined {
  if (!at) return undefined;
  let best: ZoneView | undefined;
  let bestDistance = Infinity;
  for (const zone of zones) {
    if (!inside(zone.bounds, at, PIN_REACH_M)) continue;
    const distance = distanceSquared(zone.at, at);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = zone;
    }
  }
  return best;
}

export function zoneBySlug(zones: readonly ZoneView[], slug: string | null): ZoneView | undefined {
  return slug ? zones.find((zone) => zone.slug === slug) : undefined;
}

/**
 * A zone is named after what it is for: the product its machines mostly make,
 * the resource its extractors are pulling, or the fuel its generators burn.
 * "Zone 2" tells you nothing you could not see.
 */
function derivedName(
  db: GameDatabase,
  kind: ZoneKind,
  dominantRecipe: string | undefined,
  machineCounts: Readonly<Record<string, number>>,
  extracts: readonly ZoneTally[],
  burns: readonly ZoneTally[],
  fallback: string,
): string {
  if (kind === 'production') {
    const product = dominantRecipe ? db.recipes[dominantRecipe]?.outputs[0]?.item : undefined;
    return product ? itemName(db, product) : fallback;
  }
  if (kind === 'extraction') {
    const dominantMachine = ranked(new Map(Object.entries(machineCounts)))[0]?.[0];
    return extracts[0]?.name ?? (dominantMachine ? buildingName(db, dominantMachine) : fallback);
  }
  return burns[0] ? `${burns[0].name} Power` : 'Power';
}

export function buildZoneBoard(
  db: GameDatabase,
  snapshot: WorldSnapshot,
  given: readonly ZoneName[] = [],
): ZoneBoard {
  const cluster = clusterZones(snapshot.placements, { passes: PASSES });

  const zones = cluster.zones.map((zone) => {
    const extraction = zone.anchors.filter((anchor) => anchor.role === 'extraction');
    const power = zone.anchors.filter((anchor) => anchor.role === 'power');

    const asTally = (counts: Map<string, number>): ZoneTally[] =>
      ranked(counts).map(([id, count]) => ({ id, name: itemName(db, id), count }));

    const extracts = asTally(tally(extraction.map((anchor) => anchor.resource)));
    const burns = asTally(tally(power.map((anchor) => anchor.resource)));

    let machines = 0;
    let powerMW = 0;
    let weighted = 0;
    let weight = 0;
    const products: ZoneTally[] = [];

    for (const [recipe, count] of Object.entries(zone.recipeCounts)) {
      machines += count;
      const machineId = db.recipes[recipe]?.machine;
      powerMW += count * (machineId ? (db.machines[machineId]?.powerMW ?? 0) : 0);

      const uptime = snapshot.lines[recipe]?.uptime;
      if (uptime != null) {
        weighted += uptime * count;
        weight += count;
      }

      const product = db.recipes[recipe]?.outputs[0]?.item;
      products.push({
        id: product ?? recipe,
        name: product ? itemName(db, product) : recipe,
        count,
      });
    }

    // Extractors and generators run no line, so their measurement rides on the
    // placement. Folding it in is what lets a zone of five fuel-starved coal
    // generators say so.
    for (const anchor of [...extraction, ...power]) {
      if (anchor.uptime === undefined) continue;
      weighted += anchor.uptime;
      weight += 1;
    }

    const kind: ZoneKind =
      machines > 0 ? 'production' : extraction.length >= power.length ? 'extraction' : 'power';

    const auto = derivedName(
      db,
      kind,
      zone.dominantRecipe,
      zone.machineCounts,
      extracts,
      burns,
      zone.label,
    );

    return {
      id: zone.id,
      kind,
      bounds: zone.bounds,
      at: { x: Math.round(zone.center.x), y: Math.round(zone.center.y) },
      machines,
      support: extraction.length + power.length,
      extractors: extraction.length,
      generators: power.length,
      powerMW,
      uptime: weight > 0 ? weighted / weight : null,
      attached: zone.attachedCount,
      size: `${Math.round(zone.widthM)} x ${Math.round(zone.depthM)} m`,
      products: products.sort((a, b) => b.count - a.count),
      extracts,
      burns,
      recipeCounts: zone.recipeCounts,
      name: auto,
      derived: auto,
      renamed: false,
      slug: '',
    };
  });

  // A hand-given name claims one zone: the nearest one standing on its point.
  for (const pinned of given) {
    let best: (typeof zones)[number] | undefined;
    let bestDistance = Infinity;
    for (const zone of zones) {
      if (zone.renamed || !inside(zone.bounds, pinned.at, PIN_REACH_M)) continue;
      const distance = distanceSquared(zone.at, pinned.at);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = zone;
      }
    }
    if (best) {
      best.name = pinned.name;
      best.renamed = true;
    }
  }

  // Two zones making the same thing would collide, in the name and in the link.
  const seen = new Map<string, number>();
  for (const zone of zones) {
    const n = (seen.get(zone.name) ?? 0) + 1;
    seen.set(zone.name, n);
    if (n > 1) zone.name = `${zone.name} ${n}`;
    zone.slug = slugify(zone.name);
  }

  const spread = cluster.bounds
    ? `${Math.round(cluster.bounds.maxX - cluster.bounds.minX)} x ${Math.round(
        cluster.bounds.maxY - cluster.bounds.minY,
      )} m`
    : '-';

  return { zones, cluster, spread };
}

/**
 * The names list with this zone's name set, replaced or cleared.
 *
 * Whatever was pinned inside this zone gives way to the new name, so renaming
 * twice leaves one name rather than two fighting over the same ground.
 */
export function withZoneName(names: readonly ZoneName[], zone: ZoneView, name: string): ZoneName[] {
  const kept = names.filter((entry) => !inside(zone.bounds, entry.at, PIN_REACH_M));
  const trimmed = name.trim().slice(0, 40);
  return trimmed ? [...kept, { at: zone.at, name: trimmed }] : kept;
}
