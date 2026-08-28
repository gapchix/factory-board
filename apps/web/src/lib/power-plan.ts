import type { GameDatabase, SolveResult } from '@factory-board/planner';
import type { WorldSnapshot } from '@factory-board/save-reader';

/**
 * What the factory will draw once the plan is built, and whether it can.
 *
 * The board has had both halves of this for a while and never put them
 * together. The Planner knew its plan draws 344 MW. The Overview knew, since
 * [ADR 25](../../../../docs/adr/0025-a-grid-is-checked-before-a-buffer.md), that
 * the base draws 188 MW of the 550 MW standing. Nobody added them up, so the
 * one question a plan of this size actually raises — *will the lights stay on* —
 * had no answer anywhere on the page.
 *
 * Two rules make the sum honest:
 *
 * **Only what is left to build adds anything.** The plan's total is the whole
 * finished factory, and most of it is already drawing power and already counted
 * in what the base draws today. Adding the plan's total to the base's would
 * charge for the same smelters twice.
 *
 * **Per grid, because that is where a fuse blows.** Satisfactory does not blend
 * circuits; a base can have one grid at 105% while the average reads 70%. New
 * machines are charged to the grid that already carries their recipe — more
 * smelters go on the smelters' wires — and to the largest grid when nothing
 * says otherwise, which is the assumption a player would make and is stated
 * rather than hidden.
 */

export interface GridLoad {
  readonly id: number;
  /** What it draws today. */
  readonly demandMW: number;
  /** What the machines still to build would add to it. */
  readonly addedMW: number;
  readonly capacityMW: number;
  readonly afterMW: number;
  /** True when finishing the plan would ask more of this grid than it can give. */
  readonly over: boolean;
}

export interface PlanPower {
  readonly nowMW: number;
  readonly addedMW: number;
  readonly afterMW: number;
  readonly capacityMW: number;
  /** Machines the plan still calls for, which is what `addedMW` is the cost of. */
  readonly machines: number;
  readonly grids: readonly GridLoad[];
  /** Grids the finished plan would push past their own generation. */
  readonly over: readonly GridLoad[];
}

/**
 * Null when the save has no grids to reason about — a world before any power is
 * built has nothing to say here, and inventing a capacity would be worse than
 * saying nothing.
 */
export function powerForPlan(
  db: GameDatabase,
  result: SolveResult,
  snapshot: WorldSnapshot,
): PlanPower | null {
  if (snapshot.circuits.length === 0) return null;

  /** Recipe → the grid most of its machines already stand on. */
  const gridOf = new Map<string, number>();
  const tally = new Map<string, Map<number, number>>();
  for (const placement of snapshot.placements) {
    if (!placement.recipe || placement.circuit === undefined) continue;
    const counts = tally.get(placement.recipe) ?? new Map<number, number>();
    counts.set(placement.circuit, (counts.get(placement.circuit) ?? 0) + 1);
    tally.set(placement.recipe, counts);
  }
  for (const [recipe, counts] of tally) {
    let best: number | undefined;
    let most = 0;
    for (const [circuit, count] of counts) {
      if (count <= most) continue;
      most = count;
      best = circuit;
    }
    if (best !== undefined) gridOf.set(recipe, best);
  }

  /* Where a recipe nothing has been built for goes: the biggest grid, which is
   * the assumption a player makes when they extend a factory. */
  const biggest = [...snapshot.circuits].sort((a, b) => b.members.length - a.members.length)[0]!;

  const added = new Map<number, number>();
  let addedMW = 0;
  let machines = 0;
  for (const line of result.lines) {
    const toBuild = Math.max(0, line.machinesToBuild - (snapshot.lines[line.recipe]?.count ?? 0));
    if (toBuild === 0) continue;
    const cost = toBuild * (db.machines[line.machine]?.powerMW ?? 0);
    machines += toBuild;
    addedMW += cost;
    const grid = gridOf.get(line.recipe) ?? biggest.id;
    added.set(grid, (added.get(grid) ?? 0) + cost);
  }

  const grids: GridLoad[] = snapshot.circuits
    .map((circuit) => {
      const extra = added.get(circuit.id) ?? 0;
      const afterMW = circuit.demandMW + extra;
      return {
        id: circuit.id,
        demandMW: circuit.demandMW,
        addedMW: extra,
        capacityMW: circuit.capacityMW,
        afterMW,
        over: afterMW > circuit.capacityMW,
      };
    })
    .sort((a, b) => b.afterMW - a.afterMW);

  const nowMW = snapshot.circuits.reduce((total, circuit) => total + circuit.demandMW, 0);
  const capacityMW = snapshot.circuits.reduce((total, circuit) => total + circuit.capacityMW, 0);

  return {
    nowMW,
    addedMW,
    afterMW: nowMW + addedMW,
    capacityMW,
    machines,
    grids,
    over: grids.filter((grid) => grid.over),
  };
}
