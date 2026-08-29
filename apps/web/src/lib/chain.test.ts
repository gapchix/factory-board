import type { GameDatabase } from '@factory-board/planner';
import type { BuildingLink, BuildingPlacement, WorldSnapshot } from '@factory-board/save-reader';
import { describe, expect, it } from 'vitest';
import { traceChain } from './chain';

const db: GameDatabase = {
  sourceBuildId: 0,
  items: {
    Desc_OreIron_C: { id: 'Desc_OreIron_C', name: 'Iron Ore', isRaw: true, isFluid: false },
    Desc_IronIngot_C: { id: 'Desc_IronIngot_C', name: 'Iron Ingot', isRaw: false, isFluid: false },
    Desc_IronRod_C: { id: 'Desc_IronRod_C', name: 'Iron Rod', isRaw: false, isFluid: false },
    Desc_Water_C: { id: 'Desc_Water_C', name: 'Water', isRaw: true, isFluid: true },
  },
  recipes: {
    Recipe_IngotIron_C: {
      id: 'Recipe_IngotIron_C',
      name: 'Iron Ingot',
      durationSeconds: 2,
      machine: 'SmelterMk1',
      inputs: [],
      outputs: [{ item: 'Desc_IronIngot_C', amount: 1 }],
      isAlternate: false,
    },
    Recipe_IronRod_C: {
      id: 'Recipe_IronRod_C',
      name: 'Iron Rod',
      durationSeconds: 4,
      machine: 'ConstructorMk1',
      inputs: [],
      outputs: [{ item: 'Desc_IronRod_C', amount: 1 }],
      isAlternate: false,
    },
  },
  machines: {},
  buildings: {
    MinerMk1: { id: 'MinerMk1', name: 'Miner Mk.1' },
    SmelterMk1: { id: 'SmelterMk1', name: 'Smelter' },
    ConstructorMk1: { id: 'ConstructorMk1', name: 'Constructor' },
    ConveyorBeltMk1: { id: 'ConveyorBeltMk1', name: 'Conveyor Belt Mk.1' },
    WaterPump: { id: 'WaterPump', name: 'Water Extractor' },
    GeneratorCoal: { id: 'GeneratorCoal', name: 'Coal-Powered Generator' },
    Pipeline: { id: 'Pipeline', name: 'Pipeline' },
  },
  milestones: {},
  generators: {},
  carriers: {},
  extractors: {},
  schematics: {},
};

const place = (machine: string, over: Partial<BuildingPlacement> = {}): BuildingPlacement => ({
  machine,
  x: 0,
  y: 0,
  z: 0,
  ...over,
});

const belt = () => place('ConveyorBeltMk1');

const world = (placements: BuildingPlacement[], links: BuildingLink[]): WorldSnapshot => ({
  sessionName: 'test',
  playDurationSeconds: 0,
  saveBuildVersion: 0,
  savedAt: null,
  lines: {
    Recipe_IngotIron_C: {
      recipe: 'Recipe_IngotIron_C',
      machine: 'SmelterMk1',
      count: 1,
      uptime: 0.83,
      clock: 1,
    },
    Recipe_IronRod_C: {
      recipe: 'Recipe_IronRod_C',
      machine: 'ConstructorMk1',
      count: 1,
      uptime: 0.67,
      clock: 1,
    },
  },
  buildings: {},
  placements,
  paths: [],
  links,
  milestones: [],
  phase: null,
  stored: {},
  circuits: [],
  objectCount: placements.length,
});

/** miner ▸ belt ▸ smelter ▸ belt ▸ constructor — the shape of a real line. */
const line = (minerUptime: number) =>
  world(
    [
      place('MinerMk1', { role: 'extraction', resource: 'Desc_OreIron_C', uptime: minerUptime }),
      belt(),
      place('SmelterMk1', { role: 'production', recipe: 'Recipe_IngotIron_C' }),
      belt(),
      place('ConstructorMk1', { role: 'production', recipe: 'Recipe_IronRod_C' }),
    ],
    [
      { from: 0, to: 1, kind: 'belt' },
      { from: 1, to: 2, kind: 'belt' },
      { from: 2, to: 3, kind: 'belt' },
      { from: 3, to: 4, kind: 'belt' },
    ],
  );

describe('traceChain', () => {
  it('follows what feeds a machine, and what it feeds', () => {
    const chain = traceChain(db, line(0.5), 2);
    expect(chain?.origin.name).toBe('Iron Ingot');
    expect(chain?.upstream.map((step) => step.name)).toEqual(['Miner Mk.1']);
    expect(chain?.downstream.map((step) => step.name)).toEqual(['Iron Rod']);
  });

  // Belts and fittings carry things; they do not make them. Counting them as
  // hops would make "two machines back" unreadable on any real base.
  it('counts machines as hops and walks through the belts between them', () => {
    const chain = traceChain(db, line(0.5), 4);
    expect(chain?.upstream.map((step) => [step.name, step.hops])).toEqual([
      ['Iron Ingot', 1],
      ['Miner Mk.1', 2],
    ]);
    // The belts are still in the chain, for the drawing to light up.
    expect(chain?.members.size).toBe(5);
  });

  it('names the worst thing upstream when the supply is the problem', () => {
    const chain = traceChain(db, line(0.5), 4);
    expect(chain?.weakest?.name).toBe('Miner Mk.1');
    expect(chain?.weakest?.uptime).toBe(0.5);
  });

  /*
   * A supply running better than the machine asked about explains nothing.
   * Naming a miner at 98% as the weakest link would send someone half a
   * kilometre across the map for no reason.
   */
  it('says nothing about a supply that is running fine', () => {
    const chain = traceChain(db, line(1), 4);
    expect(chain?.weakest).toBeNull();
  });

  it('walks a pipe in both directions, because fluid has no build order', () => {
    const snapshot = world(
      [
        place('WaterPump', { role: 'extraction', resource: 'Desc_Water_C', uptime: 0.4 }),
        place('Pipeline'),
        place('GeneratorCoal', { role: 'power', resource: 'Desc_Coal_C', uptime: 0.67 }),
      ],
      [
        { from: 0, to: 1, kind: 'pipe' },
        // Written the other way round on purpose: a pipe link has no direction.
        { from: 2, to: 1, kind: 'pipe' },
      ],
    );
    const chain = traceChain(db, snapshot, 2);
    expect(chain?.upstream.map((step) => step.name)).toEqual(['Water Extractor']);
    expect(chain?.weakest?.name).toBe('Water Extractor');
  });

  it('does not go round for ever on a loop', () => {
    const snapshot = world(
      [
        place('SmelterMk1', { role: 'production', recipe: 'Recipe_IngotIron_C' }),
        belt(),
        place('ConstructorMk1', { role: 'production', recipe: 'Recipe_IronRod_C' }),
        belt(),
      ],
      [
        { from: 0, to: 1, kind: 'belt' },
        { from: 1, to: 2, kind: 'belt' },
        { from: 2, to: 3, kind: 'belt' },
        { from: 3, to: 0, kind: 'belt' },
      ],
    );
    const chain = traceChain(db, snapshot, 0);
    expect(chain?.members.size).toBe(4);
    expect(chain?.upstream.map((step) => step.name)).toEqual(['Iron Rod']);
  });

  it('has nothing to say about a building that is not there', () => {
    expect(traceChain(db, line(0.5), 99)).toBeNull();
  });
});
