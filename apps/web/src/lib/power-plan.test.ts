import type { GameDatabase, SolveResult } from '@factory-board/planner';
import type { WorldSnapshot } from '@factory-board/save-reader';
import { describe, expect, it } from 'vitest';
import { powerForPlan } from './power-plan';

/** Real draws: a Smelter is 4 MW and an Assembler 15 MW. */
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
} as unknown as GameDatabase;

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
  placements: { recipe: string; circuit: number }[] = [],
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
