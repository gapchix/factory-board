import type { GameDatabase, SolveResult } from '@factory-board/planner';
import type { WorldSnapshot } from '@factory-board/save-reader';
import { describe, expect, it } from 'vitest';
import { buildOrder } from './build-order';

/**
 * A steel chain over an iron one, which is the shape the reference save has:
 * ore and ingots exist, and nothing downstream of steel does.
 */
const db = {
  sourceBuildId: 0,
  buildings: {},
  milestones: {},
  items: {
    ore: { id: 'ore', name: 'Iron Ore', isRaw: true, isFluid: false },
    ingot: { id: 'ingot', name: 'Iron Ingot', isRaw: false, isFluid: false },
    steel: { id: 'steel', name: 'Steel Ingot', isRaw: false, isFluid: false },
    beam: { id: 'beam', name: 'Steel Beam', isRaw: false, isFluid: false },
    frame: { id: 'frame', name: 'Modular Frame', isRaw: false, isFluid: false },
  },
  machines: {
    smelter: { id: 'smelter', name: 'Smelter', powerMW: 4 },
    foundry: { id: 'foundry', name: 'Foundry', powerMW: 16 },
    constructor: { id: 'constructor', name: 'Constructor', powerMW: 4 },
    assembler: { id: 'assembler', name: 'Assembler', powerMW: 15 },
  },
  recipes: {
    'r-ingot': {
      id: 'r-ingot',
      name: 'Iron Ingot',
      durationSeconds: 2,
      machine: 'smelter',
      inputs: [{ item: 'ore', amount: 1 }],
      outputs: [{ item: 'ingot', amount: 1 }],
      isAlternate: false,
    },
    'r-steel': {
      id: 'r-steel',
      name: 'Steel Ingot',
      durationSeconds: 4,
      machine: 'foundry',
      inputs: [{ item: 'ore', amount: 3 }],
      outputs: [{ item: 'steel', amount: 3 }],
      isAlternate: false,
    },
    'r-beam': {
      id: 'r-beam',
      name: 'Steel Beam',
      durationSeconds: 4,
      machine: 'constructor',
      inputs: [{ item: 'steel', amount: 4 }],
      outputs: [{ item: 'beam', amount: 1 }],
      isAlternate: false,
    },
    'r-frame': {
      id: 'r-frame',
      name: 'Modular Frame',
      durationSeconds: 60,
      machine: 'assembler',
      inputs: [
        { item: 'beam', amount: 3 },
        { item: 'ingot', amount: 12 },
      ],
      outputs: [{ item: 'frame', amount: 2 }],
      isAlternate: false,
    },
  },
} as unknown as GameDatabase;

const solved = (recipes: { recipe: string; machine: string; machinesToBuild: number }[]) =>
  ({ lines: recipes }) as unknown as SolveResult;

const world = (built: Record<string, { machine: string; count: number }>): WorldSnapshot =>
  ({
    lines: Object.fromEntries(
      Object.entries(built).map(([recipe, line]) => [
        recipe,
        { recipe, machine: line.machine, count: line.count, uptime: 1, clock: 1 },
      ]),
    ),
  }) as unknown as WorldSnapshot;

const plan = solved([
  { recipe: 'r-ingot', machine: 'smelter', machinesToBuild: 6 },
  { recipe: 'r-steel', machine: 'foundry', machinesToBuild: 3 },
  { recipe: 'r-beam', machine: 'constructor', machinesToBuild: 2 },
  { recipe: 'r-frame', machine: 'assembler', machinesToBuild: 2 },
]);

describe('buildOrder', () => {
  it('puts what unblocks the most first', () => {
    /*
     * Nothing makes steel, so a Steel Beam constructor built today sits idle,
     * and so does the Modular Frame assembler behind it. Steel Ingot is the
     * only one of the three worth placing first, and it is worth placing first
     * *because* of the two behind it.
     */
    const order = buildOrder(db, plan, world({ 'r-ingot': { machine: 'smelter', count: 4 } }));

    expect(order[0]).toMatchObject({ name: 'Steel Ingot', ready: true });
    expect(order[0]?.unlocks).toEqual(['Modular Frame', 'Steel Beam']);
  });

  it('calls a step ready when what it eats already arrives from somewhere', () => {
    // Iron ore is raw and iron ingots are already being made, so more smelters
    // will run the moment they are placed.
    const order = buildOrder(db, plan, world({ 'r-ingot': { machine: 'smelter', count: 4 } }));

    expect(order.find((step) => step.name === 'Iron Ingot')?.ready).toBe(true);
  });

  it('says what a blocked step is waiting for', () => {
    const order = buildOrder(db, plan, world({ 'r-ingot': { machine: 'smelter', count: 4 } }));

    expect(order.find((step) => step.name === 'Modular Frame')).toMatchObject({
      ready: false,
      blockedBy: ['Steel Beam'],
    });
    expect(order.find((step) => step.name === 'Steel Beam')?.blockedBy).toEqual(['Steel Ingot']);
  });

  it('unblocks a step once the thing it waits for is standing', () => {
    // The test that matters: this is a claim about the *world*, not the plan.
    // Build one foundry and Steel Beam stops being blocked.
    const order = buildOrder(
      db,
      plan,
      world({
        'r-ingot': { machine: 'smelter', count: 4 },
        'r-steel': { machine: 'foundry', count: 1 },
      }),
    );

    expect(order.find((step) => step.name === 'Steel Beam')?.ready).toBe(true);
  });

  it('leaves out what is already built', () => {
    const order = buildOrder(
      db,
      plan,
      world({
        'r-ingot': { machine: 'smelter', count: 6 },
        'r-steel': { machine: 'foundry', count: 3 },
      }),
    );

    expect(order.map((step) => step.name)).not.toContain('Iron Ingot');
    expect(order.map((step) => step.name)).not.toContain('Steel Ingot');
  });

  it('counts only what is missing', () => {
    const order = buildOrder(db, plan, world({ 'r-ingot': { machine: 'smelter', count: 4 } }));

    expect(order.find((step) => step.name === 'Iron Ingot')?.count).toBe(2);
  });

  it('says nothing about a plan that is already standing', () => {
    const order = buildOrder(
      db,
      plan,
      world({
        'r-ingot': { machine: 'smelter', count: 6 },
        'r-steel': { machine: 'foundry', count: 3 },
        'r-beam': { machine: 'constructor', count: 2 },
        'r-frame': { machine: 'assembler', count: 2 },
      }),
    );

    expect(order).toEqual([]);
  });
});
