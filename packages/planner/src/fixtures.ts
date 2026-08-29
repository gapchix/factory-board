import type {
  GameDatabase,
  GameGenerator,
  GameItem,
  GameMachine,
  GameRecipe,
  GameSchematic,
} from './types.js';

/**
 * A hand-written slice of the real game, used by the tests.
 *
 * The rates are the genuine Satisfactory ones, so assertions in the test suite
 * double as a check that the maths matches the game rather than merely matching
 * itself. Kept deliberately tiny — the real database is extracted from the
 * user's own install and is never committed to this repository.
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

const machine = (id: string, name: string, powerMW: number): GameMachine => ({ id, name, powerMW });

/**
 * Generators at the game's real numbers, so the tests check the maths against
 * Satisfactory rather than against themselves: a Coal-Powered Generator makes
 * 75 MW off 15 Coal/min and 45 m³ Water/min, and a Biomass Burner 30 MW off
 * 4 Solid Biofuel/min.
 */
const generator = (
  id: string,
  name: string,
  powerMW: number,
  fuels: GameGenerator['fuels'],
): GameGenerator => ({ id, name, powerMW, fuels });

const schematic = (
  id: string,
  name: string,
  kind: GameSchematic['kind'],
  tier: number,
  unlocks: readonly string[],
): GameSchematic => ({ id, name, kind, tier, unlocks });

const byId = <T extends { id: string }>(entries: readonly T[]): Record<string, T> =>
  Object.fromEntries(entries.map((e) => [e.id, e]));

export const testDatabase: GameDatabase = {
  sourceBuildId: 24656030,
  items: byId([
    item('iron-ore', 'Iron Ore', { isRaw: true }),
    item('coal', 'Coal', { isRaw: true, energyMJ: 300 }),
    item('water', 'Water', { isRaw: true, isFluid: true }),
    item('sam', 'SAM', { isRaw: true }),
    item('leaves', 'Leaves', { isRaw: true, energyMJ: 15 }),
    item('solid-biofuel', 'Solid Biofuel', { energyMJ: 450 }),
    item('uranium-rod', 'Uranium Fuel Rod', { energyMJ: 750_000 }),
    item('uranium-waste', 'Uranium Waste'),
    item('iron-ingot', 'Iron Ingot'),
    item('iron-rod', 'Iron Rod'),
    item('iron-plate', 'Iron Plate'),
    item('screw', 'Screw'),
    item('reinforced-iron-plate', 'Reinforced Iron Plate'),
    item('rotor', 'Rotor'),
    item('smart-plating', 'Smart Plating'),
    item('steel-ingot', 'Steel Ingot'),
  ]),
  machines: byId([
    machine('smelter', 'Smelter', 4),
    machine('foundry', 'Foundry', 16),
    machine('constructor', 'Constructor', 4),
    machine('assembler', 'Assembler', 15),
    machine('converter', 'Converter', 250),
  ]),
  recipes: byId([
    recipe('r-iron-ingot', 'Iron Ingot', 2, 'smelter', [['iron-ore', 1]], [['iron-ingot', 1]]),
    recipe('r-iron-rod', 'Iron Rod', 4, 'constructor', [['iron-ingot', 1]], [['iron-rod', 1]]),
    recipe(
      'r-iron-plate',
      'Iron Plate',
      6,
      'constructor',
      [['iron-ingot', 3]],
      [['iron-plate', 2]],
    ),
    recipe('r-screw', 'Screw', 6, 'constructor', [['iron-rod', 1]], [['screw', 4]]),
    recipe(
      'r-reinforced-iron-plate',
      'Reinforced Iron Plate',
      12,
      'assembler',
      [
        ['iron-plate', 6],
        ['screw', 12],
      ],
      [['reinforced-iron-plate', 1]],
    ),
    recipe(
      'r-rotor',
      'Rotor',
      15,
      'assembler',
      [
        ['iron-rod', 5],
        ['screw', 25],
      ],
      [['rotor', 1]],
    ),
    recipe(
      'r-smart-plating',
      'Smart Plating',
      30,
      'assembler',
      [
        ['reinforced-iron-plate', 1],
        ['rotor', 1],
      ],
      [['smart-plating', 1]],
    ),
    // Steel is the byproduct/multi-input case.
    recipe(
      'r-steel-ingot',
      'Steel Ingot',
      4,
      'foundry',
      [
        ['iron-ore', 3],
        ['coal', 3],
      ],
      [['steel-ingot', 3]],
    ),
    // An alternate, to exercise recipe pinning.
    recipe(
      'r-alt-steel-plate',
      'Alternate: Coated Iron Plate',
      8,
      'assembler',
      [
        ['iron-ingot', 5],
        ['water', 2],
      ],
      [['iron-plate', 10]],
      true,
    ),
    // The trap: a NON-alternate late-game Converter recipe that manufactures a
    // raw resource. Real Satisfactory ships several of these.
    recipe('r-iron-ore-from-sam', 'Iron Ore', 6, 'converter', [['sam', 2]], [['iron-ore', 12]]),
  ]),
  generators: byId([
    // Leaves first, as the game lists them — 120 a minute for 30 MW, which is
    // the arithmetic that made a caller-supplied fuel necessary.
    generator('biomass-burner', 'Biomass Burner', 30, [
      { item: 'leaves', ratePerMinute: 120 },
      { item: 'solid-biofuel', ratePerMinute: 4 },
    ]),
    generator('coal-generator', 'Coal-Powered Generator', 75, [
      { item: 'coal', ratePerMinute: 15, supplemental: { item: 'water', ratePerMinute: 45 } },
    ]),
    // The one generator that hands something back, which is a different shape
    // of answer: 240 m³ of water in, ten waste out, and somewhere to put it.
    generator('nuclear-plant', 'Nuclear Power Plant', 2500, [
      {
        item: 'uranium-rod',
        ratePerMinute: 0.2,
        supplemental: { item: 'water', ratePerMinute: 240 },
        byproduct: { item: 'uranium-waste', ratePerMinute: 10 },
      },
    ]),
  ]),
  buildings: byId([
    { id: 'smelter', name: 'Smelter' },
    { id: 'foundry', name: 'Foundry' },
    { id: 'constructor', name: 'Constructor' },
    { id: 'assembler', name: 'Assembler' },
    { id: 'converter', name: 'Converter' },
    { id: 'MinerMk1', name: 'Miner Mk.1' },
  ]),
  milestones: {},
  /*
   * Enough unlocks to ask what a save can and cannot build. Every recipe above
   * is behind exactly one of these except the coated plate, which is behind two
   * — the game really does hand some recipes out twice, and owning either is
   * enough.
   */
  schematics: byId([
    schematic('s-1-1', 'Base Building', 'milestone', 1, [
      'r-iron-ingot',
      'r-iron-rod',
      'r-iron-plate',
      'r-screw',
    ]),
    schematic('s-2-1', 'Part Assembly', 'milestone', 2, [
      'r-reinforced-iron-plate',
      'r-rotor',
      'r-smart-plating',
    ]),
    schematic('s-3-4', 'Basic Steel Production', 'milestone', 3, ['r-steel-ingot']),
    schematic('s-drive-plate', 'Alternate: Coated Iron Plate', 'hard-drive', 0, [
      'r-alt-steel-plate',
    ]),
    schematic('s-research-plating', 'Plating Research', 'research', 4, ['r-alt-steel-plate']),
    schematic('s-research-sam', 'SAM Conversion', 'research', 8, ['r-iron-ore-from-sam']),
  ]),
};
