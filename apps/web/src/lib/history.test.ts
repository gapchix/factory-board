import type { GameDatabase } from '@factory-board/planner';
import type { BuildingPlacement, WorldSnapshot } from '@factory-board/save-reader';
import { describe, expect, it } from 'vitest';
import { changesBetween, digestOf, phaseProgress, type HistoryPoint } from './history';

const db: GameDatabase = {
  sourceBuildId: 0,
  items: {
    Desc_IronIngot_C: { id: 'Desc_IronIngot_C', name: 'Iron Ingot', isRaw: false, isFluid: false },
    Desc_IronRod_C: { id: 'Desc_IronRod_C', name: 'Iron Rod', isRaw: false, isFluid: false },
    Desc_SpaceElevatorPart_1_C: {
      id: 'Desc_SpaceElevatorPart_1_C',
      name: 'Smart Plating',
      isRaw: false,
      isFluid: false,
    },
    Desc_SpaceElevatorPart_2_C: {
      id: 'Desc_SpaceElevatorPart_2_C',
      name: 'Versatile Framework',
      isRaw: false,
      isFluid: false,
    },
    Desc_SpaceElevatorPart_3_C: {
      id: 'Desc_SpaceElevatorPart_3_C',
      name: 'Automated Wiring',
      isRaw: false,
      isFluid: false,
    },
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
  machines: {
    SmelterMk1: { id: 'SmelterMk1', name: 'Smelter', powerMW: 4 },
    ConstructorMk1: { id: 'ConstructorMk1', name: 'Constructor', powerMW: 4 },
  },
  buildings: {},
  milestones: {},
};

const placement = (role: BuildingPlacement['role'], recipe?: string): BuildingPlacement => ({
  machine: 'x',
  x: 0,
  y: 0,
  z: 0,
  ...(recipe ? { recipe } : {}),
  ...(role ? { role } : {}),
});

const world = (over: Partial<WorldSnapshot> = {}): WorldSnapshot => ({
  sessionName: 'polska',
  playDurationSeconds: 3600,
  saveBuildVersion: 0,
  savedAt: null,
  lines: {},
  buildings: {},
  placements: [],
  paths: [],
  links: [],
  milestones: [],
  phase: null,
  stored: {},
  objectCount: 0,
  ...over,
});

const point = (over: Partial<HistoryPoint> = {}): HistoryPoint => ({
  session: 'polska',
  playSeconds: 0,
  savedAt: null,
  source: 'a.sav',
  buildings: 0,
  machines: 0,
  extractors: 0,
  generators: 0,
  powerMW: 0,
  uptime: null,
  milestones: 0,
  phase: null,
  delivered: {},
  lines: {},
  ...over,
});

describe('digestOf', () => {
  it('keeps what a session chart needs and drops the rest', () => {
    const digest = digestOf(
      db,
      world({
        playDurationSeconds: 3600.4,
        savedAt: 1787730343646,
        lines: {
          Recipe_IngotIron_C: {
            recipe: 'Recipe_IngotIron_C',
            machine: 'SmelterMk1',
            count: 4,
            uptime: 1,
            clock: 1,
          },
          Recipe_IronRod_C: {
            recipe: 'Recipe_IronRod_C',
            machine: 'ConstructorMk1',
            count: 2,
            uptime: 0.4,
            clock: 1,
          },
        },
        placements: [
          placement('production', 'Recipe_IngotIron_C'),
          placement('extraction'),
          placement('extraction'),
          placement('power'),
          placement(undefined),
        ],
        milestones: ['a', 'b'],
      }),
      'polska_autosave_0.sav',
    );

    expect(digest.playSeconds).toBe(3600);
    expect(digest.savedAt).toBe(1787730343646);
    expect(digest.machines).toBe(6);
    expect(digest.powerMW).toBe(24);
    // Machine-weighted, not line-weighted: four smelters at 100% outweigh two
    // constructors at 40%.
    expect(digest.uptime).toBeCloseTo((4 * 1 + 2 * 0.4) / 6, 6);
    expect(digest.buildings).toBe(5);
    expect(digest.extractors).toBe(2);
    expect(digest.generators).toBe(1);
    expect(digest.milestones).toBe(2);
    expect(digest.lines['Recipe_IronRod_C']).toEqual({ count: 2, uptime: 0.4 });
  });

  it('reports no uptime rather than zero when nothing has been measured', () => {
    const digest = digestOf(
      db,
      world({
        lines: {
          Recipe_IngotIron_C: {
            recipe: 'Recipe_IngotIron_C',
            machine: 'SmelterMk1',
            count: 1,
            uptime: null,
            clock: 1,
          },
        },
      }),
      'a.sav',
    );
    expect(digest.uptime).toBeNull();
  });
});

describe('changesBetween', () => {
  const running = (count: number, uptime: number | null) => ({ count, uptime });

  it('reports a line that has stopped, and puts it first', () => {
    const changes = changesBetween(
      db,
      point({ lines: { Recipe_IngotIron_C: running(4, 1), Recipe_IronRod_C: running(2, 1) } }),
      point({ lines: { Recipe_IngotIron_C: running(6, 1), Recipe_IronRod_C: running(2, 0) } }),
    );
    expect(changes.lines[0]).toEqual({
      kind: 'stopped',
      recipe: 'Recipe_IronRod_C',
      name: 'Iron Rod',
      from: 1,
      to: 0,
    });
    expect(changes.lines[1]?.kind).toBe('built');
  });

  it('tells a new line from one that grew', () => {
    const changes = changesBetween(
      db,
      point({ lines: { Recipe_IngotIron_C: running(4, 1) } }),
      point({ lines: { Recipe_IngotIron_C: running(6, 1), Recipe_IronRod_C: running(3, null) } }),
    );
    expect(changes.lines.map((line) => [line.kind, line.name])).toEqual([
      ['added', 'Iron Rod'],
      ['built', 'Iron Ingot'],
    ]);
  });

  it('reports a line that has gone entirely', () => {
    const changes = changesBetween(
      db,
      point({ lines: { Recipe_IronRod_C: running(3, 1) } }),
      point({ lines: {} }),
    );
    expect(changes.lines).toEqual([
      { kind: 'gone', recipe: 'Recipe_IronRod_C', name: 'Iron Rod', from: 3, to: 0 },
    ]);
  });

  it('notices a line coming back', () => {
    const changes = changesBetween(
      db,
      point({ lines: { Recipe_IronRod_C: running(3, 0) } }),
      point({ lines: { Recipe_IronRod_C: running(3, 0.98) } }),
    );
    expect(changes.lines[0]?.kind).toBe('recovered');
  });

  // A machine built moments ago has no productivity history. Reading that as a
  // line that has stopped would cry wolf on every new build.
  it('does not call a line that was never measured stopped', () => {
    const changes = changesBetween(
      db,
      point({ lines: { Recipe_IronRod_C: running(3, null) } }),
      point({ lines: { Recipe_IronRod_C: running(3, 0) } }),
    );
    expect(changes.lines).toEqual([]);
  });

  it('adds up what the session gained', () => {
    const changes = changesBetween(
      db,
      point({ playSeconds: 3600, savedAt: 1000, buildings: 100, machines: 10, powerMW: 40 }),
      point({
        playSeconds: 3900,
        savedAt: 301000,
        buildings: 118,
        machines: 13,
        powerMW: 52,
        milestones: 1,
        delivered: { Desc_SpaceElevatorPart_1_C: 25 },
      }),
    );
    expect(changes.playSeconds).toBe(300);
    expect(changes.elapsedMs).toBe(300000);
    expect(changes.buildings).toBe(18);
    expect(changes.machines).toBe(3);
    expect(changes.powerMW).toBe(12);
    expect(changes.milestones).toBe(1);
    expect(changes.delivered).toBe(25);
  });
});

describe('phaseProgress', () => {
  const delivering = (playSeconds: number, plating: number): HistoryPoint =>
    point({
      playSeconds,
      phase: 'GP_Project_Assembly_Phase_2',
      delivered: { Desc_SpaceElevatorPart_1_C: plating },
    });

  it('counts the share across everything the phase asks for', () => {
    const progress = phaseProgress(db, [delivering(0, 0), delivering(3600, 275)]);
    // 275 of 1100 parts in total.
    expect(progress?.label).toBe('Phase 2');
    expect(progress?.share).toBeCloseTo(0.25, 6);
    expect(progress?.items[0]).toEqual({
      item: 'Desc_SpaceElevatorPart_1_C',
      name: 'Smart Plating',
      delivered: 275,
      required: 500,
    });
  });

  it('projects the rest at the rate of the window', () => {
    // A quarter delivered in an hour: three hours to go.
    const progress = phaseProgress(db, [delivering(0, 0), delivering(3600, 275)]);
    expect(progress?.secondsLeft).toBe(10800);
  });

  // A projection built on no deliveries is worse than no projection.
  it('says nothing about a rate when nothing has been delivered', () => {
    const progress = phaseProgress(db, [delivering(0, 100), delivering(3600, 100)]);
    expect(progress?.share).toBeCloseTo(100 / 1100, 6);
    expect(progress?.secondsLeft).toBeNull();
  });

  it('measures the rate within the phase only, never across the reset', () => {
    const earlier = point({
      playSeconds: 0,
      phase: 'GP_Project_Assembly_Phase_1',
      delivered: { Desc_SpaceElevatorPart_1_C: 50 },
    });
    const progress = phaseProgress(db, [earlier, delivering(3600, 0), delivering(7200, 275)]);
    expect(progress?.secondsLeft).toBe(10800);
  });

  it('has nothing to say without a phase it knows', () => {
    expect(phaseProgress(db, [])).toBeNull();
    expect(phaseProgress(db, [point()])).toBeNull();
    expect(phaseProgress(db, [point({ phase: 'GP_Project_Assembly_Phase_9' })])).toBeNull();
  });
});
