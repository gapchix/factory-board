import { solve, type GameDatabase, type ProductionTarget } from '@factory-board/planner';
import { machineName } from './format';
import { zoneAt, type ZonePoint, type ZoneView } from './zones';

/**
 * The plan, laid over the base: which zone each target is to be built in, and
 * what is still missing there.
 *
 * "Build six more smelters" is only half an instruction. The other half is
 * where, and the base already knows what is standing in each zone, so the two
 * together give a number you can act on without walking the factory.
 */

export interface ZoneWork {
  readonly recipe: string;
  /** What the line makes, and what it makes it in. */
  readonly name: string;
  readonly machine: string;
  /** Machines the plan calls for here. */
  readonly needed: number;
  /** Machines already running this recipe in this zone. */
  readonly built: number;
}

export interface ZonePlanEntry {
  readonly targets: readonly string[];
  readonly work: readonly ZoneWork[];
  readonly needed: number;
  readonly built: number;
  readonly toBuild: number;
}

export interface ZonePlan {
  /** Zone id → the work assigned to it. */
  readonly byZone: ReadonlyMap<string, ZonePlanEntry>;
  /** Recipe → the zones its machines are meant to go in. */
  readonly byRecipe: ReadonlyMap<string, readonly string[]>;
  /** Targets with nowhere to go yet. */
  readonly unassigned: readonly string[];
}

const EMPTY: ZonePlan = { byZone: new Map(), byRecipe: new Map(), unassigned: [] };

export function planByZone(
  db: GameDatabase,
  targets: readonly ProductionTarget[],
  recipeChoices: Readonly<Record<string, string>>,
  assignments: Readonly<Record<string, ZonePoint>>,
  zones: readonly ZoneView[],
): ZonePlan {
  if (targets.length === 0) return EMPTY;

  interface Accumulator {
    targets: string[];
    /** Recipe → fractional machines, summed before rounding. */
    exact: Map<string, number>;
  }

  const accumulated = new Map<string, Accumulator>();
  const byRecipe = new Map<string, string[]>();
  const unassigned: string[] = [];

  for (const target of targets) {
    const zone = zoneAt(zones, assignments[target.item]);
    if (!zone) {
      unassigned.push(target.item);
      continue;
    }

    /*
     * One solve per target, rather than one for the whole plan, because the
     * question is which target puts machines where. Targets sharing a zone are
     * then rounded up together — two lines in the same cell share a machine,
     * two lines in different cells cannot.
     */
    const result = solve(db, [target], { recipeChoices });
    const entry: Accumulator = accumulated.get(zone.id) ?? { targets: [], exact: new Map() };
    entry.targets.push(target.item);
    for (const line of result.lines) {
      entry.exact.set(line.recipe, (entry.exact.get(line.recipe) ?? 0) + line.machinesExact);
      const zonesForRecipe = byRecipe.get(line.recipe) ?? [];
      if (!zonesForRecipe.includes(zone.id)) zonesForRecipe.push(zone.id);
      byRecipe.set(line.recipe, zonesForRecipe);
    }
    accumulated.set(zone.id, entry);
  }

  const byZone = new Map<string, ZonePlanEntry>();
  for (const [zoneId, entry] of accumulated) {
    const zone = zones.find((candidate) => candidate.id === zoneId);
    const work: ZoneWork[] = [];
    let needed = 0;
    let built = 0;

    for (const [recipe, exact] of entry.exact) {
      const count = Math.ceil(exact - 1e-9);
      const here = zone?.recipeCounts[recipe] ?? 0;
      const product = db.recipes[recipe]?.outputs[0]?.item;
      work.push({
        recipe,
        name: product ? (db.items[product]?.name ?? product) : recipe,
        machine: machineName(db, db.recipes[recipe]?.machine ?? ''),
        needed: count,
        built: here,
      });
      needed += count;
      built += Math.min(here, count);
    }

    work.sort((a, b) => b.needed - b.built - (a.needed - a.built) || b.needed - a.needed);
    byZone.set(zoneId, {
      targets: entry.targets,
      work,
      needed,
      built,
      toBuild: Math.max(0, needed - built),
    });
  }

  return { byZone, byRecipe, unassigned };
}
