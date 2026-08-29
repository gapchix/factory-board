import {
  fuelToCarry,
  generatorsToCover,
  type FuelChoice,
  type GameDatabase,
  type GeneratorCover,
  type ItemId,
  type SolveResult,
} from '@factory-board/planner';
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
 *
 * And since the database learned what a generator burns, two more:
 *
 * **A grid that goes over says what would fix it.** The panel has been telling
 * people to "build generators there" since grids were first read, without
 * knowing what a generator is. It now names one, counts them, and prices the
 * fuel — leading with whatever that grid already burns.
 *
 * **Power is an input like ore.** Generators throttle to the load on their
 * grid and burn fuel in proportion, so the megawatts a plan adds are also coal
 * a minute that nothing else on the page charges for. On the reference save
 * the Phase 2 plan's own coal comes to 124/min and the coal to run it another
 * 69 — more than half again, absent from every figure the board had.
 */

/** What the generators on the base burn, before and after the plan is built. */
export interface FuelLine {
  readonly item: ItemId;
  readonly nowPerMinute: number;
  readonly afterPerMinute: number;
}

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
  /**
   * Ways to close the gap, best first — empty unless the grid is `over`.
   *
   * Led by what this grid already burns, then by what the rest of the base
   * does, because a base running coal wants another coal generator and not its
   * first reactor.
   */
  readonly cover: readonly GeneratorCover[];
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
  /** What the generators burn to hold that draw, by item. Fuel and water. */
  readonly fuel: readonly FuelLine[];
  /** And what they hand back — nuclear waste, and nothing else in the game. */
  readonly byproducts: readonly FuelLine[];
  /**
   * Draw carried by generators the database cannot price, in MW.
   *
   * The HUB's own burner is one: it is not in `Docs.json` at all, so a base
   * with nothing else would report a fuel bill of zero. Better to leave the
   * megawatts out of the bill and say they are missing than to spread them
   * over the generators that can be priced.
   */
  readonly unpricedMW: number;
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

  /*
   * The generators standing on each grid, and what each of them burns.
   *
   * A generator holding no fuel is left out, because the save's own capacity
   * figure leaves it out too — `mDynamicProductionCapacity` is what a grid can
   * supply *now*, not what was built. Counting an empty burner here would
   * charge for coal nobody is shovelling.
   */
  const burnersOn = new Map<number, { choice: FuelChoice; powerMW: number }[]>();
  for (const circuit of snapshot.circuits) {
    const live: { choice: FuelChoice; powerMW: number }[] = [];
    for (const index of circuit.members) {
      const placement = snapshot.placements[index];
      if (!placement || placement.role !== 'power' || (placement.fuel ?? 0) <= 0) continue;
      const generator = db.generators[placement.machine];
      if (!generator) continue;
      live.push({
        choice: {
          generator: placement.machine,
          ...(placement.resource ? { fuel: placement.resource } : {}),
        },
        powerMW: generator.powerMW,
      });
    }
    burnersOn.set(circuit.id, live);
  }

  /** Every generator/fuel pair the base runs, commonest first — the fallback. */
  const acrossBase = new Map<string, { choice: FuelChoice; count: number }>();
  for (const live of burnersOn.values()) {
    for (const burner of live) {
      const key = `${burner.choice.generator}|${burner.choice.fuel ?? ''}`;
      const seen = acrossBase.get(key);
      if (seen) seen.count += 1;
      else acrossBase.set(key, { choice: burner.choice, count: 1 });
    }
  }
  const baseChoices = [...acrossBase.values()]
    .sort((a, b) => b.count - a.count)
    .map((entry) => entry.choice);

  /*
   * And for a generator the base does not run, the fuel it could actually get.
   *
   * The game's own first fuel is the wrong answer for the one generator every
   * new save has: a Biomass Burner's list opens with Leaves, so covering
   * 240 MW read as *876 Leaves a minute*. The world knows better — take the
   * first of the generator's fuels the base mines, makes, or has in a box, and
   * fall back to the game's order only when it has none of them.
   */
  const onHand = new Set<ItemId>();
  for (const [item, count] of Object.entries(snapshot.stored)) {
    if (count > 0) onHand.add(item);
  }
  for (const recipe of Object.keys(snapshot.lines)) {
    for (const output of db.recipes[recipe]?.outputs ?? []) onHand.add(output.item);
  }
  for (const placement of snapshot.placements) {
    if (placement.role === 'extraction' && placement.resource) onHand.add(placement.resource);
  }

  const fuels: Record<string, ItemId> = {};
  for (const generator of Object.values(db.generators)) {
    const known = generator.fuels.find((fuel) => onHand.has(fuel.item));
    if (known) fuels[generator.id] = known.item;
  }

  /** now[item] and after[item], accumulated grid by grid. */
  const fuelNow = new Map<ItemId, number>();
  const fuelAfter = new Map<ItemId, number>();
  const wasteNow = new Map<ItemId, number>();
  const wasteAfter = new Map<ItemId, number>();
  let unpricedMW = 0;

  const grids: GridLoad[] = snapshot.circuits
    .map((circuit) => {
      const extra = added.get(circuit.id) ?? 0;
      const afterMW = circuit.demandMW + extra;
      const live = burnersOn.get(circuit.id) ?? [];

      /*
       * Every generator on a circuit runs at the same share of its own output —
       * the game spreads the load rather than running some flat out and idling
       * the rest — so one fraction prices the whole grid. Capped at 1: a grid
       * asked for more than it can give browns out, it does not burn harder.
       */
      const priceable = live.reduce((total, burner) => total + burner.powerMW, 0);
      const shareOf = (drawMW: number) =>
        circuit.capacityMW > 0 ? Math.min(1, drawMW / circuit.capacityMW) : 0;

      for (const [drawMW, fuelInto, wasteInto] of [
        [circuit.demandMW, fuelNow, wasteNow],
        [afterMW, fuelAfter, wasteAfter],
      ] as const) {
        const load = shareOf(drawMW);
        for (const burner of live) {
          const burn = fuelToCarry(db, burner.choice, burner.powerMW * load);
          if (!burn) continue;
          fuelInto.set(burn.fuel, (fuelInto.get(burn.fuel) ?? 0) + burn.fuelPerMinute);
          if (burn.supplemental) {
            const { item, ratePerMinute } = burn.supplemental;
            fuelInto.set(item, (fuelInto.get(item) ?? 0) + ratePerMinute);
          }
          if (burn.byproduct) {
            const { item, ratePerMinute } = burn.byproduct;
            wasteInto.set(item, (wasteInto.get(item) ?? 0) + ratePerMinute);
          }
        }
      }

      // What the priced generators cannot account for, at today's draw.
      unpricedMW += Math.max(0, (circuit.capacityMW - priceable) * shareOf(circuit.demandMW));

      const over = afterMW > circuit.capacityMW;
      return {
        id: circuit.id,
        demandMW: circuit.demandMW,
        addedMW: extra,
        capacityMW: circuit.capacityMW,
        afterMW,
        over,
        cover: over
          ? generatorsToCover(db, afterMW - circuit.capacityMW, {
              prefer: [...live.map((burner) => burner.choice), ...baseChoices],
              fuels,
            })
          : [],
      };
    })
    .sort((a, b) => b.afterMW - a.afterMW);

  const bill = (now: Map<ItemId, number>, after: Map<ItemId, number>): FuelLine[] =>
    [...new Set([...now.keys(), ...after.keys()])]
      .map((item) => ({
        item,
        nowPerMinute: now.get(item) ?? 0,
        afterPerMinute: after.get(item) ?? 0,
      }))
      .sort((a, b) => b.afterPerMinute - a.afterPerMinute);

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
    fuel: bill(fuelNow, fuelAfter),
    byproducts: bill(wasteNow, wasteAfter),
    unpricedMW,
  };
}
