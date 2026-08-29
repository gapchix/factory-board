import { describe, expect, it } from 'vitest';
import { testDatabase as db } from './fixtures.js';
import { solve } from './solve.js';
import { priceAllSwaps, priceSwaps } from './swaps.js';
import type { GameDatabase } from './types.js';

const plating = [{ item: 'smart-plating', ratePerMinute: 5 }];
const swapFor = (swaps: readonly { recipe: string }[], recipe: string) =>
  swaps.find((s) => s.recipe === recipe);

describe('priceSwaps', () => {
  it('offers every recipe for the item, with the one in use flagged and free', () => {
    const swaps = priceSwaps(db, plating, {}, 'iron-plate');
    expect(swaps.map((s) => s.recipe).sort()).toEqual(['r-alt-steel-plate', 'r-iron-plate']);

    const current = swapFor(swaps, 'r-iron-plate');
    expect(current?.current).toBe(true);
    expect(current?.machines).toBe(0);
    expect(current?.powerMW).toBe(0);
    expect(current?.raw).toEqual({});
  });

  /*
   * The reason a swap is priced against the whole plan rather than its own
   * line: the coated plate recipe eats ingots instead of the plate line's, so
   * the smelters upstream move too. Pricing the plate line alone would report
   * the wrong number in the wrong direction.
   */
  it('prices the whole plan, not the line that changed', () => {
    const alternate = swapFor(priceSwaps(db, plating, {}, 'iron-plate'), 'r-alt-steel-plate');
    const before = solve(db, plating);
    const after = solve(db, plating, { recipeChoices: { 'iron-plate': 'r-alt-steel-plate' } });

    expect(alternate?.machines).toBe(after.totalMachines - before.totalMachines);
    expect(alternate?.powerMW).toBeCloseTo(after.totalPowerMW - before.totalPowerMW, 6);
    // Ore falls because the alternate makes 10 plates from 5 ingots where the
    // standard recipe makes 2 from 3, and water appears where there was none.
    expect(alternate?.raw['iron-ore']).toBeLessThan(0);
    expect(alternate?.raw['water']).toBeGreaterThan(0);
  });

  it('leaves out raw resources the swap does not move', () => {
    const swaps = priceSwaps(db, [{ item: 'steel-ingot', ratePerMinute: 10 }], {}, 'steel-ingot');
    expect(swapFor(swaps, 'r-steel-ingot')?.raw).toEqual({});
  });

  it('ranks cheapest first', () => {
    const swaps = priceSwaps(db, plating, {}, 'iron-plate');
    const machines = swaps.map((s) => s.machines);
    expect([...machines].sort((a, b) => a - b)).toEqual(machines);
  });

  it('prices against a plan that has already pinned something', () => {
    const pinned = { recipeChoices: { 'iron-plate': 'r-alt-steel-plate' } };
    const swaps = priceSwaps(db, plating, pinned, 'iron-plate');
    expect(swapFor(swaps, 'r-alt-steel-plate')?.current).toBe(true);
    // Going back to the standard recipe is now the change, and it costs.
    expect(swapFor(swaps, 'r-iron-plate')?.machines).toBeGreaterThan(0);
    expect(swapFor(swaps, 'r-iron-plate')?.raw['water']).toBeLessThan(0);
  });

  /*
   * A swap can break the plan rather than merely cost more, and saying so is
   * worth more than any number beside it.
   */
  it('reports trouble the swap introduces', () => {
    const cyclic: GameDatabase = {
      ...db,
      recipes: {
        ...db.recipes,
        'r-alt-recycled-plate': {
          id: 'r-alt-recycled-plate',
          name: 'Alternate: Recycled Plate',
          durationSeconds: 6,
          machine: 'constructor',
          inputs: [{ item: 'reinforced-iron-plate', amount: 1 }],
          outputs: [{ item: 'iron-plate', amount: 8 }],
          isAlternate: true,
        },
      },
    };

    const swaps = priceSwaps(cyclic, plating, {}, 'iron-plate');
    expect(swapFor(swaps, 'r-alt-recycled-plate')?.warnings.map((w) => w.code)).toContain(
      'cycle-detected',
    );
    expect(swapFor(swaps, 'r-iron-plate')?.warnings).toEqual([]);
  });
});

describe('priceAllSwaps', () => {
  it('covers every product the plan makes', () => {
    const swaps = priceAllSwaps(db, plating);
    const products = new Set(swaps.map((s) => s.item));
    for (const line of solve(db, plating).lines) expect(products.has(line.primaryOutput)).toBe(true);
  });

  it('carries the item, so a flat list still says what each swap is for', () => {
    const swaps = priceAllSwaps(db, plating);
    expect(swapFor(swaps, 'r-alt-steel-plate')?.item).toBe('iron-plate');
  });

  it('agrees with pricing one item on its own', () => {
    const all = priceAllSwaps(db, plating).filter((s) => s.item === 'iron-plate');
    expect(all).toEqual(priceSwaps(db, plating, {}, 'iron-plate'));
  });
});
