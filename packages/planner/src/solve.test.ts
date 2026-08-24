import { describe, expect, it } from 'vitest';
import { defaultRecipeFor, recipesProducing, solve } from './solve.js';
import { testDatabase as db } from './fixtures.js';

const lineFor = (result: ReturnType<typeof solve>, recipe: string) =>
  result.lines.find((l) => l.recipe === recipe);

describe('solve', () => {
  it('returns an empty plan for no targets', () => {
    const result = solve(db, []);
    expect(result.lines).toEqual([]);
    expect(result.totalMachines).toBe(0);
    expect(result.totalPowerMW).toBe(0);
    expect(result.warnings).toEqual([]);
  });

  it('computes machine counts that match the real game rates', () => {
    const result = solve(db, [{ item: 'smart-plating', ratePerMinute: 5 }]);

    // One Assembler makes 2 Smart Plating/min, so 5/min needs 2.5 of them.
    expect(lineFor(result, 'r-smart-plating')?.machinesExact).toBeCloseTo(2.5, 6);
    expect(lineFor(result, 'r-smart-plating')?.machinesToBuild).toBe(3);

    expect(lineFor(result, 'r-reinforced-iron-plate')?.machinesExact).toBeCloseTo(1, 6);
    expect(lineFor(result, 'r-rotor')?.machinesExact).toBeCloseTo(1.25, 6);
    expect(lineFor(result, 'r-iron-plate')?.machinesExact).toBeCloseTo(1.5, 6);
    expect(lineFor(result, 'r-iron-ingot')?.machinesExact).toBeCloseTo(3.875, 6);
  });

  it('reports the raw ore the plan actually needs', () => {
    const result = solve(db, [{ item: 'smart-plating', ratePerMinute: 5 }]);
    expect(result.rawInputs['iron-ore']).toBeCloseTo(116.25, 4);
    expect(Object.keys(result.rawInputs)).toEqual(['iron-ore']);
  });

  it('rounds machine counts up, and prices power on what you actually build', () => {
    const result = solve(db, [{ item: 'smart-plating', ratePerMinute: 5 }]);
    // 3 Smart Plating + 1 RIP + 2 Rotor assemblers = 6 × 15 MW
    const assemblerPower = result.lines
      .filter((l) => l.machine === 'assembler')
      .reduce((sum, l) => sum + l.powerMW, 0);
    expect(assemblerPower).toBe(90);
    expect(result.totalMachines).toBe(result.lines.reduce((n, l) => n + l.machinesToBuild, 0));
  });

  it('merges shared intermediates across several targets', () => {
    const separate =
      solve(db, [{ item: 'rotor', ratePerMinute: 4 }]).rawInputs['iron-ore']! +
      solve(db, [{ item: 'reinforced-iron-plate', ratePerMinute: 5 }]).rawInputs['iron-ore']!;
    const together = solve(db, [
      { item: 'rotor', ratePerMinute: 4 },
      { item: 'reinforced-iron-plate', ratePerMinute: 5 },
    ]).rawInputs['iron-ore']!;

    expect(together).toBeCloseTo(separate, 6);
    // ...but as one plan, not two, so the shared rod line is a single entry.
    const rodLines = solve(db, [
      { item: 'rotor', ratePerMinute: 4 },
      { item: 'reinforced-iron-plate', ratePerMinute: 5 },
    ]).lines.filter((l) => l.recipe === 'r-iron-rod');
    expect(rodLines).toHaveLength(1);
  });

  it('adds identical targets together rather than double-counting', () => {
    const once = solve(db, [{ item: 'rotor', ratePerMinute: 8 }]);
    const twice = solve(db, [
      { item: 'rotor', ratePerMinute: 4 },
      { item: 'rotor', ratePerMinute: 4 },
    ]);
    expect(twice.rawInputs['iron-ore']).toBeCloseTo(once.rawInputs['iron-ore']!, 6);
  });

  describe('raw resources', () => {
    // Regression: the browser prototype "solved" a starter factory by mining SAM
    // and running it through Converters, because the Converter recipe for Iron Ore
    // is not flagged as an alternate.
    it('never manufactures a raw resource, even when a non-alternate recipe exists', () => {
      const result = solve(db, [{ item: 'smart-plating', ratePerMinute: 5 }]);

      expect(result.lines.map((l) => l.machine)).not.toContain('converter');
      expect(result.rawInputs).not.toHaveProperty('sam');
      expect(result.rawInputs).toHaveProperty('iron-ore');
    });

    it('holds even when the raw recipe is pinned explicitly', () => {
      const result = solve(db, [{ item: 'smart-plating', ratePerMinute: 5 }], {
        recipeChoices: { 'iron-ore': 'r-iron-ore-from-sam' },
      });
      expect(result.lines.map((l) => l.machine)).not.toContain('converter');
      expect(result.rawInputs['iron-ore']).toBeCloseTo(116.25, 4);
    });

    it('treats a fluid as raw without special-casing it', () => {
      const result = solve(db, [{ item: 'iron-plate', ratePerMinute: 10 }], {
        recipeChoices: { 'iron-plate': 'r-alt-steel-plate' },
      });
      // 0.1333 machines × 15 m³/min = 2 m³/min, already in display units.
      expect(result.rawInputs['water']).toBeCloseTo(2, 6);
    });
  });

  describe('recipe selection', () => {
    it('prefers the standard recipe over an alternate', () => {
      expect(defaultRecipeFor(db, 'iron-plate')?.id).toBe('r-iron-plate');
    });

    it('honours a pinned alternate', () => {
      const result = solve(db, [{ item: 'iron-plate', ratePerMinute: 10 }], {
        recipeChoices: { 'iron-plate': 'r-alt-steel-plate' },
      });
      expect(lineFor(result, 'r-alt-steel-plate')?.machinesExact).toBeCloseTo(0.1333, 3);
      expect(lineFor(result, 'r-iron-plate')).toBeUndefined();
    });

    it('lists every recipe producing an item, alternates included', () => {
      expect(
        recipesProducing(db, 'iron-plate')
          .map((r) => r.id)
          .sort(),
      ).toEqual(['r-alt-steel-plate', 'r-iron-plate']);
    });
  });

  describe('balance', () => {
    it('reports byproducts as surplus rather than crediting them', () => {
      const result = solve(db, [{ item: 'screw', ratePerMinute: 40 }]);
      expect(result.surplus['screw']).toBeCloseTo(40, 6);
      expect(result.surplus).not.toHaveProperty('iron-rod');
    });

    it('tracks production and consumption separately', () => {
      const result = solve(db, [{ item: 'reinforced-iron-plate', ratePerMinute: 5 }]);
      expect(result.produced['screw']).toBeCloseTo(60, 6);
      expect(result.consumed['screw']).toBeCloseTo(60, 6);
    });
  });

  describe('warnings', () => {
    it('flags an item nothing produces and keeps going', () => {
      const result = solve(db, [{ item: 'ficsonium', ratePerMinute: 1 }]);
      expect(result.warnings.map((w) => w.code)).toContain('unknown-item');
      expect(result.rawInputs['ficsonium']).toBe(1);
      expect(result.lines).toEqual([]);
    });

    it('breaks a recipe cycle instead of hanging', () => {
      const cyclic = {
        ...db,
        items: { ...db.items, a: { id: 'a', name: 'A', isRaw: false, isFluid: false } },
        recipes: {
          ...db.recipes,
          'r-a': {
            id: 'r-a',
            name: 'A from A',
            durationSeconds: 1,
            machine: 'constructor',
            inputs: [{ item: 'a', amount: 1 }],
            outputs: [{ item: 'a', amount: 2 }],
            isAlternate: false,
          },
        },
      };
      const result = solve(cyclic, [{ item: 'a', ratePerMinute: 60 }]);
      expect(result.warnings.map((w) => w.code)).toContain('cycle-detected');
    });

    it('reports each problem once, not once per visit', () => {
      const result = solve(db, [
        { item: 'ficsonium', ratePerMinute: 1 },
        { item: 'ficsonium', ratePerMinute: 2 },
      ]);
      expect(result.warnings.filter((w) => w.code === 'unknown-item')).toHaveLength(1);
    });
  });

  it('ignores targets with a non-positive rate', () => {
    expect(solve(db, [{ item: 'rotor', ratePerMinute: 0 }]).lines).toEqual([]);
    expect(solve(db, [{ item: 'rotor', ratePerMinute: -5 }]).lines).toEqual([]);
  });
});
