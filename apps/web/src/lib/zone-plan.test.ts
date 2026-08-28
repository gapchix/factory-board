import type { GameDatabase, ProductionTarget } from '@factory-board/planner';
import type { BuildingPlacement, WorldSnapshot } from '@factory-board/save-reader';
import { describe, expect, it } from 'vitest';
import { planByZone } from './zone-plan';
import { buildZoneBoard, type ZoneView } from './zones';

/** Real rates: a Smelter makes 30 Iron Ingot/min, a Constructor 15 Iron Rod/min. */
const db: GameDatabase = {
  sourceBuildId: 0,
  items: {
    Desc_OreIron_C: { id: 'Desc_OreIron_C', name: 'Iron Ore', isRaw: true, isFluid: false },
    Desc_IronIngot_C: { id: 'Desc_IronIngot_C', name: 'Iron Ingot', isRaw: false, isFluid: false },
    Desc_IronRod_C: { id: 'Desc_IronRod_C', name: 'Iron Rod', isRaw: false, isFluid: false },
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
    Recipe_IronRod_C: {
      id: 'Recipe_IronRod_C',
      name: 'Iron Rod',
      durationSeconds: 4,
      machine: 'ConstructorMk1',
      inputs: [{ item: 'Desc_IronIngot_C', amount: 1 }],
      outputs: [{ item: 'Desc_IronRod_C', amount: 1 }],
      isAlternate: false,
    },
  },
  machines: {
    SmelterMk1: { id: 'SmelterMk1', name: 'Smelter', powerMW: 4 },
    ConstructorMk1: { id: 'ConstructorMk1', name: 'Constructor', powerMW: 4 },
  },
  buildings: {
    SmelterMk1: { id: 'SmelterMk1', name: 'Smelter' },
    ConstructorMk1: { id: 'ConstructorMk1', name: 'Constructor' },
  },
  milestones: {},
};

const machine = (x: number, y: number, recipe: string, id: string): BuildingPlacement => ({
  machine: id,
  x,
  y,
  z: 0,
  recipe,
  role: 'production',
});

const world = (placements: BuildingPlacement[]): WorldSnapshot => ({
  sessionName: 'test',
  playDurationSeconds: 0,
  saveBuildVersion: 0,
  savedAt: null,
  lines: {},
  buildings: {},
  placements,
  paths: [],
  links: [],
  milestones: [],
  phase: null,
  stored: {},
  objectCount: placements.length,
});

/** Two cells far enough apart to be two zones: smelters here, constructors there. */
const snapshot = world([
  machine(0, 0, 'Recipe_IngotIron_C', 'SmelterMk1'),
  machine(8, 0, 'Recipe_IngotIron_C', 'SmelterMk1'),
  machine(900, 900, 'Recipe_IronRod_C', 'ConstructorMk1'),
  machine(908, 900, 'Recipe_IronRod_C', 'ConstructorMk1'),
]);

const board = buildZoneBoard(db, snapshot);
const zones: readonly ZoneView[] = board.zones;
const ingots = zones.find((zone) => zone.name === 'Iron Ingot')!;
const rods = zones.find((zone) => zone.name === 'Iron Rod')!;

const target = (item: string, ratePerMinute: number): ProductionTarget => ({ item, ratePerMinute });

describe('planByZone', () => {
  it('says what a zone still needs, against what is already standing in it', () => {
    const plan = planByZone(
      db,
      [target('Desc_IronIngot_C', 60)],
      {},
      { Desc_IronIngot_C: ingots.at },
      zones,
    );

    const entry = plan.byZone.get(ingots.id);
    expect(entry?.work).toEqual([
      { recipe: 'Recipe_IngotIron_C', name: 'Iron Ingot', machine: 'Smelter', needed: 2, built: 2 },
    ]);
    expect(entry?.toBuild).toBe(0);
  });

  it('counts only the machines standing in that zone as built', () => {
    // The rods are wanted where the smelters are, and none are there yet.
    const plan = planByZone(
      db,
      [target('Desc_IronRod_C', 15)],
      {},
      { Desc_IronRod_C: ingots.at },
      zones,
    );

    const entry = plan.byZone.get(ingots.id);
    expect(entry?.work.find((work) => work.recipe === 'Recipe_IronRod_C')).toEqual({
      recipe: 'Recipe_IronRod_C',
      name: 'Iron Rod',
      machine: 'Constructor',
      needed: 1,
      built: 0,
    });
    // The ingots that feed them are wanted there too, and two are standing.
    expect(entry?.work.find((work) => work.recipe === 'Recipe_IngotIron_C')?.built).toBe(2);
  });

  /*
   * Two lines in one cell share a machine; two lines in cells 900 m apart
   * cannot. So targets are solved one at a time and rounded up per zone, not
   * per target.
   */
  it('rounds up per zone, so targets sharing one share its machines', () => {
    const both = [target('Desc_IronRod_C', 15), target('Desc_IronIngot_C', 15)];

    const together = planByZone(
      db,
      both,
      {},
      { Desc_IronRod_C: ingots.at, Desc_IronIngot_C: ingots.at },
      zones,
    );
    // 15 rod/min needs half a smelter, 15 ingot/min needs another half: one smelter.
    expect(
      together.byZone.get(ingots.id)?.work.find((w) => w.recipe === 'Recipe_IngotIron_C')?.needed,
    ).toBe(1);

    const apart = planByZone(
      db,
      both,
      {},
      { Desc_IronRod_C: rods.at, Desc_IronIngot_C: ingots.at },
      zones,
    );
    expect(
      apart.byZone.get(rods.id)?.work.find((w) => w.recipe === 'Recipe_IngotIron_C')?.needed,
    ).toBe(1);
    expect(
      apart.byZone.get(ingots.id)?.work.find((w) => w.recipe === 'Recipe_IngotIron_C')?.needed,
    ).toBe(1);
  });

  it('reports a target that has been given nowhere to go', () => {
    const plan = planByZone(db, [target('Desc_IronIngot_C', 30)], {}, {}, zones);
    expect(plan.unassigned).toEqual(['Desc_IronIngot_C']);
    expect(plan.byZone.size).toBe(0);
  });

  it('tells each line which zones it is destined for', () => {
    const plan = planByZone(
      db,
      [target('Desc_IronRod_C', 15), target('Desc_IronIngot_C', 15)],
      {},
      { Desc_IronRod_C: rods.at, Desc_IronIngot_C: ingots.at },
      zones,
    );
    expect(plan.byRecipe.get('Recipe_IronRod_C')).toEqual([rods.id]);
    expect(new Set(plan.byRecipe.get('Recipe_IngotIron_C'))).toEqual(new Set([rods.id, ingots.id]));
  });
});
