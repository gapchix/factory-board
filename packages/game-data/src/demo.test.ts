import { unlockedRecipes } from '@factory-board/planner';
import { describe, expect, it } from 'vitest';
import { demoDatabase as db } from './demo.js';
import { demoSnapshot } from './demo-save.js';
import { parseGameDatabase } from './schema.js';

/**
 * The demo is a feature rather than a fixture
 * ([ADR 29](../../../docs/adr/0029-the-board-ships-a-base-of-its-own.md)), and
 * it is the first thing anyone without the game sees. So it is checked for the
 * one thing a hand-written world can be that an extracted one cannot: at odds
 * with itself.
 */
const snapshot = demoSnapshot() as {
  readonly lines: Readonly<Record<string, unknown>>;
  readonly milestones: readonly string[];
  readonly placements: readonly {
    machine: string;
    recipe?: string;
    resource?: string;
    role?: string;
    fuel?: number;
    circuit?: number;
  }[];
  readonly links: readonly { from: number; to: number }[];
  readonly circuits: readonly { id: number; members: readonly number[]; capacityMW: number }[];
};

describe('the demo database', () => {
  it('passes the schema every extracted database goes through', () => {
    expect(() => parseGameDatabase(db)).not.toThrow();
  });

  it('says what unlocks every recipe it ships', () => {
    const reachable = new Set(Object.values(db.schematics).flatMap((s) => s.unlocks));
    const orphaned = Object.keys(db.recipes).filter((id) => !reachable.has(id));
    expect(orphaned).toEqual([]);
  });

  it('unlocks nothing it does not have a recipe for', () => {
    const dangling = Object.values(db.schematics)
      .flatMap((s) => s.unlocks)
      .filter((id) => !(id in db.recipes));
    expect(dangling).toEqual([]);
  });
});

describe('the demo save', () => {
  /*
   * The check that matters, and the same one the reference save passes: a
   * factory cannot be running a recipe its own save says is locked. Get this
   * wrong and the board's newest answer looks broken on the first page anyone
   * opens, on a base nobody can go and inspect.
   */
  it('has unlocked everything the base is actually running', () => {
    const unlocked = unlockedRecipes(db, snapshot.milestones);
    const impossible = Object.keys(snapshot.lines).filter((id) => !unlocked?.has(id));
    expect(impossible).toEqual([]);
  });

  it('has found one hard drive and not the others, so the board can show both', () => {
    const unlocked = unlockedRecipes(db, snapshot.milestones);
    const alternates = Object.values(db.recipes).filter((r) => r.isAlternate);
    const found = alternates.filter((r) => unlocked?.has(r.id));

    expect(alternates.length).toBe(4);
    expect(found.map((r) => r.name)).toEqual(['Alternate: Cast Screws']);
  });

  it('owns no schematic the database has never heard of', () => {
    const unknown = snapshot.milestones.filter(
      (id) => !(id in db.schematics) && !(id in db.milestones),
    );
    expect(unknown).toEqual([]);
  });

  /*
   * The failure mode of a base written by hand: indices into a list that later
   * grew. Both the grid membership and the links were typed out as numbers and
   * both had gone stale — `20 → 0` meant *iron miner into the first smelter*
   * and had become *the Smart Plating assembler into it*. They are worked out
   * from the placements now, and this is the check that they still line up.
   */
  it('joins buildings that could actually be joined', () => {
    for (const link of snapshot.links) {
      const from = snapshot.placements[link.from];
      const to = snapshot.placements[link.to];
      expect(from?.role === 'production' || from?.role === 'extraction').toBe(true);
      expect(to?.role).toBe('production');
    }

    for (const circuit of snapshot.circuits) {
      for (const index of circuit.members) {
        expect(snapshot.placements[index]?.circuit).toBe(circuit.id);
      }
    }
  });

  /*
   * A generator with nothing in it supplies nothing, and a save's capacity
   * figure is what its generators can give *now*. The demo claimed 90 MW off
   * three burners with one of them empty — a state the game cannot be in.
   */
  it('only counts the generators that are burning towards a grid’s capacity', () => {
    for (const circuit of snapshot.circuits) {
      const burning = circuit.members
        .map((index) => snapshot.placements[index])
        .filter((placement) => placement?.role === 'power' && (placement.fuel ?? 0) > 0)
        .reduce((total, placement) => total + (db.generators[placement!.machine]?.powerMW ?? 0), 0);
      expect(burning).toBe(circuit.capacityMW);
    }
  });
});
