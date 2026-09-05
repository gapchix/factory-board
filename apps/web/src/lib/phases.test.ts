import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PHASES, phaseLabel, quotaFor, requiredFor } from './phases';

/*
 * The extracted database, where this machine has one. Read at the top level
 * rather than inside a `describe`: `describe.skipIf` skips the tests it guards
 * and still runs the factory that declares them, which is how a `readFileSync`
 * inside one threw at collection on every machine without the game.
 */
const generated = resolve(__dirname, '../generated/game-database.json');
let realItems: Record<string, unknown> | null = null;
if (existsSync(generated)) {
  try {
    const envelope = JSON.parse(readFileSync(generated, 'utf8')) as {
      source?: string;
      database?: { items?: Record<string, unknown> };
      items?: Record<string, unknown>;
    };
    const database = envelope.database ?? envelope;
    if (envelope.source !== 'demo' && database.items) realItems = database.items;
  } catch {
    realItems = null;
  }
}

describe('PHASES', () => {
  it('covers every Project Assembly phase', () => {
    expect(Object.keys(PHASES)).toEqual(
      [1, 2, 3, 4, 5].map((n) => `GP_Project_Assembly_Phase_${n}`),
    );
  });

  it.skipIf(realItems === null)('names only parts the real database has', () => {
    for (const definition of Object.values(PHASES)) {
      for (const item of Object.keys(definition.requires)) {
        expect(realItems, item).toHaveProperty(item);
      }
    }
  });
});

describe('requiredFor', () => {
  it('scales the transcribed quota by the multiplier the save was started with', () => {
    expect(requiredFor('GP_Project_Assembly_Phase_1', 1)).toEqual({
      Desc_SpaceElevatorPart_1_C: 50,
    });
    expect(requiredFor('GP_Project_Assembly_Phase_1', 2.5)).toEqual({
      Desc_SpaceElevatorPart_1_C: 125,
    });
  });

  it('rounds to whole parts and never below one', () => {
    expect(requiredFor('GP_Project_Assembly_Phase_5', 0.25)?.['Desc_SpaceElevatorPart_12_C']).toBe(
      64,
    );
    expect(requiredFor('GP_Project_Assembly_Phase_1', 0.001)?.['Desc_SpaceElevatorPart_1_C']).toBe(
      1,
    );
    // A multiplier that makes no sense is read as the default, not as zero.
    expect(requiredFor('GP_Project_Assembly_Phase_1', 0)?.['Desc_SpaceElevatorPart_1_C']).toBe(50);
  });

  it('says nothing about a phase it has not transcribed', () => {
    expect(requiredFor('GP_Project_Assembly_Phase_9')).toBeUndefined();
  });
});

describe('quotaFor', () => {
  const phase = (target: string | null, delivered: Record<string, number>, costMultiplier = 1) => ({
    current: null,
    target,
    delivered,
    costMultiplier,
  });

  it('gives the quota for the target, scaled', () => {
    expect(quotaFor(phase('GP_Project_Assembly_Phase_2', {}, 2))).toEqual({
      label: 'Phase 2',
      requires: {
        Desc_SpaceElevatorPart_1_C: 2000,
        Desc_SpaceElevatorPart_2_C: 2000,
        Desc_SpaceElevatorPart_3_C: 200,
      },
    });
  });

  it('withdraws a quota the save has already exceeded', () => {
    // A progress bar past 100% is a lie about the elevator; delivered amounts
    // with no denominator are the honest fallback.
    expect(quotaFor(phase('GP_Project_Assembly_Phase_1', { Desc_SpaceElevatorPart_1_C: 51 }))).toBe(
      null,
    );
    expect(
      quotaFor(phase('GP_Project_Assembly_Phase_1', { Desc_SpaceElevatorPart_1_C: 50 }))?.label,
    ).toBe('Phase 1');
  });

  it('is nothing without a target or a transcription', () => {
    expect(quotaFor(null)).toBeNull();
    expect(quotaFor(phase(null, {}))).toBeNull();
    expect(quotaFor(phase('GP_Project_Assembly_Phase_9', {}))).toBeNull();
  });
});

describe('phaseLabel', () => {
  it('reads the transcribed label, or tidies the id', () => {
    expect(phaseLabel('GP_Project_Assembly_Phase_4')).toBe('Phase 4');
    expect(phaseLabel('GP_Project_Assembly_Phase_9')).toBe('Phase 9');
    expect(phaseLabel(null)).toBeUndefined();
  });
});
