import type { GameDatabase } from '@factory-board/planner';
import { demoDatabase } from './demo.js';

/**
 * A base that does not exist, so the board has one to talk about.
 *
 * `demo.ts` gets the app past "no game database"; this gets it past "no save".
 * Between them anyone can clone the repository and see the whole thing working
 * without owning Satisfactory — which is what the repository being shareable
 * actually means.
 *
 * Written to be *interesting*, not merely valid. A base where everything runs
 * at 100% demonstrates nothing, so this one has the two failures the board
 * exists to tell apart:
 *
 * - **Cable is starving.** Two wire in its input buffer, and 900 more sitting
 *   in a container — the belt goes to the wrong place, which is a routing
 *   problem wearing a supply problem's clothes.
 * - **Iron Rod is backed up.** Full input, full output, 2,400 already stored.
 *   The instruction "build more" is wrong here and the board says so.
 *
 * Plus a second power grid with no generation on it, one line the game has not
 * measured yet, and a Space Elevator part built but never delivered.
 *
 * The shape is `WorldSnapshot`, but this package cannot say so: `save-reader`
 * depends on `game-data`, and importing the type back would close a cycle. It
 * is validated at the app's boundary by the same Zod schema every real snapshot
 * goes through, which is the check that matters.
 */

/** Deliberately not `WorldSnapshot` — see the note above about the cycle. */
export interface DemoSnapshot {
  readonly [key: string]: unknown;
}

const M = 1; // metres, so the numbers below read as a floor plan

/** A row of machines, laid out west to east on a shared line. */
function row(
  machine: string,
  recipe: string,
  count: number,
  x: number,
  y: number,
  facing: number,
  step: number,
  extra: Record<string, unknown> = {},
): Record<string, unknown>[] {
  return Array.from({ length: count }, (_, index) => ({
    machine,
    x: x + index * step * M,
    y,
    z: 0,
    facing,
    recipe,
    role: 'production',
    circuit: 0,
    ...extra,
  }));
}

export function demoSnapshot(db: GameDatabase = demoDatabase): DemoSnapshot {
  void db;

  const placements: Record<string, unknown>[] = [
    /* Smelters: iron and copper, on the west side. */
    ...row('SmelterMk1', 'Recipe_IngotIron_C', 4, -60, -30, 90, 12, {
      input: { Desc_OreIron_C: 100 },
      output: {},
    }),
    ...row('SmelterMk1', 'Recipe_IngotCopper_C', 2, -60, 10, 90, 12, {
      input: { Desc_OreCopper_C: 100 },
      output: {},
    }),

    /* Iron rod: backed up. Full in, full out, and thousands in a box. */
    ...row('ConstructorMk1', 'Recipe_IronRod_C', 4, 0, -30, 90, 14, {
      input: { Desc_IronIngot_C: 100 },
      output: { Desc_IronRod_C: 200 },
    }),
    ...row('ConstructorMk1', 'Recipe_IronPlate_C', 2, 0, -6, 90, 14, {
      input: { Desc_IronIngot_C: 96 },
      output: { Desc_IronPlate_C: 1 },
    }),
    ...row('ConstructorMk1', 'Recipe_Screw_C', 3, 0, 14, 90, 14, {
      input: { Desc_IronRod_C: 200 },
      output: {},
    }),

    /* Wire runs fine; cable, fed by the wrong belt, does not. */
    ...row('ConstructorMk1', 'Recipe_Wire_C', 2, 60, 10, 90, 14, {
      input: { Desc_CopperIngot_C: 70 },
      output: { Desc_Wire_C: 1 },
    }),
    ...row('ConstructorMk1', 'Recipe_Cable_C', 1, 60, 32, 90, 14, {
      input: { Desc_Wire_C: 2 },
      output: {},
    }),

    /* Assemblers, east. Smart Plating has never run: no rotors reach it. */
    ...row('AssemblerMk1', 'Recipe_IronPlateReinforced_C', 1, 110, -20, 0, 20, {
      input: { Desc_IronPlate_C: 180, Desc_IronScrew_C: 60 },
      output: {},
    }),
    ...row('AssemblerMk1', 'Recipe_Rotor_C', 1, 110, 6, 0, 20, {
      input: { Desc_IronRod_C: 200, Desc_IronScrew_C: 25 },
      output: {},
    }),
    ...row('AssemblerMk1', 'Recipe_SpaceElevatorPart_1_C', 1, 110, 32, 0, 20, {
      input: { Desc_IronPlateReinforced_C: 100 },
      output: {},
    }),

    /* A concrete constructor on a grid of its own, with nothing generating on
     * it — which is what "unpowered" looks like from the outside. */
    {
      machine: 'ConstructorMk1',
      x: -130,
      y: 70,
      z: 0,
      facing: 0,
      recipe: 'Recipe_Concrete_C',
      role: 'production',
      circuit: 1,
      input: { Desc_Stone_C: 100 },
      output: {},
    },

    /* Extraction and power. */
    {
      machine: 'MinerMk1',
      x: -120,
      y: -34,
      z: 0,
      facing: 90,
      role: 'extraction',
      resource: 'Desc_OreIron_C',
      uptime: 1,
      circuit: 0,
    },
    {
      machine: 'MinerMk1',
      x: -120,
      y: 6,
      z: 0,
      facing: 90,
      role: 'extraction',
      resource: 'Desc_OreCopper_C',
      uptime: 0.75,
      circuit: 0,
    },
    {
      machine: 'MinerMk1',
      x: -150,
      y: 74,
      z: 0,
      facing: 90,
      role: 'extraction',
      resource: 'Desc_Stone_C',
      uptime: 0,
      circuit: 1,
    },
    {
      machine: 'GeneratorBiomass_Automated',
      x: -40,
      y: 66,
      z: 0,
      facing: 0,
      role: 'power',
      resource: 'Desc_Coal_C',
      uptime: 1,
      fuel: 180,
      circuit: 0,
    },
    {
      machine: 'GeneratorBiomass_Automated',
      x: -26,
      y: 66,
      z: 0,
      facing: 0,
      role: 'power',
      resource: 'Desc_Coal_C',
      uptime: 1,
      fuel: 140,
      circuit: 0,
    },
    {
      machine: 'GeneratorBiomass_Automated',
      x: -12,
      y: 66,
      z: 0,
      facing: 0,
      role: 'power',
      resource: 'Desc_Coal_C',
      uptime: 0.62,
      fuel: 0,
      circuit: 0,
    },

    /* Somewhere to keep it all, and somewhere to hand it in. */
    { machine: 'StorageContainerMk1', x: 46, y: -30, z: 0, facing: 0 },
    { machine: 'StorageContainerMk1', x: 46, y: -16, z: 0, facing: 0 },
    { machine: 'StorageContainerMk1', x: 96, y: 34, z: 0, facing: 0 },
    { machine: 'TradingPost', x: 160, y: 60, z: 0, facing: 0 },
  ];

  /** A belt from one point to another, as the map draws them. */
  const belt = (
    from: readonly [number, number],
    to: readonly [number, number],
  ): Record<string, unknown> => ({ kind: 'belt', points: [from, [to[0], from[1]], to] });

  /**
   * A power line, which the map draws as a straight run between its ends.
   *
   * Poles themselves are never drawn as buildings — the map treats them as
   * infrastructure and shows the wiring instead — so the grid is only visible
   * if the wires are here. Without them the demo had a power *story* (one grid
   * comfortable, one with no generation on it) and nothing on the map to show
   * it, which is the sort of gap only a reader notices.
   */
  const wire = (
    from: readonly [number, number],
    to: readonly [number, number],
  ): Record<string, unknown> => ({ kind: 'power', points: [from, to] });

  const paths = [
    belt([-114, -34], [-60, -30]),
    belt([-114, 6], [-60, 10]),
    belt([-54, -30], [0, -30]),
    belt([-54, -30], [0, -6]),
    belt([-54, 10], [60, 10]),
    belt([42, -30], [0, 14]),
    belt([42, 14], [110, 6]),
    belt([42, -6], [110, -20]),
    belt([110, 6], [110, 32]),
    belt([110, -20], [110, 32]),
    belt([-144, 74], [-130, 70]),

    /* The main grid: burners out to a spine, and the spine out to each row. */
    wire([-40, 66], [-12, 66]),
    wire([-12, 66], [4, 44]),
    wire([4, 44], [-56, 44]),
    wire([-56, 44], [-60, 14]),
    wire([-56, 44], [-114, 30]),
    wire([-114, 30], [-120, -30]),
    wire([4, 44], [4, 18]),
    wire([4, 44], [64, 36]),
    wire([64, 36], [110, 36]),
    wire([110, 36], [110, 10]),

    /*
     * And the second grid, which is two buildings joined to each other and to
     * nothing that generates. Everything on it reads as stopped, and only the
     * grid explains why.
     */
    wire([-150, 74], [-134, 72]),
  ];

  /*
   * What feeds what, as indices into `placements`. The map traces chains from
   * these rather than guessing from geometry, so the demo has to state them the
   * way a real save does.
   */
  const links = [
    { from: 20, to: 0, kind: 'belt' }, // iron miner  → first smelter
    { from: 21, to: 4, kind: 'belt' }, // copper miner → copper smelter
    { from: 0, to: 6, kind: 'belt' }, // iron ingot   → iron rod
    { from: 1, to: 10, kind: 'belt' }, // iron ingot  → iron plate
    { from: 6, to: 12, kind: 'belt' }, // iron rod    → screws
    { from: 12, to: 16, kind: 'belt' }, // screws     → reinforced plate
    { from: 12, to: 17, kind: 'belt' }, // screws     → rotor
    { from: 16, to: 18, kind: 'belt' }, // plate      → smart plating
    { from: 4, to: 14, kind: 'belt' }, // copper ingot → wire
    { from: 14, to: 15, kind: 'belt' }, // wire       → cable
  ];

  const line = (recipe: string, machine: string, count: number, uptime: number | null) => ({
    recipe,
    machine,
    count,
    uptime,
    clock: 1,
  });

  return {
    sessionName: 'demo',
    playDurationSeconds: 12600,
    saveBuildVersion: 0,
    savedAt: null,
    lines: {
      Recipe_IngotIron_C: line('Recipe_IngotIron_C', 'SmelterMk1', 4, 0.83),
      Recipe_IngotCopper_C: line('Recipe_IngotCopper_C', 'SmelterMk1', 2, 1),
      Recipe_IronRod_C: line('Recipe_IronRod_C', 'ConstructorMk1', 4, 0.67),
      Recipe_IronPlate_C: line('Recipe_IronPlate_C', 'ConstructorMk1', 2, 1),
      Recipe_Screw_C: line('Recipe_Screw_C', 'ConstructorMk1', 3, 1),
      Recipe_Wire_C: line('Recipe_Wire_C', 'ConstructorMk1', 2, 1),
      Recipe_Cable_C: line('Recipe_Cable_C', 'ConstructorMk1', 1, 0.5),
      Recipe_Concrete_C: line('Recipe_Concrete_C', 'ConstructorMk1', 1, 0.12),
      Recipe_IronPlateReinforced_C: line('Recipe_IronPlateReinforced_C', 'AssemblerMk1', 1, 1),
      Recipe_Rotor_C: line('Recipe_Rotor_C', 'AssemblerMk1', 1, 0.6),
      // Never measured: built moments ago, which is not the same as idle.
      Recipe_SpaceElevatorPart_1_C: line('Recipe_SpaceElevatorPart_1_C', 'AssemblerMk1', 1, null),
    },
    buildings: {
      SmelterMk1: 6,
      ConstructorMk1: 13,
      AssemblerMk1: 3,
      MinerMk1: 3,
      GeneratorBiomass_Automated: 3,
      StorageContainerMk1: 3,
      TradingPost: 1,
      ConveyorBeltMk1: 11,
      PowerLine: 11,
      PowerPoleMk1: 6,
    },
    stored: {
      Desc_IronRod_C: 2400,
      Desc_Wire_C: 900,
      Desc_IronScrew_C: 640,
      Desc_IronPlate_C: 210,
      Desc_Cement_C: 120,
      Desc_Rotor_C: 18,
      Desc_SpaceElevatorPart_1_C: 12,
    },
    placements,
    paths,
    links,
    milestones: ['Schematic_1-1_C', 'Schematic_1-2_C'],
    circuits: [
      // The main grid, comfortable. And a second one with a miner and a
      // constructor on it and nothing generating — every machine there reads as
      // stopped, and only the grid explains why.
      { id: 0, members: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], demandMW: 78, capacityMW: 90 },
      { id: 1, members: [19, 22], demandMW: 9, capacityMW: 0 },
    ],
    phase: {
      current: 'GP_Project_Assembly_Phase_1',
      target: 'GP_Project_Assembly_Phase_1',
      delivered: { Desc_SpaceElevatorPart_1_C: 18 },
    },
    objectCount: placements.length + paths.length,
  };
}
