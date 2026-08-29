import type { GameDatabase } from '@factory-board/planner';
import type { BuildingPlacement, WorldSnapshot } from '@factory-board/save-reader';
import { describe, expect, it } from 'vitest';
import { buildZoneBoard, withZoneName, zoneAt, type ZoneName } from './zones';

/**
 * A slice of the real game, small enough to reason about. Ids are the game's,
 * because the naming rules read display names out of the database and getting
 * that join wrong is exactly the kind of thing worth pinning.
 */
const db: GameDatabase = {
  sourceBuildId: 0,
  items: {
    Desc_OreIron_C: { id: 'Desc_OreIron_C', name: 'Iron Ore', isRaw: true, isFluid: false },
    Desc_Water_C: { id: 'Desc_Water_C', name: 'Water', isRaw: true, isFluid: true },
    Desc_Coal_C: { id: 'Desc_Coal_C', name: 'Coal', isRaw: true, isFluid: false },
    Desc_IronIngot_C: { id: 'Desc_IronIngot_C', name: 'Iron Ingot', isRaw: false, isFluid: false },
  },
  recipes: {
    Recipe_IngotIron_C: {
      id: 'Recipe_IngotIron_C',
      name: 'Iron Ingot',
      durationSeconds: 2,
      machine: 'SmelterMk1',
      inputs: [{ item: 'Desc_OreIron_C', amount: 1 }],
      outputs: [{ item: 'Desc_IronIngot_C', amount: 1 }],
      isAlternate: false,
    },
  },
  machines: { SmelterMk1: { id: 'SmelterMk1', name: 'Smelter', powerMW: 4 } },
  buildings: {
    SmelterMk1: { id: 'SmelterMk1', name: 'Smelter' },
    MinerMk1: { id: 'MinerMk1', name: 'Miner Mk.1' },
    WaterPump: { id: 'WaterPump', name: 'Water Extractor' },
    GeneratorCoal: { id: 'GeneratorCoal', name: 'Coal-Powered Generator' },
  },
  milestones: {},
  generators: {},
  carriers: {},
  extractors: {},
  schematics: {},
};

const smelter = (x: number, y: number): BuildingPlacement => ({
  machine: 'SmelterMk1',
  x,
  y,
  z: 0,
  recipe: 'Recipe_IngotIron_C',
  role: 'production',
});

const miner = (
  x: number,
  y: number,
  resource = 'Desc_OreIron_C',
  uptime?: number,
): BuildingPlacement => ({
  machine: 'MinerMk1',
  x,
  y,
  z: 0,
  role: 'extraction',
  resource,
  ...(uptime === undefined ? {} : { uptime }),
});

const generator = (x: number, y: number, uptime?: number): BuildingPlacement => ({
  machine: 'GeneratorCoal',
  x,
  y,
  z: 0,
  role: 'power',
  resource: 'Desc_Coal_C',
  ...(uptime === undefined ? {} : { uptime }),
});

const world = (placements: BuildingPlacement[], uptime: number | null = null): WorldSnapshot => ({
  sessionName: 'test',
  playDurationSeconds: 0,
  saveBuildVersion: 0,
  savedAt: null,
  lines: {
    Recipe_IngotIron_C: {
      recipe: 'Recipe_IngotIron_C',
      machine: 'SmelterMk1',
      count: placements.filter((p) => p.recipe).length,
      uptime,
      clock: 1,
    },
  },
  buildings: {},
  placements,
  paths: [],
  links: [],
  milestones: [],
  phase: null,
  stored: {},
  circuits: [],
  objectCount: placements.length,
});

describe('buildZoneBoard · what a zone is called', () => {
  it('names a factory cell after what it mostly makes', () => {
    const board = buildZoneBoard(db, world([smelter(0, 0), smelter(8, 0)]));
    expect(board.zones).toHaveLength(1);
    expect(board.zones[0]?.name).toBe('Iron Ingot');
    expect(board.zones[0]?.kind).toBe('production');
  });

  it('names a power plant after the fuel it burns', () => {
    const board = buildZoneBoard(db, world([generator(500, 500), generator(508, 500)]));
    expect(board.zones[0]?.name).toBe('Coal Power');
    expect(board.zones[0]?.kind).toBe('power');
    expect(board.zones[0]?.generators).toBe(2);
  });

  it('names a mine after the resource it is pulling', () => {
    const board = buildZoneBoard(db, world([miner(500, 500), miner(508, 500)]));
    expect(board.zones[0]?.name).toBe('Iron Ore');
    expect(board.zones[0]?.kind).toBe('extraction');
    expect(board.zones[0]?.extractors).toBe(2);
  });

  it('numbers two zones that would be called the same thing', () => {
    const board = buildZoneBoard(
      db,
      world([miner(0, 0), miner(8, 0), miner(900, 900), miner(908, 900)]),
    );
    expect(board.zones.map((zone) => zone.name)).toEqual(['Iron Ore', 'Iron Ore 2']);
    expect(board.zones.map((zone) => zone.slug)).toEqual(['iron-ore', 'iron-ore-2']);
  });

  // The rule the whole two-pass clustering exists for, stated where a reader of
  // the app will look for it.
  it('lets miners and burners join a factory cell without renaming it', () => {
    const board = buildZoneBoard(db, world([smelter(0, 0), smelter(8, 0), miner(16, 0)]));
    expect(board.zones).toHaveLength(1);
    expect(board.zones[0]?.name).toBe('Iron Ingot');
    expect(board.zones[0]?.machines).toBe(2);
    expect(board.zones[0]?.extracts).toEqual([
      { id: 'Desc_OreIron_C', name: 'Iron Ore', count: 1 },
    ]);
  });
});

describe('buildZoneBoard · how a zone is doing', () => {
  it('folds in the extractors and generators no production line covers', () => {
    // Two smelters on a line at 100%, two generators measuring 50% each.
    const board = buildZoneBoard(
      db,
      world([smelter(0, 0), smelter(8, 0), generator(16, 0, 0.5), generator(20, 0, 0.5)], 1),
    );
    expect(board.zones).toHaveLength(1);
    expect(board.zones[0]?.uptime).toBeCloseTo(0.75, 6);
  });

  it('reports no uptime at all rather than a misleading zero', () => {
    const board = buildZoneBoard(db, world([miner(0, 0), miner(8, 0)]));
    expect(board.zones[0]?.uptime).toBeNull();
  });
});

describe('a zone reference is a point on the ground', () => {
  const names: ZoneName[] = [{ at: { x: 4, y: 0 }, name: 'The Smeltery' }];

  it('gives a hand-written name to whichever zone is standing on its point', () => {
    const board = buildZoneBoard(db, world([smelter(0, 0), smelter(8, 0)]), names);
    expect(board.zones[0]?.name).toBe('The Smeltery');
    expect(board.zones[0]?.renamed).toBe(true);
    expect(board.zones[0]?.derived).toBe('Iron Ingot');
    expect(board.zones[0]?.slug).toBe('the-smeltery');
  });

  /*
   * Zone ids are positional: build one more machine somewhere else and the
   * ordering changes underneath every id. A name pinned to a coordinate does
   * not care, which is the whole reason references are points.
   */
  it('holds its place when the zones are renumbered around it', () => {
    const bigger = world([
      smelter(0, 0),
      smelter(8, 0),
      // A larger cell elsewhere, which now sorts first and takes zone-1.
      smelter(900, 900),
      smelter(908, 900),
      smelter(916, 900),
    ]);
    const board = buildZoneBoard(db, bigger, names);
    const smeltery = board.zones.find((zone) => zone.name === 'The Smeltery');
    expect(smeltery?.id).toBe('zone-2');
    expect(board.zones[0]?.name).toBe('Iron Ingot');
  });

  it('leaves a name pinned to ground nothing stands on unused', () => {
    const board = buildZoneBoard(db, world([smelter(500, 500), smelter(508, 500)]), names);
    expect(board.zones[0]?.name).toBe('Iron Ingot');
    expect(board.zones[0]?.renamed).toBe(false);
  });

  it('resolves a pinned point to the zone standing there', () => {
    const board = buildZoneBoard(db, world([smelter(0, 0), smelter(8, 0), miner(900, 900)]));
    expect(zoneAt(board.zones, { x: 4, y: 0 })?.name).toBe('Iron Ingot');
    expect(zoneAt(board.zones, { x: 900, y: 900 })?.name).toBe('Iron Ore');
    expect(zoneAt(board.zones, { x: 5000, y: 5000 })).toBeUndefined();
    expect(zoneAt(board.zones, undefined)).toBeUndefined();
  });

  it('replaces a name rather than stacking a second one on the same ground', () => {
    const board = buildZoneBoard(db, world([smelter(0, 0), smelter(8, 0)]), names);
    const zone = board.zones[0]!;
    expect(withZoneName(names, zone, 'Ingots')).toEqual([{ at: zone.at, name: 'Ingots' }]);
    expect(withZoneName(names, zone, '   ')).toEqual([]);
  });
});
