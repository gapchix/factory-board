import type { GameDatabase, SolveResult } from '@factory-board/planner';
import type { WorldSnapshot } from '@factory-board/save-reader';
import { describe, expect, it } from 'vitest';
import { forcedFlow, physics, standingExtractors } from './throughput';

/** Real rates: a Smelter makes 30 Iron Ingot/min, a Mk.1 belt carries 60. */
const db = {
  sourceBuildId: 0,
  buildings: {},
  milestones: {},
  schematics: {},
  generators: {},
  machines: { smelter: { id: 'smelter', name: 'Smelter', powerMW: 4 } },
  items: {
    ingot: { id: 'ingot', name: 'Iron Ingot', isRaw: false, isFluid: false },
    ore: { id: 'ore', name: 'Iron Ore', isRaw: true, isFluid: false },
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
  },
  carriers: {
    belt1: { id: 'belt1', name: 'Conveyor Belt Mk.1', kind: 'belt', ratePerMinute: 60 },
    belt2: { id: 'belt2', name: 'Conveyor Belt Mk.2', kind: 'belt', ratePerMinute: 120 },
  },
  extractors: {
    miner1: {
      id: 'miner1',
      name: 'Miner Mk.1',
      ratePerMinute: 60,
      purityVaries: true,
      fluid: false,
      resources: [],
    },
  },
} as unknown as GameDatabase;

type Node = Record<string, unknown>;
const smelter = (): Node => ({ machine: 'smelter', recipe: 'r-ingot', role: 'production' });
const mine = (): Node => ({ machine: 'miner1', role: 'extraction', resource: 'ore' });
const belt = (machine = 'belt1'): Node => ({ machine });

const world = (placements: Node[], links: [number, number][]): WorldSnapshot =>
  ({
    placements: placements.map((p) => ({ x: 0, y: 0, z: 0, ...p })),
    links: links.map(([from, to]) => ({ from, to, kind: 'belt' })),
    buildings: Object.fromEntries(placements.map((p) => [p['machine'], 1])),
    lines: {},
    stored: {},
    paths: [],
    milestones: [],
    circuits: [],
    phase: null,
    sessionName: 'polska',
    playDurationSeconds: 0,
    saveBuildVersion: 0,
    savedAt: null,
    objectCount: 0,
    modded: false,
  }) as unknown as WorldSnapshot;

const solved = (rate: number, raw: Record<string, number> = {}): SolveResult =>
  ({
    lines: [
      {
        recipe: 'r-ingot',
        recipeName: 'Iron Ingot',
        machine: 'smelter',
        primaryOutput: 'ingot',
        machinesExact: 1,
        machinesToBuild: 1,
        outputPerMinute: rate,
        powerMW: 4,
      },
    ],
    rawInputs: raw,
    produced: {},
    consumed: {},
    surplus: {},
    totalMachines: 1,
    totalPowerMW: 4,
    warnings: [],
  }) as unknown as SolveResult;

describe('forcedFlow', () => {
  /*
   * The reading the first attempt got wrong. Four smelters making 30 each on
   * four belts of their own is not 120 on one, and comparing a line's whole
   * output against the belt *nearest* it reported two of the reference save's
   * twelve lines as over capacity when none are.
   */
  it('does not add up machines that never share a belt', () => {
    const snapshot = world(
      [smelter(), smelter(), belt(), belt()],
      [
        [0, 2],
        [1, 3],
      ],
    );
    expect(forcedFlow(db, snapshot).map((s) => s.carryingPerMinute)).toEqual([30, 30]);
  });

  /*
   * And where they do share one it adds up: everything arriving at a merger
   * leaves by the single belt on the other side of it.
   */
  it('adds up what a merge forces down one belt', () => {
    const snapshot = world(
      [smelter(), smelter(), belt(), belt(), { machine: 'ConveyorAttachmentMerger' }, belt()],
      [
        [0, 2],
        [1, 3],
        [2, 4],
        [3, 4],
        [4, 5],
      ],
    );
    const shared = forcedFlow(db, snapshot).find((s) => s.at === 5);
    expect(shared?.carryingPerMinute).toBe(60);
    expect(shared?.recipes).toEqual(['r-ingot']);
  });

  /*
   * A splitter is where the reading stops. How much goes each way depends on
   * what the far ends are taking, and answering it would be a model dressed up
   * as a measurement.
   */
  it('stops at a splitter rather than modelling it', () => {
    const snapshot = world(
      [smelter(), belt(), { machine: 'ConveyorAttachmentSplitter' }, belt(), belt()],
      [
        [0, 1],
        [1, 2],
        [2, 3],
        [2, 4],
      ],
    );
    expect(forcedFlow(db, snapshot).map((s) => s.at)).toEqual([1]);
  });

  it('credits an extractor with nothing, because purity is not in the save', () => {
    expect(forcedFlow(db, world([mine(), belt()], [[0, 1]]))).toEqual([]);
  });
});

describe('physics', () => {
  it('names the lines the belts they run on could not take', () => {
    const snapshot = world([smelter(), belt()], [[0, 1]]);
    const view = physics(db, solved(176), snapshot)!;

    expect(view.moves).toHaveLength(1);
    expect(view.moves[0]).toMatchObject({ item: 'ingot', ratePerMinute: 176, over: true });
    expect(view.moves[0]?.today?.capacityPerMinute).toBe(60);
    expect(view.moves[0]?.needs.map((n) => n.count)).toEqual([3, 2]);
    // A tier standing in the world is proof you have it.
    expect([...view.built]).toEqual(['belt1']);
  });

  it('counts a line that fits rather than listing it', () => {
    const view = physics(db, solved(50), world([smelter(), belt()], [[0, 1]]))!;
    expect(view.moves).toEqual([]);
    expect(view.fine).toBe(1);
  });

  /*
   * The other ceiling, and it is not the same kind. Two Miner Mk.1s are
   * 120/min on normal nodes and 240 with both pure, so a plan wanting 300 is
   * beyond them whatever is underneath — which the board can say without ever
   * being told a purity it will never be told.
   */
  it('separates a mine that is short from one that cannot ever be enough', () => {
    const snapshot = world([mine(), mine()], []);

    expect(physics(db, solved(10, { ore: 300 }), snapshot)?.supply[0]).toMatchObject({
      impossible: true,
      tight: false,
    });
    expect(physics(db, solved(10, { ore: 180 }), snapshot)?.supply[0]).toMatchObject({
      impossible: false,
      tight: true,
    });
    expect(physics(db, solved(10, { ore: 100 }), snapshot)?.supply[0]).toMatchObject({
      impossible: false,
      tight: false,
    });
  });

  it('says nothing about a mine that is not there', () => {
    const view = physics(db, solved(10, { ore: 300 }), world([], []))!;
    expect(view.supply[0]).toMatchObject({ mine: null, impossible: false, tight: false });
  });

  it('has nothing to say without a database that knows any belts', () => {
    expect(physics({ ...db, carriers: {} }, solved(176), world([], []))).toBeNull();
  });
});

describe('standingExtractors', () => {
  it('groups the mine by what it pulls', () => {
    const snapshot = world([mine(), mine(), smelter()], []);
    expect(standingExtractors(snapshot).get('ore')).toEqual(['miner1', 'miner1']);
  });
});
