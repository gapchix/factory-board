import type { GameCarrier, GameDatabase, ItemId, MachineId } from './types.js';

/**
 * Whether the factory can physically move and supply what the plan assumes.
 *
 * A plan is a set of rates. Every rate has to travel down a belt and start out
 * of the ground, and both have hard limits the board has never mentioned: it
 * writes *176 Iron Ingot a minute* over a Mk.1 belt that carries sixty, and
 * *300.75 Iron Ore* for a mine of two Miner Mk.1s that cannot exceed 240 even
 * if both nodes were pure.
 *
 * Two limits, and they fail differently.
 *
 * **A belt is a ceiling you can widen.** Too much for one belt is two belts, or
 * one of a better tier — a decision with a cost and an unlock behind it, which
 * is why this offers every tier rather than naming one.
 *
 * **A node is a ceiling you cannot.** More miners need more nodes, and where
 * they are and how pure they are is world-generation data no save contains. So
 * extraction is answered as a *range* — half on impure, double on pure — and
 * never as the single number that would read as a measurement.
 */

/** What the game multiplies a normal node's rate by. */
export const PURITY = { impure: 0.5, normal: 1, pure: 2 } as const;

export interface CarrierNeed {
  readonly carrier: MachineId;
  readonly name: string;
  /** What one of them moves in a minute. */
  readonly ratePerMinute: number;
  /** How many it takes to move the rate asked for. */
  readonly count: number;
}

/**
 * Every belt or pipe that could move `ratePerMinute`, cheapest tier first.
 *
 * Pipes and belts never appear together: an item cannot go down a pipe and m³
 * cannot go on a belt.
 *
 * Two kinds of duplicate are dropped, both of which the database keeps on
 * purpose because a *run in the world* can contain one. A **lift** is a belt
 * that goes up, at its belt's rate. A **Clean Pipeline** is a Pipeline with the
 * flow indicator taken off, at its pipeline's rate. Neither is a decision, and
 * offering "Pipeline Mk.1 or Clean Pipeline Mk.1" as though it were makes the
 * list twice as long and no more useful — so one entry per rate, under the
 * plainer of the names.
 */
export function carriersFor(
  db: GameDatabase,
  ratePerMinute: number,
  options: { readonly fluid?: boolean } = {},
): CarrierNeed[] {
  if (ratePerMinute <= 0) return [];
  const want = options.fluid ? 'pipe' : 'belt';

  const best = new Map<number, GameCarrier>();
  for (const carrier of Object.values(db.carriers)) {
    if (carrier.kind !== want || carrier.ratePerMinute <= 0) continue;
    const held = best.get(carrier.ratePerMinute);
    if (!held || carrier.name.length < held.name.length) best.set(carrier.ratePerMinute, carrier);
  }

  return [...best.values()]
    .sort((a, b) => a.ratePerMinute - b.ratePerMinute)
    .map((carrier) => ({
      carrier: carrier.id,
      name: carrier.name,
      ratePerMinute: carrier.ratePerMinute,
      count: Math.ceil(roundish(ratePerMinute / carrier.ratePerMinute)),
    }));
}

/**
 * Ceilings are unforgiving and floating point is not: 180 / 60 lands on
 * 3.0000000000000004 often enough to ask for a fourth belt to carry nothing.
 */
function roundish(value: number): number {
  const rounded = Math.round(value);
  return Math.abs(value - rounded) < 1e-9 ? rounded : value;
}

export interface ExtractionRange {
  /** What these extractors give on normal nodes, at 100% clock. */
  readonly ratePerMinute: number;
  /** All impure, and all pure — the honest bounds on an unknown. */
  readonly min: number;
  readonly max: number;
  /** False when nothing here stands on a node with a purity, i.e. water. */
  readonly purityVaries: boolean;
  readonly extractors: number;
}

/**
 * What a set of standing extractors can deliver.
 *
 * `null` when the database knows none of them, because a board that says
 * "0/min" about a miner it has never heard of is worse than one that says
 * nothing.
 */
export function extractionFrom(
  db: GameDatabase,
  machines: readonly MachineId[],
): ExtractionRange | null {
  let ratePerMinute = 0;
  let min = 0;
  let max = 0;
  let known = 0;
  let purityVaries = false;

  for (const id of machines) {
    const extractor = db.extractors[id];
    if (!extractor) continue;
    known += 1;
    ratePerMinute += extractor.ratePerMinute;
    if (extractor.purityVaries) {
      purityVaries = true;
      min += extractor.ratePerMinute * PURITY.impure;
      max += extractor.ratePerMinute * PURITY.pure;
    } else {
      min += extractor.ratePerMinute;
      max += extractor.ratePerMinute;
    }
  }

  if (known === 0) return null;
  return { ratePerMinute, min, max, purityVaries, extractors: known };
}

/**
 * The extractors that will pull a given resource, smallest first — what you
 * would have to build to raise a ceiling.
 *
 * A miner names no resources because it takes whatever node it is bolted to,
 * so an empty list means "anything of my form" and the form is what has to
 * match. Reading the empty list as "anything at all" offers a Miner Mk.1 for
 * water.
 */
export function extractorsFor(db: GameDatabase, item: ItemId): MachineId[] {
  const wanted = db.items[item];
  // Only what comes out of the ground comes out of the ground: a miner takes
  // any *solid*, and an Iron Rod is a solid.
  if (!wanted?.isRaw) return [];
  return Object.values(db.extractors)
    .filter((extractor) =>
      extractor.resources.length > 0
        ? extractor.resources.includes(item)
        : extractor.fluid === wanted.isFluid,
    )
    .sort((a, b) => a.ratePerMinute - b.ratePerMinute)
    .map((extractor) => extractor.id);
}
