import { describe, expect, it } from 'vitest';
import { testDatabase as db } from './fixtures.js';
import { fuelToCarry, generatorsToCover } from './power.js';
import type { GameDatabase } from './types.js';

describe('fuelToCarry', () => {
  /*
   * The rates are the game's own, so this checks the arithmetic against
   * Satisfactory rather than against itself: 75 MW off 15 Coal/min and
   * 45 m³ Water/min is what a Coal-Powered Generator does.
   */
  it('prices a full generator at the game rate', () => {
    const burn = fuelToCarry(db, { generator: 'coal-generator' }, 75);
    expect(burn?.fuelPerMinute).toBeCloseTo(15);
    expect(burn?.supplemental).toEqual({ item: 'water', ratePerMinute: 45 });
  });

  /*
   * The rule the whole module rests on. A generator throttles to the load on
   * its grid and burns fuel in proportion, so the bill follows the megawatts
   * drawn rather than the generators standing — which is why five coal
   * generators idling at 20% cost exactly what one at full output costs.
   */
  it('scales the burn with the load, not the generator count', () => {
    const half = fuelToCarry(db, { generator: 'coal-generator' }, 37.5);
    expect(half?.fuelPerMinute).toBeCloseTo(7.5);
    expect(half?.supplemental?.ratePerMinute).toBeCloseTo(22.5);

    const five = fuelToCarry(db, { generator: 'coal-generator' }, 375);
    expect(five?.fuelPerMinute).toBeCloseTo(75);
  });

  it('carries the byproduct through at the same load', () => {
    const burn = fuelToCarry(db, { generator: 'nuclear-plant' }, 1250);
    expect(burn?.fuelPerMinute).toBeCloseTo(0.1);
    expect(burn?.byproduct).toEqual({ item: 'uranium-waste', ratePerMinute: 5 });
  });

  it('says nothing rather than guessing about a generator it has never heard of', () => {
    expect(fuelToCarry(db, { generator: 'geothermal' }, 100)).toBeNull();
    expect(fuelToCarry(db, { generator: 'coal-generator', fuel: 'turbofuel' }, 100)).toBeNull();
    expect(fuelToCarry(db, { generator: 'coal-generator' }, 0)).toBeNull();
  });
});

describe('generatorsToCover', () => {
  /*
   * Generators come whole and fuel does not: two are needed to stand behind
   * 80 MW, and between them they still only burn the 80 MW asked for.
   */
  it('rounds the build up and leaves the burn where it is', () => {
    const coal = generatorsToCover(db, 80).find((c) => c.generator === 'coal-generator');
    expect(coal?.count).toBe(2);
    expect(coal?.capacityMW).toBe(150);
    expect(coal?.powerMW).toBe(80);
    expect(coal?.fuelPerMinute).toBeCloseTo(16);
  });

  /*
   * A 9 MW shortfall is answered with a Biomass Burner, not a Nuclear Power
   * Plant — and a 200 MW one is not either, though the reactor covers it in a
   * single building. Ranking by building count alone hands someone twelve
   * times the power they asked for and calls it the best option.
   */
  it('leads with what stands least idle, not with what takes fewest buildings', () => {
    expect(generatorsToCover(db, 9)[0]?.generator).toBe('biomass-burner');

    const two = generatorsToCover(db, 200);
    expect(two[0]?.capacityMW).toBe(210);
    expect(two.at(-1)?.generator).toBe('nuclear-plant');
  });

  /*
   * What the grid already runs beats what the arithmetic prefers: someone with
   * six coal generators wants a seventh, not their first reactor.
   */
  it('puts what the world already runs first', () => {
    const covers = generatorsToCover(db, 2000, { prefer: [{ generator: 'coal-generator' }] });
    expect(covers[0]?.generator).toBe('coal-generator');
    expect(covers[0]?.count).toBe(27);
    // Preferred once, not twice.
    expect(covers.filter((c) => c.generator === 'coal-generator')).toHaveLength(1);
  });

  /*
   * The game's own first fuel is the wrong default for the one generator every
   * new save has. A Biomass Burner's list opens with Leaves, so the honest
   * arithmetic for 240 MW is 876 Leaves a minute — a true number nobody can
   * act on. What fuel to quote is a fact about the world, not the recipe book.
   */
  it('takes the fuel from the caller when the game’s own order is unhelpful', () => {
    expect(generatorsToCover(db, 30)[0]).toMatchObject({ fuel: 'leaves', fuelPerMinute: 120 });

    const [burner] = generatorsToCover(db, 30, {
      fuels: { 'biomass-burner': 'solid-biofuel' },
    });
    expect(burner).toMatchObject({ fuel: 'solid-biofuel', fuelPerMinute: 4 });

    // A fuel that generator will not take falls back rather than vanishing.
    const [fallback] = generatorsToCover(db, 30, { fuels: { 'biomass-burner': 'coal' } });
    expect(fallback).toMatchObject({ generator: 'biomass-burner', fuel: 'leaves' });
  });

  it('offers nothing when the database knows no generators', () => {
    const bare: GameDatabase = { ...db, generators: {} };
    expect(generatorsToCover(bare, 100)).toEqual([]);
    expect(generatorsToCover(db, 0)).toEqual([]);
  });
});
