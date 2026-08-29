import type { GameDatabase, GameSchematic } from '@factory-board/planner';
import type { WorldSnapshot } from '@factory-board/save-reader';
import { describe, expect, it } from 'vitest';
import { describeLock, unlockState } from './unlocks';

const schematic = (
  id: string,
  name: string,
  kind: GameSchematic['kind'],
  tier: number,
  unlocks: readonly string[],
): GameSchematic => ({ id, name, kind, tier, unlocks });

const db = {
  sourceBuildId: 0,
  buildings: {},
  milestones: {},
  items: {},
  machines: {},
  recipes: {},
  schematics: {
    's-1-1': schematic('s-1-1', 'Base Building', 'milestone', 1, ['r-ingot']),
    's-3-4': schematic('s-3-4', 'Basic Steel Production', 'milestone', 3, ['r-steel']),
    'drive-cast': schematic('drive-cast', 'Alternate: Cast Screws', 'hard-drive', 1, ['r-cast']),
  },
} as unknown as GameDatabase;

const snapshot = (milestones: readonly string[], lines: readonly string[] = []): WorldSnapshot =>
  ({
    milestones,
    lines: Object.fromEntries(lines.map((id) => [id, { recipe: id }])),
  }) as unknown as WorldSnapshot;

describe('unlockState', () => {
  it('claims nothing without a save', () => {
    const state = unlockState(db, null);
    expect(state.known).toBe(false);
    expect(state.unlocked('r-steel')).toBe(true);
  });

  it('claims nothing when the database records no unlocks', () => {
    const state = unlockState({ ...db, schematics: {} }, snapshot(['s-1-1']));
    expect(state.known).toBe(false);
    expect(state.unlocked('r-steel')).toBe(true);
  });

  it('reads what the save has bought', () => {
    const state = unlockState(db, snapshot(['s-1-1']));
    expect(state.known).toBe(true);
    expect(state.unlocked('r-ingot')).toBe(true);
    expect(state.unlocked('r-steel')).toBe(false);
    expect(state.unlocked('r-cast')).toBe(false);
  });

  /*
   * The safety valve. Whatever the schematic list is doing, a factory that is
   * visibly making the thing can make the thing — so the one error that would
   * actually mislead somebody cannot happen.
   */
  it('takes a running line as proof, whatever the schematics say', () => {
    const state = unlockState(db, snapshot(['s-1-1'], ['r-steel']));
    expect(state.unlocked('r-steel')).toBe(true);
    expect(state.unlocked('r-cast')).toBe(false);
  });

  /*
   * The mirror of the database-wide rule: not knowing what unlocks something
   * is not evidence that it is locked.
   */
  it('will not lock a recipe it cannot name a key for', () => {
    const state = unlockState(db, snapshot([]));
    expect(state.unlocked('r-mystery')).toBe(true);
    expect(state.unlocked('r-steel')).toBe(false);
  });

  it('names every way to a locked recipe', () => {
    expect(unlockState(db, snapshot([])).behind('r-steel')).toEqual([db.schematics['s-3-4']]);
    expect(unlockState(db, snapshot([])).behind('r-unknown')).toEqual([]);
  });
});

describe('describeLock', () => {
  it('names a milestone, because you can go and buy it', () => {
    expect(describeLock([db.schematics['s-3-4'] as GameSchematic])).toBe(
      'Tier 3 · Basic Steel Production',
    );
  });

  it('says what a hard drive is rather than repeating the recipe name', () => {
    expect(describeLock([db.schematics['drive-cast'] as GameSchematic])).toBe('a hard drive');
  });

  it('offers both routes when there are two, and never the same one twice', () => {
    const research = schematic('res', 'Turbofuel', 'research', 5, ['r-turbo']);
    const drive = schematic('drive-turbo', 'Alternate: Turbofuel', 'hard-drive', 5, ['r-turbo']);
    expect(describeLock([drive, research])).toBe('a hard drive or MAM · Turbofuel');
    expect(describeLock([drive, { ...drive, id: 'other' }])).toBe('a hard drive');
  });

  it('says nothing when nothing is known to unlock it', () => {
    expect(describeLock([])).toBeNull();
  });
});
