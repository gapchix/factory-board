import type { GameDatabase, GameItem, GameMachine, GameRecipe } from '@factory-board/planner';

/**
 * A hand-written slice of the early game, so the board runs without one.
 *
 * The real database is extracted from a Satisfactory install and is never
 * committed — it is Coffee Stain's data, and serving it would be
 * redistribution ([ADR 0003](../../../docs/adr/0003-do-not-commit-game-data.md)).
 * That is the right rule and it had a cost: without the game, `npm run dev`
 * stopped at *"No game database found"* and the app could not be looked at at
 * all. Anyone without the game — anyone the repository is shared with, and CI —
 * hit a wall on the first command.
 *
 * So this is written from scratch rather than extracted. The rates and
 * footprints are the real ones because a demo that lies is worse than no demo,
 * but every byte of it is typed out here, the same way
 * `packages/planner/src/fixtures.ts` has always carried a smaller version for
 * the tests. Nothing is copied from the game's files, and it goes nowhere near
 * complete: eleven items and nine recipes against a real database's 168 and 291.
 *
 * It is enough to make every view answer something — a chain three steps deep,
 * two ores, a burner, and a Space Elevator part to aim at.
 */

const item = (id: string, name: string, extra: Partial<GameItem> = {}): GameItem => ({
  id,
  name,
  isRaw: false,
  isFluid: false,
  ...extra,
});

const recipe = (
  id: string,
  name: string,
  durationSeconds: number,
  machine: string,
  inputs: ReadonlyArray<[string, number]>,
  outputs: ReadonlyArray<[string, number]>,
): GameRecipe => ({
  id,
  name,
  durationSeconds,
  machine,
  inputs: inputs.map(([i, amount]) => ({ item: i, amount })),
  outputs: outputs.map(([i, amount]) => ({ item: i, amount })),
  isAlternate: false,
});

const machine = (id: string, name: string, powerMW: number): GameMachine => ({ id, name, powerMW });

const building = (id: string, name: string, width?: number, length?: number) => ({
  id,
  name,
  ...(width === undefined || length === undefined ? {} : { footprintM: { width, length } }),
});

const byId = <T extends { id: string }>(entries: readonly T[]): Record<string, T> =>
  Object.fromEntries(entries.map((e) => [e.id, e]));

export const demoDatabase: GameDatabase = {
  // Zero is what the schema means by "unknown install", which is the truth here.
  sourceBuildId: 0,
  items: byId([
    item('Desc_OreIron_C', 'Iron Ore', { isRaw: true }),
    item('Desc_OreCopper_C', 'Copper Ore', { isRaw: true }),
    item('Desc_Stone_C', 'Limestone', { isRaw: true }),
    item('Desc_Coal_C', 'Coal', { isRaw: true }),
    item('Desc_IronIngot_C', 'Iron Ingot'),
    item('Desc_CopperIngot_C', 'Copper Ingot'),
    item('Desc_IronRod_C', 'Iron Rod'),
    item('Desc_IronPlate_C', 'Iron Plate'),
    item('Desc_IronScrew_C', 'Screw'),
    item('Desc_Wire_C', 'Wire'),
    item('Desc_Cable_C', 'Cable'),
    item('Desc_Cement_C', 'Concrete'),
    item('Desc_IronPlateReinforced_C', 'Reinforced Iron Plate'),
    item('Desc_Rotor_C', 'Rotor'),
    item('Desc_SpaceElevatorPart_1_C', 'Smart Plating'),
  ]),
  machines: byId([
    machine('SmelterMk1', 'Smelter', 4),
    machine('ConstructorMk1', 'Constructor', 4),
    machine('AssemblerMk1', 'Assembler', 15),
  ]),
  buildings: byId([
    // Footprints are the game's own clearance boxes, which is what lets the map
    // draw a demo base at believable proportions.
    building('SmelterMk1', 'Smelter', 6, 9),
    building('ConstructorMk1', 'Constructor', 8, 10),
    building('AssemblerMk1', 'Assembler', 10, 15),
    building('MinerMk1', 'Miner Mk.1', 6, 14),
    building('GeneratorBiomass_Automated', 'Biomass Burner', 8, 8),
    building('StorageContainerMk1', 'Storage Container', 5, 10),
    building('TradingPost', 'The HUB', 18, 26),
    building('ConveyorBeltMk1', 'Conveyor Belt Mk.1'),
    building('PowerLine', 'Power Line'),
    building('PowerPoleMk1', 'Power Pole Mk.1', 2, 2),
  ]),
  recipes: byId([
    recipe(
      'Recipe_IngotIron_C',
      'Iron Ingot',
      2,
      'SmelterMk1',
      [['Desc_OreIron_C', 1]],
      [['Desc_IronIngot_C', 1]],
    ),
    recipe(
      'Recipe_IngotCopper_C',
      'Copper Ingot',
      2,
      'SmelterMk1',
      [['Desc_OreCopper_C', 1]],
      [['Desc_CopperIngot_C', 1]],
    ),
    recipe(
      'Recipe_IronRod_C',
      'Iron Rod',
      4,
      'ConstructorMk1',
      [['Desc_IronIngot_C', 1]],
      [['Desc_IronRod_C', 1]],
    ),
    recipe(
      'Recipe_IronPlate_C',
      'Iron Plate',
      6,
      'ConstructorMk1',
      [['Desc_IronIngot_C', 3]],
      [['Desc_IronPlate_C', 2]],
    ),
    recipe(
      'Recipe_Screw_C',
      'Screw',
      6,
      'ConstructorMk1',
      [['Desc_IronRod_C', 1]],
      [['Desc_IronScrew_C', 4]],
    ),
    recipe(
      'Recipe_Wire_C',
      'Wire',
      4,
      'ConstructorMk1',
      [['Desc_CopperIngot_C', 1]],
      [['Desc_Wire_C', 2]],
    ),
    recipe(
      'Recipe_Cable_C',
      'Cable',
      2,
      'ConstructorMk1',
      [['Desc_Wire_C', 2]],
      [['Desc_Cable_C', 1]],
    ),
    recipe(
      'Recipe_Concrete_C',
      'Concrete',
      4,
      'ConstructorMk1',
      [['Desc_Stone_C', 3]],
      [['Desc_Cement_C', 1]],
    ),
    recipe(
      'Recipe_IronPlateReinforced_C',
      'Reinforced Iron Plate',
      12,
      'AssemblerMk1',
      [
        ['Desc_IronPlate_C', 6],
        ['Desc_IronScrew_C', 12],
      ],
      [['Desc_IronPlateReinforced_C', 1]],
    ),
    recipe(
      'Recipe_Rotor_C',
      'Rotor',
      15,
      'AssemblerMk1',
      [
        ['Desc_IronRod_C', 5],
        ['Desc_IronScrew_C', 25],
      ],
      [['Desc_Rotor_C', 1]],
    ),
    recipe(
      'Recipe_SpaceElevatorPart_1_C',
      'Smart Plating',
      30,
      'AssemblerMk1',
      [
        ['Desc_IronPlateReinforced_C', 1],
        ['Desc_Rotor_C', 1],
      ],
      [['Desc_SpaceElevatorPart_1_C', 1]],
    ),
  ]),
  milestones: byId([
    {
      id: 'Schematic_1-1_C',
      name: 'Base Building',
      tier: 1,
      cost: [{ item: 'Desc_Cement_C', amount: 200 }],
      unlocks: ['Recipe_Concrete_C'],
    },
    {
      id: 'Schematic_1-2_C',
      name: 'Logistics',
      tier: 1,
      cost: [
        { item: 'Desc_IronPlate_C', amount: 150 },
        { item: 'Desc_IronRod_C', amount: 150 },
      ],
      unlocks: [],
    },
    {
      id: 'Schematic_2-1_C',
      name: 'Part Assembly',
      tier: 2,
      cost: [
        { item: 'Desc_IronPlateReinforced_C', amount: 150 },
        { item: 'Desc_Cable_C', amount: 300 },
      ],
      unlocks: ['Recipe_IronPlateReinforced_C', 'Recipe_Rotor_C'],
    },
    {
      id: 'Schematic_2-2_C',
      name: 'Obstacle Clearing',
      tier: 2,
      cost: [{ item: 'Desc_IronRod_C', amount: 100 }],
      unlocks: [],
    },
  ]),
};
