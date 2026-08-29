import type {
  GameDatabase,
  GameGenerator,
  GameItem,
  GameMachine,
  GameRecipe,
  GameSchematic,
} from '@factory-board/planner';

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
 * complete: sixteen items and fifteen recipes against a real database's 168
 * and 291.
 *
 * It is enough to make every view answer something — a chain three steps deep,
 * two ores, a burner, a Space Elevator part to aim at, and three hard-drive
 * alternates of which the demo save has found one.
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
  isAlternate = false,
): GameRecipe => ({
  id,
  name,
  durationSeconds,
  machine,
  inputs: inputs.map(([i, amount]) => ({ item: i, amount })),
  outputs: outputs.map(([i, amount]) => ({ item: i, amount })),
  isAlternate,
});

const schematic = (
  id: string,
  name: string,
  kind: GameSchematic['kind'],
  tier: number,
  unlocks: readonly string[],
): GameSchematic => ({ id, name, kind, tier, unlocks });

const machine = (id: string, name: string, powerMW: number): GameMachine => ({ id, name, powerMW });

const generator = (
  id: string,
  name: string,
  powerMW: number,
  fuels: GameGenerator['fuels'],
): GameGenerator => ({ id, name, powerMW, fuels });

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
    item('Desc_Coal_C', 'Coal', { isRaw: true, energyMJ: 300 }),
    /*
     * What the burners eat. No recipe makes it here, which is not an omission:
     * at this tier you carry biomass to the burners by hand, and the board
     * saying what that costs per minute is the point of having the number.
     */
    item('Desc_Biofuel_C', 'Solid Biofuel', { energyMJ: 450 }),
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
    machine('FoundryMk1', 'Foundry', 16),
    machine('ConstructorMk1', 'Constructor', 4),
    machine('AssemblerMk1', 'Assembler', 15),
  ]),
  /*
   * 30 MW off 4 Solid Biofuel a minute, which is the real burner. Three of the
   * demo base's four are burning, so its 90 MW of capacity is bought with 12
   * Solid Biofuel a minute at full output — and nothing on the base makes any,
   * which is what an early game looks like and what the board can now say.
   */
  generators: byId([
    generator('GeneratorBiomass_Automated', 'Biomass Burner', 30, [
      { item: 'Desc_Biofuel_C', ratePerMinute: 4 },
    ]),
  ]),
  buildings: byId([
    // Footprints are the game's own clearance boxes, which is what lets the map
    // draw a demo base at believable proportions.
    building('SmelterMk1', 'Smelter', 6, 9),
    building('FoundryMk1', 'Foundry', 10, 10),
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
    /*
     * Four hard-drive alternates, at the game's own rates.
     *
     * They are here to be *chosen between* rather than to pad the list. Cast
     * screws skip the rod line the demo base has backed up and the save has
     * found that drive; the iron alloy ingot buys a machine back by spending
     * copper ore, and has to be gone and found; iron wire trades one ore for
     * the other in a chain this plan does not use; and bolted plates want two
     * hundred and fifty screws a minute to save an assembler, which is the
     * trap. One swap you can make, one worth going after, and two that are
     * not, is the smallest set that makes the ranking mean anything.
     */
    recipe(
      'Recipe_Alternate_IngotIron_C',
      'Alternate: Iron Alloy Ingot',
      12,
      'FoundryMk1',
      [
        ['Desc_OreIron_C', 8],
        ['Desc_OreCopper_C', 2],
      ],
      [['Desc_IronIngot_C', 15]],
      true,
    ),
    recipe(
      'Recipe_Alternate_Screw_C',
      'Alternate: Cast Screws',
      24,
      'ConstructorMk1',
      [['Desc_IronIngot_C', 5]],
      [['Desc_IronScrew_C', 20]],
      true,
    ),
    recipe(
      'Recipe_Alternate_Wire_1_C',
      'Alternate: Iron Wire',
      24,
      'ConstructorMk1',
      [['Desc_IronIngot_C', 5]],
      [['Desc_Wire_C', 9]],
      true,
    ),
    recipe(
      'Recipe_Alternate_ReinforcedIronPlate_1_C',
      'Alternate: Bolted Iron Plate',
      12,
      'AssemblerMk1',
      [
        ['Desc_IronPlate_C', 18],
        ['Desc_IronScrew_C', 50],
      ],
      [['Desc_IronPlateReinforced_C', 3]],
      true,
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
      unlocks: ['Recipe_IronPlateReinforced_C', 'Recipe_Rotor_C', 'Recipe_SpaceElevatorPart_1_C'],
    },
    {
      id: 'Schematic_2-2_C',
      name: 'Obstacle Clearing',
      tier: 2,
      cost: [{ item: 'Desc_IronRod_C', amount: 100 }],
      unlocks: [],
    },
  ]),
  /*
   * What stands between the player and each recipe.
   *
   * Grouped the way the real game groups them — the HUB hands out the starting
   * chain, a milestone buys the assembler's recipes, and an alternate is behind
   * a hard drive you have to go and find. The demo save owns the first two
   * groups and exactly one drive, so the board has something to say in both
   * directions: a swap you can make today, and two you cannot.
   */
  schematics: byId([
    schematic('Schematic_StartingRecipes_C', 'Starting Blueprints', 'other', 0, [
      'Recipe_IngotIron_C',
      'Recipe_IngotCopper_C',
      'Recipe_IronRod_C',
      'Recipe_IronPlate_C',
    ]),
    schematic('Schematic_Tutorial1_5_C', 'HUB Upgrade 2', 'other', 0, [
      'Recipe_Wire_C',
      'Recipe_Cable_C',
    ]),
    schematic('Schematic_Tutorial2_C', 'HUB Upgrade 3', 'other', 0, ['Recipe_Screw_C']),
    schematic('Schematic_1-1_C', 'Base Building', 'milestone', 1, ['Recipe_Concrete_C']),
    schematic('Schematic_2-1_C', 'Part Assembly', 'milestone', 2, [
      'Recipe_IronPlateReinforced_C',
      'Recipe_Rotor_C',
      'Recipe_SpaceElevatorPart_1_C',
    ]),
    schematic('Schematic_Alternate_Screw_C', 'Alternate: Cast Screws', 'hard-drive', 1, [
      'Recipe_Alternate_Screw_C',
    ]),
    schematic('Schematic_Alternate_IngotIron_C', 'Alternate: Iron Alloy Ingot', 'hard-drive', 1, [
      'Recipe_Alternate_IngotIron_C',
    ]),
    schematic('Schematic_Alternate_Wire1_C', 'Alternate: Iron Wire', 'hard-drive', 1, [
      'Recipe_Alternate_Wire_1_C',
    ]),
    schematic(
      'Schematic_Alternate_ReinforcedIronPlate1_C',
      'Alternate: Bolted Iron Plate',
      'hard-drive',
      2,
      ['Recipe_Alternate_ReinforcedIronPlate_1_C'],
    ),
  ]),
};
