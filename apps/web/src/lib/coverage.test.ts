import type { GameDatabase } from '@factory-board/planner';
import { describe, expect, it } from 'vitest';
import { unknownLines } from './coverage';

const db = {
  recipes: {
    Recipe_IngotIron_C: {
      id: 'Recipe_IngotIron_C',
      name: 'Iron Ingot',
      durationSeconds: 2,
      machine: 'SmelterMk1',
      inputs: [],
      outputs: [],
      isAlternate: false,
    },
  },
} as unknown as GameDatabase;

const line = (recipe: string) => ({ recipe, machine: 'x', count: 1, uptime: null, clock: 1 });

describe('unknownLines', () => {
  it('names the lines the book has never heard of, in order', () => {
    const lines = {
      Recipe_Screw_C: line('Recipe_Screw_C'),
      Recipe_IngotIron_C: line('Recipe_IngotIron_C'),
      Recipe_Cable_C: line('Recipe_Cable_C'),
    };
    expect(unknownLines(db, { lines })).toEqual(['Recipe_Cable_C', 'Recipe_Screw_C']);
  });

  it('is empty when the book matches the world, and without a world', () => {
    expect(unknownLines(db, { lines: { Recipe_IngotIron_C: line('Recipe_IngotIron_C') } })).toEqual(
      [],
    );
    expect(unknownLines(db, { lines: {} })).toEqual([]);
    expect(unknownLines(db, null)).toEqual([]);
  });
});
