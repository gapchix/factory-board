import { describe, expect, it } from 'vitest';
import { testDatabase as db } from './fixtures.js';
import { recipeUnlocks, unlockedRecipes } from './unlocks.js';

describe('unlockedRecipes', () => {
  it('hands back exactly what the owned schematics unlock', () => {
    const unlocked = unlockedRecipes(db, ['s-1-1']);
    expect([...(unlocked ?? [])].sort()).toEqual([
      'r-iron-ingot',
      'r-iron-plate',
      'r-iron-rod',
      'r-screw',
    ]);
  });

  it('unlocks nothing from an empty save without claiming the database is silent', () => {
    expect(unlockedRecipes(db, [])?.size).toBe(0);
  });

  /*
   * The distinction the whole feature rests on. A database with no unlock data
   * cannot say a recipe is locked, and must not be read as saying everything
   * is — so it answers `null` rather than an empty set.
   */
  it('answers null when the database records no unlocks at all', () => {
    expect(unlockedRecipes({ ...db, schematics: {} }, ['s-1-1'])).toBeNull();
  });

  it('takes either source when a recipe is unlocked twice over', () => {
    expect(unlockedRecipes(db, ['s-drive-plate'])?.has('r-alt-steel-plate')).toBe(true);
    expect(unlockedRecipes(db, ['s-research-plating'])?.has('r-alt-steel-plate')).toBe(true);
    expect(unlockedRecipes(db, ['s-3-4'])?.has('r-alt-steel-plate')).toBe(false);
  });

  it('ignores schematics the database has never heard of', () => {
    // A save from a newer game version names unlocks this database predates.
    expect(unlockedRecipes(db, ['s-1-1', 'Schematic_9-9_C'])?.size).toBe(4);
  });
});

describe('recipeUnlocks', () => {
  it('names every way to a recipe', () => {
    const index = recipeUnlocks(db);
    expect(index.get('r-alt-steel-plate')?.map((s) => s.id).sort()).toEqual([
      's-drive-plate',
      's-research-plating',
    ]);
    expect(index.get('r-steel-ingot')?.map((s) => s.name)).toEqual(['Basic Steel Production']);
  });

  it('says nothing about a recipe nothing unlocks', () => {
    expect(recipeUnlocks(db).get('r-nonexistent')).toBeUndefined();
  });

  it('keeps the kind, which is the difference between buying and hunting', () => {
    const index = recipeUnlocks(db);
    expect(index.get('r-steel-ingot')?.[0]?.kind).toBe('milestone');
    expect(index.get('r-alt-steel-plate')?.[0]?.kind).toBe('hard-drive');
  });
});
