import {
  carriersFor,
  extractionFrom,
  type CarrierNeed,
  type ExtractionRange,
  type GameDatabase,
  type ItemId,
  type MachineId,
  type RecipeId,
  type SolveResult,
} from '@factory-board/planner';
import type { WorldSnapshot } from '@factory-board/save-reader';

/**
 * What the factory can actually move, read off the belts it is built from.
 *
 * The save gives the whole logistics network as a graph — belts, lifts,
 * splitters and mergers are all buildings, and every connection is declared
 * from both ends ([ADR 18](../../../../docs/adr/0018-the-save-says-what-feeds-what.md)).
 * So the question "is that belt big enough" is answerable rather than
 * estimable, and the first answer the board reached for was wrong: taking the
 * belt *nearest* a line and comparing the whole line's output to it reported
 * two of the reference save's twelve lines as over capacity. Neither is.
 * Four smelters making 30 each on four belts is not 120 on one.
 *
 * So flow is followed rather than guessed at, and only where it is forced:
 *
 * **A run is followed while there is only one way to go.** Out of a machine,
 * along the belt, through mergers — everything that arrives keeps going. At a
 * **splitter the walk stops**, because how much goes each way depends on what
 * the far ends are taking, which is a model rather than a reading.
 *
 * What survives that rule is a set of segments each carrying a rate that has
 * to cross it, whatever else the network does. On the reference save it finds
 * 34 of them, and the busiest is the Screw line sitting at exactly 120 of a
 * Mk.2 belt's 120 — the one run the player has already upgraded by hand,
 * which the board could not have told them to.
 *
 * **Extractors are not sources.** What a miner pulls depends on the purity of
 * the node under it, which is not in any save, so a belt out of a mine carries
 * an unknown and is left out rather than credited with a guess.
 */

export interface Segment {
  /** Index into `placements` of the belt, lift or pipe. */
  readonly at: number;
  readonly carrier: MachineId;
  readonly name: string;
  readonly capacityPerMinute: number;
  /** What has to cross it, at the machines' full rate. */
  readonly carryingPerMinute: number;
  /** The recipes whose output it carries, biggest contribution first. */
  readonly recipes: readonly RecipeId[];
  readonly item: ItemId;
}

/** Guard against a network that loops back on itself. */
const MAX_RUN = 500;

/**
 * Every segment carrying a rate it cannot avoid, busiest share of its capacity
 * first.
 */
export function forcedFlow(db: GameDatabase, snapshot: WorldSnapshot): Segment[] {
  const downstream = new Map<number, number[]>();
  for (const link of snapshot.links) {
    if (link.kind !== 'belt') continue;
    const at = downstream.get(link.from);
    if (at) at.push(link.to);
    else downstream.set(link.from, [link.to]);
  }

  const carrying = new Map<number, { rate: number; by: Map<RecipeId, number>; item: ItemId }>();

  for (const [index, placement] of snapshot.placements.entries()) {
    if (placement.role !== 'production' || !placement.recipe) continue;
    const recipe = db.recipes[placement.recipe];
    const product = recipe?.outputs[0];
    if (!recipe || !product || db.items[product.item]?.isFluid) continue;

    /* One machine's own output, which is what leaves it on one belt. */
    const rate = (product.amount / recipe.durationSeconds) * 60;

    let node = index;
    for (let step = 0; step < MAX_RUN; step += 1) {
      const next = downstream.get(node);
      if (!next || next.length !== 1) break; // a splitter, or the end of the line
      node = next[0]!;

      const machine = snapshot.placements[node]?.machine;
      if (!machine) break;
      const carrier = db.carriers[machine];
      if (!carrier) {
        // Splitters and mergers pass everything through; a machine, a
        // container or anything else is where this run ends.
        if (!isJunction(machine)) break;
        continue;
      }

      const seen = carrying.get(node) ?? { rate: 0, by: new Map(), item: product.item };
      seen.rate += rate;
      seen.by.set(placement.recipe, (seen.by.get(placement.recipe) ?? 0) + rate);
      carrying.set(node, seen);
    }
  }

  const segments: Segment[] = [];
  for (const [at, flow] of carrying) {
    const machine = snapshot.placements[at]!.machine;
    const carrier = db.carriers[machine]!;
    segments.push({
      at,
      carrier: machine,
      name: carrier.name,
      capacityPerMinute: carrier.ratePerMinute,
      carryingPerMinute: flow.rate,
      recipes: [...flow.by.entries()].sort((a, b) => b[1] - a[1]).map(([recipe]) => recipe),
      item: flow.item,
    });
  }
  return segments.sort(
    (a, b) => b.carryingPerMinute / b.capacityPerMinute - a.carryingPerMinute / a.capacityPerMinute,
  );
}

/**
 * A splitter or merger is a hole in the belt, not the end of it.
 *
 * Named by shape rather than by class list so a game update that adds another
 * one behaves. The programmable splitter and the smart splitter are both
 * `ConveyorAttachment*`.
 */
function isJunction(machine: MachineId): boolean {
  return /ConveyorAttachment|PipelineJunction/.test(machine);
}

/**
 * The tightest segment each line's output has to get through, by recipe.
 *
 * A line with several machines has several runs; the one that matters is
 * whichever is closest to full, because that is the one that fills first.
 */
export function tightestPerRecipe(segments: readonly Segment[]): Map<RecipeId, Segment> {
  const best = new Map<RecipeId, Segment>();
  for (const segment of segments) {
    for (const recipe of segment.recipes) {
      const held = best.get(recipe);
      const share = segment.carryingPerMinute / segment.capacityPerMinute;
      if (!held || share > held.carryingPerMinute / held.capacityPerMinute) {
        best.set(recipe, segment);
      }
    }
  }
  return best;
}

/**
 * Which extractors stand on each resource, so a plan's raw inputs can be put
 * against the mine that would have to feed them.
 */
export function standingExtractors(snapshot: WorldSnapshot): Map<ItemId, MachineId[]> {
  const mines = new Map<ItemId, MachineId[]>();
  for (const placement of snapshot.placements) {
    if (placement.role !== 'extraction' || !placement.resource) continue;
    const at = mines.get(placement.resource);
    if (at) at.push(placement.machine);
    else mines.set(placement.resource, [placement.machine]);
  }
  return mines;
}

/* ------------------------------------------------------ the plan, and physics */

export interface MoveRow {
  readonly recipe: RecipeId;
  readonly item: ItemId;
  readonly ratePerMinute: number;
  /** The tightest segment this line's output crosses today, where one exists. */
  readonly today: Segment | null;
  /** Every tier that could carry the plan's rate, cheapest first. */
  readonly needs: readonly CarrierNeed[];
  /** True when what it runs on today could not take the plan's rate. */
  readonly over: boolean;
}

export interface SupplyRow {
  readonly item: ItemId;
  readonly ratePerMinute: number;
  /** What is standing on that resource, or null where nothing is. */
  readonly mine: ExtractionRange | null;
  /** Beyond what the mine could give even with every node pure. */
  readonly impossible: boolean;
  /** Within reach, but only if the nodes are better than normal. */
  readonly tight: boolean;
}

export interface Physics {
  readonly moves: readonly MoveRow[];
  readonly supply: readonly SupplyRow[];
  /** Lines whose rate fits down what already carries them. */
  readonly fine: number;
  /** Carrier tiers standing somewhere in the world — proof you have them. */
  readonly built: ReadonlySet<MachineId>;
}

/**
 * Whether the plan can be moved and fed, against the factory that exists.
 *
 * The board writes rates and has never once said what carries them. On the
 * reference save the plan it produces in a single click asks for 176 Iron
 * Ingot a minute down a Mk.1 belt that takes sixty, and 300.75 Iron Ore out of
 * two Miner Mk.1s that cannot give 240 with both nodes pure.
 *
 * The two are not the same kind of problem, and the panel must not read as
 * though they were: **a belt is a ceiling you widen** by building another or a
 * better one, and **a node is a ceiling you cannot** — more ore needs more
 * nodes, somewhere else, and where they are is not in the save.
 *
 * `null` when there is no world to check against, because the arithmetic alone
 * ("176/min needs three Mk.1 belts") is true of every factory ever planned and
 * is not what this panel is for.
 */
export function physics(
  db: GameDatabase,
  result: SolveResult,
  snapshot: WorldSnapshot,
): Physics | null {
  if (Object.keys(db.carriers).length === 0) return null;

  const tightest = tightestPerRecipe(forcedFlow(db, snapshot));

  /* A tier standing in the world is a tier you have — the same proof the
   * unlock reading takes from a running line (ADR 30). */
  const built = new Set<MachineId>();
  for (const machine of Object.keys(snapshot.buildings)) {
    if (db.carriers[machine]) built.add(machine);
  }

  const moves: MoveRow[] = [];
  let fine = 0;
  for (const line of result.lines) {
    const product = db.recipes[line.recipe]?.outputs[0];
    if (!product) continue;
    const fluid = db.items[product.item]?.isFluid === true;
    const today = tightest.get(line.recipe) ?? null;
    const over = today !== null && line.outputPerMinute > today.capacityPerMinute;

    if (!over) {
      fine += 1;
      continue;
    }
    moves.push({
      recipe: line.recipe,
      item: product.item,
      ratePerMinute: line.outputPerMinute,
      today,
      needs: carriersFor(db, line.outputPerMinute, { fluid }),
      over,
    });
  }

  const mines = standingExtractors(snapshot);
  const supply: SupplyRow[] = Object.entries(result.rawInputs)
    .map(([item, ratePerMinute]) => {
      const mine = extractionFrom(db, mines.get(item) ?? []);
      return {
        item,
        ratePerMinute,
        mine,
        impossible: mine !== null && ratePerMinute > mine.max,
        tight: mine !== null && ratePerMinute > mine.ratePerMinute && ratePerMinute <= mine.max,
      };
    })
    .sort(
      (a, b) => Number(b.impossible) - Number(a.impossible) || b.ratePerMinute - a.ratePerMinute,
    );

  return {
    moves: moves.sort((a, b) => b.ratePerMinute - a.ratePerMinute),
    supply,
    fine,
    built,
  };
}
