import type { GameDatabase } from '@factory-board/planner';
import type { WorldSnapshot } from '@factory-board/save-reader';
import { buildingName, itemName } from './format';

/**
 * What feeds a machine, and what it feeds.
 *
 * The save records every connection from both ends, so this is the factory's
 * real wiring rather than a guess from which belt happens to end near which
 * machine. Following it answers the question the board exists for and could
 * not previously answer: *why* is this line at 60%? Walk upstream until
 * something is running worse than the thing you asked about, and that is the
 * answer — usually a miner half a kilometre away.
 *
 * Belts, splitters and mergers are walked *through* rather than counted: they
 * carry things, they do not make them. So "two hops upstream" means two
 * machines back, however much conveyor is in between.
 */

export interface ChainStep {
  /** Index into `snapshot.placements`. */
  readonly index: number;
  /** Machines between this and the one that was asked about. */
  readonly hops: number;
  /** What it makes, or what it is. */
  readonly name: string;
  /** What it is made in, or what it handles. */
  readonly detail: string;
  readonly uptime: number | null;
}

export interface Chain {
  readonly origin: ChainStep;
  /** Machines feeding it, nearest first. */
  readonly upstream: readonly ChainStep[];
  /** Machines it feeds, nearest first. */
  readonly downstream: readonly ChainStep[];
  /** Everything in the chain, belts and fittings included, for the drawing. */
  readonly members: ReadonlySet<number>;
  /**
   * The worst-running thing upstream, when something upstream is running worse
   * than the machine asked about. Null when the supply is healthy — which is
   * an answer too: the problem is here, not behind.
   */
  readonly weakest: ChainStep | null;
}

/** Far enough to cross any real base; a guard against a pathological walk. */
const MAX_MEMBERS = 4000;

export function uptimeOf(snapshot: WorldSnapshot, index: number): number | null {
  const placement = snapshot.placements[index];
  if (!placement) return null;
  if (placement.uptime !== undefined) return placement.uptime;
  return placement.recipe ? (snapshot.lines[placement.recipe]?.uptime ?? null) : null;
}

/** Whether this is something that makes, mines or burns — rather than carries. */
function isMachine(snapshot: WorldSnapshot, index: number): boolean {
  return snapshot.placements[index]?.role !== undefined;
}

function describe(
  db: GameDatabase,
  snapshot: WorldSnapshot,
  index: number,
  hops: number,
): ChainStep {
  const placement = snapshot.placements[index];
  const machine = placement ? buildingName(db, placement.machine) : '';
  const product = placement?.recipe ? db.recipes[placement.recipe]?.outputs[0]?.item : undefined;
  const resource = placement?.resource ? itemName(db, placement.resource) : undefined;
  return {
    index,
    hops,
    name: product ? itemName(db, product) : machine,
    detail: placement?.recipe ? machine : (resource ?? machine),
    uptime: uptimeOf(snapshot, index),
  };
}

interface Edges {
  readonly feeding: Map<number, number[]>;
  readonly fed: Map<number, number[]>;
}

/**
 * The links, indexed both ways.
 *
 * Pipes go in both maps: which way fluid moves depends on the pumps at either
 * end, so a pipe network is walked in both directions and the water extractor
 * feeding a coal plant is found either way round.
 */
export function edgesOf(snapshot: WorldSnapshot): Edges {
  const feeding = new Map<number, number[]>();
  const fed = new Map<number, number[]>();
  const add = (map: Map<number, number[]>, key: number, value: number) => {
    const list = map.get(key);
    if (list) list.push(value);
    else map.set(key, [value]);
  };
  for (const link of snapshot.links) {
    add(feeding, link.to, link.from);
    add(fed, link.from, link.to);
    if (link.kind === 'pipe') {
      add(feeding, link.from, link.to);
      add(fed, link.to, link.from);
    }
  }
  return { feeding, fed };
}

function walk(
  snapshot: WorldSnapshot,
  edges: Map<number, number[]>,
  origin: number,
  members: Set<number>,
): { index: number; hops: number }[] {
  const found: { index: number; hops: number }[] = [];
  const seen = new Set<number>([origin]);
  let frontier: { index: number; hops: number }[] = [{ index: origin, hops: 0 }];

  while (frontier.length > 0 && members.size < MAX_MEMBERS) {
    const next: { index: number; hops: number }[] = [];
    for (const at of frontier) {
      for (const neighbour of edges.get(at.index) ?? []) {
        if (seen.has(neighbour)) continue;
        seen.add(neighbour);
        members.add(neighbour);
        // A belt is passed through, not counted: hops are machines.
        const machine = isMachine(snapshot, neighbour);
        const hops = machine ? at.hops + 1 : at.hops;
        if (machine) found.push({ index: neighbour, hops });
        next.push({ index: neighbour, hops });
      }
    }
    frontier = next;
  }
  return found;
}

export function traceChain(
  db: GameDatabase,
  snapshot: WorldSnapshot,
  origin: number,
): Chain | null {
  if (!snapshot.placements[origin]) return null;

  const edges = edgesOf(snapshot);
  const members = new Set<number>([origin]);
  const upstream = walk(snapshot, edges.feeding, origin, members)
    .map((found) => describe(db, snapshot, found.index, found.hops))
    .sort((a, b) => a.hops - b.hops || (a.uptime ?? 1) - (b.uptime ?? 1));
  const downstream = walk(snapshot, edges.fed, origin, members)
    .map((found) => describe(db, snapshot, found.index, found.hops))
    .sort((a, b) => a.hops - b.hops || (a.uptime ?? 1) - (b.uptime ?? 1));

  const here = describe(db, snapshot, origin, 0);
  const measured = upstream.filter((step) => step.uptime !== null);
  const worst = measured.reduce<ChainStep | null>(
    (lowest, step) =>
      lowest === null || (step.uptime ?? 1) < (lowest.uptime ?? 1) ? step : lowest,
    null,
  );

  /*
   * Only worth naming when it is actually behind the trouble. A supply running
   * better than the machine asked about explains nothing, and saying "the
   * weakest link is a miner at 98%" would send someone across the map for
   * nothing.
   */
  const weakest =
    worst !== null && (worst.uptime ?? 1) < Math.min(0.95, (here.uptime ?? 1) + 0.02)
      ? worst
      : null;

  return { origin: here, upstream, downstream, members, weakest };
}
