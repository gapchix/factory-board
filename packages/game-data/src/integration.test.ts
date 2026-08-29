import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { priceSwaps, recipeUnlocks, solve, type GameDatabase } from '@factory-board/planner';
import { parseGameDatabase } from './schema.js';

/**
 * These run against a database extracted from a real Satisfactory install, so
 * they are skipped anywhere `npm run extract` has not been run — CI included.
 * They are the only tests that can catch "the extractor compiles but produces
 * subtly wrong data", which is exactly the class of bug the unit tests can't see.
 */
const generated = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'generated',
  'game-database.json',
);
/*
 * Read out here, not inside the block below.
 *
 * `describe.skipIf` skips the *tests* and still runs the factory that declares
 * them, so a `readFileSync` in there throws ENOENT at collection time on any
 * machine without the game — which turned every CI run red, quietly, for as
 * long as this file has existed. The skip was doing exactly what it promised
 * and the read was never covered by it.
 */
const available = existsSync(generated);
const loaded = available ? parseGameDatabase(JSON.parse(readFileSync(generated, 'utf8'))) : null;

const SMART_PLATING = 'Desc_SpaceElevatorPart_1_C';
const VERSATILE_FRAMEWORK = 'Desc_SpaceElevatorPart_2_C';
const AUTOMATED_WIRING = 'Desc_SpaceElevatorPart_3_C';
const IRON_ORE = 'Desc_OreIron_C';
const COAL = 'Desc_Coal_C';
const COPPER_ORE = 'Desc_OreCopper_C';

describe.skipIf(!available)('extracted database', () => {
  // Only ever reached when the database is there, which is what the skip says.
  const db = loaded as GameDatabase;

  it('contains the whole recipe book', () => {
    expect(Object.keys(db.recipes).length).toBeGreaterThan(250);
    expect(Object.values(db.recipes).filter((r) => r.isAlternate).length).toBeGreaterThan(90);
    expect(Object.keys(db.milestones).length).toBeGreaterThanOrEqual(42);
  });

  it('keeps the variable-power machines that declare no fixed consumption', () => {
    const converter = db.machines['Converter'];
    expect(converter).toBeDefined();
    expect(converter?.powerRangeMW).toEqual({ min: 100, max: 400 });
    expect(converter?.powerMW).toBe(250);
  });

  it('marks ore and water correctly', () => {
    expect(db.items[IRON_ORE]?.isRaw).toBe(true);
    expect(db.items['Desc_Water_C']?.isFluid).toBe(true);
  });

  it('normalises fluid amounts to cubic metres', () => {
    // Plastic takes 3 m³ of crude oil per cycle, stored as 3000 in the game files.
    const plastic = db.recipes['Recipe_Plastic_C'];
    expect(plastic?.inputs.find((i) => i.item === 'Desc_LiquidOil_C')?.amount).toBe(3);
  });

  // The whole point of the tool: these numbers must match the game, and they are
  // the same ones the published base plan was built on.
  it('solves Space Elevator Phase 2 to the known-good factory', () => {
    const result = solve(db, [
      { item: SMART_PLATING, ratePerMinute: 5 },
      { item: VERSATILE_FRAMEWORK, ratePerMinute: 5 },
      { item: AUTOMATED_WIRING, ratePerMinute: 1 },
    ]);

    expect(result.warnings).toEqual([]);
    expect(result.totalMachines).toBe(44);
    expect(result.totalPowerMW).toBe(344);
    expect(result.rawInputs[IRON_ORE]).toBeCloseTo(300.75, 2);
    expect(result.rawInputs[COAL]).toBeCloseTo(124.5, 2);
    expect(result.rawInputs[COPPER_ORE]).toBeCloseTo(24, 2);
  });

  it('knows what stands between the player and every recipe it kept', () => {
    expect(Object.keys(db.schematics).length).toBeGreaterThan(150);

    const index = recipeUnlocks(db);
    const orphaned = Object.keys(db.recipes).filter((id) => !index.has(id));
    expect(orphaned).toEqual([]);
  });

  it('puts every alternate behind something, and names the tier for a milestone', () => {
    const index = recipeUnlocks(db);
    const alternates = Object.values(db.recipes).filter((r) => r.isAlternate);
    expect(alternates.every((r) => (index.get(r.id) ?? []).length > 0)).toBe(true);

    expect(index.get('Recipe_Alternate_Screw_C')?.[0]).toMatchObject({
      name: 'Alternate: Cast Screws',
      kind: 'hard-drive',
    });
    expect(index.get('Recipe_IngotSteel_C')?.[0]).toMatchObject({
      name: 'Basic Steel Production',
      kind: 'milestone',
      tier: 3,
    });
  });

  /*
   * The same plan the numbers above pin, asked the other question: of the ways
   * to make a screw, what does each cost. Cast Screws is the interesting answer
   * — it removes the rod constructors that only ever existed to feed the screw
   * constructors, and takes no more ore to do it.
   */
  it('prices a real alternate against the Phase 2 plan', () => {
    const targets = [
      { item: SMART_PLATING, ratePerMinute: 5 },
      { item: VERSATILE_FRAMEWORK, ratePerMinute: 5 },
      { item: AUTOMATED_WIRING, ratePerMinute: 1 },
    ];
    const swaps = priceSwaps(db, targets, {}, 'Desc_IronScrew_C');

    const cast = swaps.find((s) => s.recipe === 'Recipe_Alternate_Screw_C');
    expect(cast?.machines).toBe(-5);
    expect(cast?.powerMW).toBe(-20);
    expect(cast?.raw).toEqual({});

    // And one that is cheaper still, by trading ore for coal you have to go and mine.
    const steel = swaps.find((s) => s.recipe === 'Recipe_Alternate_Screw_2_C');
    expect(steel?.machines).toBe(-9);
    expect(steel?.raw[IRON_ORE]).toBeLessThan(0);
    expect(steel?.raw[COAL]).toBeGreaterThan(0);

    expect(swaps.find((s) => s.current)?.recipe).toBe('Recipe_Screw_C');
  });

  it('never mines SAM to make iron, on the real recipe book', () => {
    const result = solve(db, [{ item: SMART_PLATING, ratePerMinute: 5 }]);
    expect(result.rawInputs).not.toHaveProperty('Desc_SAM_C');
    expect(result.lines.map((l) => l.machine)).not.toContain('Converter');
    expect(result.rawInputs[IRON_ORE]).toBeCloseTo(116.25, 2);
  });
});

describe.skipIf(available)('extracted database (absent)', () => {
  it('tells you how to get one', () => {
    expect(available).toBe(false);
    // `npm run extract` reads your own Satisfactory install. See docs/SPEC.md.
  });
});
