import type { GameDatabase, SolveResult } from '@factory-board/planner';
import type { WorldSnapshot } from '@factory-board/save-reader';
import { describe, expect, it } from 'vitest';
import { powerForPlan } from './power-plan';

/**
 * Real numbers throughout: a Smelter draws 4 MW and an Assembler 15, and a
 * Coal-Powered Generator makes 75 MW off 15 Coal and 45 m³ of Water a minute.
 */
const db = {
  sourceBuildId: 0,
  items: {},
  buildings: {},
  recipes: {},
  milestones: {},
  schematics: {},
  machines: {
    smelter: { id: 'smelter', name: 'Smelter', powerMW: 4 },
    assembler: { id: 'assembler', name: 'Assembler', powerMW: 15 },
  },
  generators: {
    coal: {
      id: 'coal',
      name: 'Coal-Powered Generator',
      powerMW: 75,
      fuels: [
        {
          item: 'Desc_Coal_C',
          ratePerMinute: 15,
          supplemental: { item: 'water', ratePerMinute: 45 },
        },
      ],
    },
    burner: {
      id: 'burner',
      name: 'Biomass Burner',
      powerMW: 30,
      fuels: [{ item: 'biofuel', ratePerMinute: 4 }],
    },
  },
} as unknown as GameDatabase;

/** A generator on a grid, as the save records one. */
const generator = (
  machine: string,
  circuit: number,
  extra: Record<string, unknown> = {},
): Record<string, unknown> => ({
  machine,
  circuit,
  role: 'power',
  fuel: 50,
  ...extra,
});

const solved = (
  lines: { recipe: string; machine: string; machinesToBuild: number }[],
): SolveResult =>
  ({
    lines: lines.map((line) => ({ ...line, recipeName: line.recipe, machinesExact: 0 })),
    rawInputs: {},
    produced: {},
    consumed: {},
    surplus: {},
    totalMachines: 0,
    totalPowerMW: 0,
    warnings: [],
  }) as unknown as SolveResult;

const world = (
  circuits: { id: number; members: number[]; demandMW: number; capacityMW: number }[],
  built: Record<string, number> = {},
  placements: Record<string, unknown>[] = [],
): WorldSnapshot =>
  ({
    sessionName: 'polska',
    playDurationSeconds: 0,
    saveBuildVersion: 0,
    savedAt: null,
    lines: Object.fromEntries(
      Object.entries(built).map(([recipe, count]) => [
        recipe,
        { recipe, machine: 'smelter', count, uptime: 1, clock: 1 },
      ]),
    ),
    buildings: {},
    stored: {},
    placements: placements.map((p) => ({ machine: 'smelter', x: 0, y: 0, z: 0, ...p })),
    paths: [],
    links: [],
    milestones: [],
    circuits,
    phase: null,
    objectCount: 0,
    modded: false,
  }) as unknown as WorldSnapshot;

describe('powerForPlan', () => {
  it('charges only for the machines still to build', () => {
    /*
     * The plan's total is the whole finished factory, and most of it is already
     * drawing power and already counted in what the base draws today. Adding
     * the two totals would charge for the same smelters twice.
     */
    const power = powerForPlan(
      db,
      solved([{ recipe: 'r-ingot', machine: 'smelter', machinesToBuild: 6 }]),
      world([{ id: 0, members: [1], demandMW: 100, capacityMW: 500 }], { 'r-ingot': 4 }),
    );

    // Two smelters left, at 4 MW each.
    expect(power).toMatchObject({ machines: 2, addedMW: 8, nowMW: 100, afterMW: 108 });
  });

  it('puts new machines on the grid their recipe already runs on', () => {
    // More smelters go on the smelters' wires.
    const power = powerForPlan(
      db,
      solved([{ recipe: 'r-ingot', machine: 'smelter', machinesToBuild: 5 }]),
      world(
        [
          { id: 0, members: [1, 2, 3], demandMW: 100, capacityMW: 500 },
          { id: 1, members: [4], demandMW: 4, capacityMW: 30 },
        ],
        { 'r-ingot': 1 },
        [{ recipe: 'r-ingot', circuit: 1 }],
      ),
    );

    const small = power?.grids.find((grid) => grid.id === 1);
    expect(small?.addedMW).toBe(16);
    expect(power?.grids.find((grid) => grid.id === 0)?.addedMW).toBe(0);
  });

  it('puts a recipe nothing runs yet on the biggest grid', () => {
    // Which is the assumption a player makes when they extend a factory, and is
    // said out loud rather than hidden.
    const power = powerForPlan(
      db,
      solved([{ recipe: 'r-new', machine: 'assembler', machinesToBuild: 2 }]),
      world([
        { id: 0, members: [1, 2, 3], demandMW: 100, capacityMW: 500 },
        { id: 1, members: [4], demandMW: 4, capacityMW: 30 },
      ]),
    );

    expect(power?.grids.find((grid) => grid.id === 0)?.addedMW).toBe(30);
  });

  it('names a grid the plan would push past its own generation', () => {
    /*
     * Per grid, because that is where a fuse blows: a base can have one circuit
     * at 105% while the average across everything reads seventy.
     */
    const power = powerForPlan(
      db,
      solved([{ recipe: 'r-ingot', machine: 'assembler', machinesToBuild: 3 }]),
      world(
        [
          { id: 0, members: [1, 2, 3], demandMW: 100, capacityMW: 500 },
          { id: 1, members: [4], demandMW: 20, capacityMW: 30 },
        ],
        {},
        [{ recipe: 'r-ingot', circuit: 1 }],
      ),
    );

    expect(power?.over.map((grid) => grid.id)).toEqual([1]);
    // The base as a whole still looks comfortable, which is the trap.
    expect(power!.afterMW).toBeLessThan(power!.capacityMW);
  });

  /*
   * The bill nothing else on the page charges for. A grid at half its output
   * burns half its fuel — the game throttles generators to the load rather
   * than running some flat out and idling the rest — so the plan's megawatts
   * are also coal a minute.
   */
  it('prices what the generators burn to hold the draw, before and after', () => {
    const power = powerForPlan(
      db,
      solved([{ recipe: 'r-ingot', machine: 'assembler', machinesToBuild: 1 }]),
      world([{ id: 0, members: [0, 1], demandMW: 75, capacityMW: 150 }], {}, [
        generator('coal', 0, { resource: 'Desc_Coal_C' }),
        generator('coal', 0),
      ]),
    );

    const coal = power?.fuel.find((line) => line.item === 'Desc_Coal_C');
    // Two generators at half load: 15 Coal/min between them, not 30.
    expect(coal?.nowPerMinute).toBeCloseTo(15);
    // The one assembler left to build takes the grid to 90 of 150.
    expect(coal?.afterPerMinute).toBeCloseTo(18);
    expect(power?.fuel.find((line) => line.item === 'water')?.afterPerMinute).toBeCloseTo(54);
    expect(power?.unpricedMW).toBe(0);
  });

  /*
   * A generator holding nothing is not producing, and the save's own capacity
   * figure already leaves it out. Charging for its coal would invoice someone
   * for fuel nobody is shovelling.
   */
  it('leaves a generator that has run dry out of the bill', () => {
    const power = powerForPlan(
      db,
      solved([]),
      world([{ id: 0, members: [0, 1], demandMW: 75, capacityMW: 75 }], {}, [
        generator('coal', 0),
        generator('coal', 0, { fuel: 0 }),
      ]),
    );

    expect(power?.fuel.find((line) => line.item === 'Desc_Coal_C')?.nowPerMinute).toBeCloseTo(15);
  });

  /*
   * The HUB's own burner is not in the game's documentation at all, so a base
   * running one reports capacity the database cannot price. Saying how much is
   * better than quietly spreading it over the generators that can be.
   */
  it('says how much of the draw it cannot price', () => {
    const power = powerForPlan(
      db,
      solved([]),
      world([{ id: 0, members: [0], demandMW: 50, capacityMW: 100 }], {}, [generator('coal', 0)]),
    );

    // 100 MW of capacity, 75 of it a generator this database knows.
    expect(power?.unpricedMW).toBeCloseTo(12.5);
  });

  /*
   * What the panel has been unable to say since grids were first read. The
   * answer leads with the generator the grid already runs, not with whatever
   * the arithmetic likes.
   */
  it('says what to build for a grid that goes over, in the currency it already burns', () => {
    const power = powerForPlan(
      db,
      solved([{ recipe: 'r-ingot', machine: 'assembler', machinesToBuild: 4 }]),
      world(
        [
          { id: 0, members: [0], demandMW: 20, capacityMW: 30 },
          { id: 1, members: [1], demandMW: 10, capacityMW: 75 },
        ],
        {},
        [generator('burner', 0), generator('coal', 1)],
      ),
    );

    // 60 MW of assemblers land on grid 0, where the recipe already runs.
    const over = power?.over[0];
    expect(over?.id).toBe(0);
    expect(over?.cover[0]).toMatchObject({
      generator: 'burner',
      count: 2,
      capacityMW: 60,
      fuel: 'biofuel',
    });
    // 50 MW short, and a burner burns 4 Solid Biofuel a minute for its 30.
    expect(over?.cover[0]?.fuelPerMinute).toBeCloseTo(6.67, 2);
    expect(power?.grids.find((grid) => grid.id === 1)?.cover).toEqual([]);
  });

  it('says nothing at all about a world with no power built', () => {
    expect(powerForPlan(db, solved([]), world([]))).toBeNull();
  });

  it('adds nothing when the plan is already standing', () => {
    const power = powerForPlan(
      db,
      solved([{ recipe: 'r-ingot', machine: 'smelter', machinesToBuild: 4 }]),
      world([{ id: 0, members: [1], demandMW: 100, capacityMW: 500 }], { 'r-ingot': 6 }),
    );

    expect(power).toMatchObject({ machines: 0, addedMW: 0, afterMW: 100 });
    expect(power?.over).toEqual([]);
  });
});
