import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { solve, type GameDatabase } from '@factory-board/planner';
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
