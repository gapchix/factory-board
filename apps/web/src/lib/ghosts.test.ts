import type { GameDatabase } from '@factory-board/planner';
import type { BuildingPlacement } from '@factory-board/save-reader';
import { describe, expect, it } from 'vitest';
import { placeGhosts, type GhostZone, type Missing } from './ghosts';

/** A Constructor is 8 × 10 m in the game, which is the footprint these lean on. */
const db = {
  sourceBuildId: 0,
  items: {},
  machines: {},
  recipes: {},
  milestones: {},
  buildings: {
    ConstructorMk1: {
      id: 'ConstructorMk1',
      name: 'Constructor',
      footprintM: { width: 8, length: 10 },
    },
    SmelterMk1: { id: 'SmelterMk1', name: 'Smelter', footprintM: { width: 6, length: 9 } },
  },
} as unknown as GameDatabase;

const zone = (id: string, minX: number, minY: number, maxX: number, maxY: number): GhostZone => ({
  id,
  name: id.toUpperCase(),
  bounds: { minX, minY, maxX, maxY },
});

const standing = (
  machine: string,
  x: number,
  y: number,
  recipe?: string,
  facing = 0,
): BuildingPlacement => ({
  machine,
  x,
  y,
  z: 0,
  facing,
  ...(recipe ? { recipe, role: 'production' as const } : {}),
});

const want = (count: number, extra: Partial<Missing> = {}): Missing => ({
  recipe: 'r-screw',
  machine: 'ConstructorMk1',
  name: 'Screws',
  count,
  ...extra,
});

describe('placeGhosts', () => {
  it('puts more of a thing where that thing already is', () => {
    // "Build six more constructors" is half an instruction; the base already
    // knows where the constructors making this are, and saying so is not a guess.
    const zones = [zone('screws', 0, 0, 60, 60), zone('copper', 500, 500, 560, 560)];
    const plan = placeGhosts(db, [standing('ConstructorMk1', 10, 10, 'r-screw')], zones, [want(2)]);

    expect(plan.sites).toHaveLength(2);
    expect(plan.sites.every((site) => site.zoneId === 'screws')).toBe(true);
  });

  it('faces them the way the ones already there face', () => {
    // A row built side by side reads as a row; a ghost at some house angle
    // reads as a mistake.
    const plan = placeGhosts(
      db,
      [standing('ConstructorMk1', 10, 10, 'r-screw', 310)],
      [zone('screws', 0, 0, 60, 60)],
      [want(1)],
    );

    expect(plan.sites[0]?.facing).toBe(310);
  });

  it('never stands a ghost on a building', () => {
    const built = standing('ConstructorMk1', 10, 10, 'r-screw');
    const plan = placeGhosts(db, [built], [zone('screws', 0, 0, 60, 60)], [want(4)]);

    for (const site of plan.sites) {
      const apart = Math.abs(site.x - built.x) >= 8 || Math.abs(site.y - built.y) >= 10;
      expect(apart).toBe(true);
    }
  });

  it('never stands two ghosts on each other', () => {
    const plan = placeGhosts(
      db,
      [standing('ConstructorMk1', 10, 10, 'r-screw')],
      [zone('screws', 0, 0, 60, 60)],
      [want(6)],
    );

    expect(plan.sites).toHaveLength(6);
    for (let i = 0; i < plan.sites.length; i += 1) {
      for (let j = i + 1; j < plan.sites.length; j += 1) {
        const a = plan.sites[i]!;
        const b = plan.sites[j]!;
        const apart = Math.abs(a.x - b.x) >= 8 || Math.abs(a.y - b.y) >= 10;
        expect(apart).toBe(true);
      }
    }
  });

  it('spills past the edge of a cell that is already full', () => {
    /*
     * A full cell is the normal case for a plan that says to build more, so
     * refusing to leave the box would answer "no room" almost every time.
     */
    const packed: BuildingPlacement[] = [];
    for (let x = 0; x <= 20; x += 10) {
      for (let y = 0; y <= 20; y += 12) packed.push(standing('ConstructorMk1', x, y, 'r-screw'));
    }

    const plan = placeGhosts(db, packed, [zone('screws', -5, -6, 25, 26)], [want(1)]);

    expect(plan.sites).toHaveLength(1);
    expect(plan.unplaced).toBe(0);
  });

  it('prefers the zone the target was pinned to over the one it is made in', () => {
    // An explicit assignment is the player saying where; that outranks a guess
    // from what is standing.
    const zones = [zone('screws', 0, 0, 60, 60), zone('new-wing', 400, 0, 460, 60)];
    const plan = placeGhosts(db, [standing('ConstructorMk1', 10, 10, 'r-screw')], zones, [
      want(1, { zoneId: 'new-wing' }),
    ]);

    expect(plan.sites[0]?.zoneId).toBe('new-wing');
  });

  it('reports what has nowhere to go rather than guessing', () => {
    // Nothing in the base makes this yet and no zone was named, so there is no
    // honest answer to "where" — dropping it on the nearest patch of grass
    // would invent one.
    const plan = placeGhosts(
      db,
      [],
      [zone('screws', 0, 0, 60, 60)],
      [want(3, { recipe: 'r-rotor', name: 'Rotor' })],
    );

    expect(plan.sites).toHaveLength(0);
    expect(plan.homeless).toEqual(['Rotor']);
  });

  it('says nothing when the plan is nothing', () => {
    expect(placeGhosts(db, [], [zone('screws', 0, 0, 60, 60)], [])).toMatchObject({ sites: [] });
  });
});
