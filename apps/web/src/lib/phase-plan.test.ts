import type { GameDatabase } from '@factory-board/planner';
import type { WorldSnapshot } from '@factory-board/save-reader';
import { describe, expect, it } from 'vitest';
import { duration, planForPhase } from './phase-plan';

/**
 * Phase 2's real quotas — 500, 500 and 100 — because the whole point of this
 * file is that the numbers it proposes are the game's own.
 */
const db: GameDatabase = {
  sourceBuildId: 0,
  items: {
    Desc_SpaceElevatorPart_1_C: {
      id: 'Desc_SpaceElevatorPart_1_C',
      name: 'Smart Plating',
      isRaw: false,
      isFluid: false,
    },
    Desc_SpaceElevatorPart_2_C: {
      id: 'Desc_SpaceElevatorPart_2_C',
      name: 'Versatile Framework',
      isRaw: false,
      isFluid: false,
    },
    Desc_SpaceElevatorPart_3_C: {
      id: 'Desc_SpaceElevatorPart_3_C',
      name: 'Automated Wiring',
      isRaw: false,
      isFluid: false,
    },
  },
  machines: { assembler: { id: 'assembler', name: 'Assembler', powerMW: 15 } },
  buildings: {},
  recipes: {
    // The real recipe: one Smart Plating every 30 seconds, so 2/min a machine.
    'r-smart-plating': {
      id: 'r-smart-plating',
      name: 'Smart Plating',
      durationSeconds: 30,
      machine: 'assembler',
      inputs: [],
      outputs: [{ item: 'Desc_SpaceElevatorPart_1_C', amount: 1 }],
      isAlternate: false,
    },
  },
  milestones: {},
  generators: {},
  carriers: {},
  extractors: {},
  schematics: {},
};

const snapshot = (
  delivered: Record<string, number>,
  stored: Record<string, number> = {},
  lines: WorldSnapshot['lines'] = {},
): WorldSnapshot => ({
  sessionName: 'polska',
  playDurationSeconds: 0,
  saveBuildVersion: 0,
  savedAt: null,
  lines,
  buildings: {},
  stored,
  placements: [],
  paths: [],
  links: [],
  milestones: [],
  circuits: [],
  phase: { current: null, target: 'GP_Project_Assembly_Phase_2', delivered },
  objectCount: 0,
});

describe('planForPhase', () => {
  it('plans what is left, not what the quota says', () => {
    // The static preset set 5 : 5 : 1 whether you had delivered none of it or
    // all but the last twenty. This is the difference.
    const plan = planForPhase(db, snapshot({ Desc_SpaceElevatorPart_1_C: 480 }));

    const smart = plan?.parts.find((part) => part.item === 'Desc_SpaceElevatorPart_1_C');
    expect(smart).toMatchObject({ required: 500, delivered: 480, toMake: 20 });
  });

  it('does not ask you to build what is already built', () => {
    // On the reference save 34 Smart Plating were sitting in a container while
    // the elevator showed 0 delivered. They still have to reach the elevator;
    // nobody has to make them again.
    const plan = planForPhase(db, snapshot({}, { Desc_SpaceElevatorPart_1_C: 34 }));

    const smart = plan?.parts.find((part) => part.item === 'Desc_SpaceElevatorPart_1_C');
    expect(smart).toMatchObject({ stored: 34, toMake: 466 });
  });

  it('lands every part at the same moment', () => {
    /*
     * A phase is delivered when its *last* part arrives, so finishing one of
     * three early buys nothing. Rates are scaled to whichever has furthest to
     * go — 500, 500 and 100 gives 5 : 5 : 1, which is the ratio the hand-written
     * preset used and the reason it looked right on a fresh phase.
     */
    const plan = planForPhase(db, snapshot({}));

    expect(plan?.targets).toEqual([
      { item: 'Desc_SpaceElevatorPart_1_C', ratePerMinute: 5 },
      { item: 'Desc_SpaceElevatorPart_2_C', ratePerMinute: 5 },
      { item: 'Desc_SpaceElevatorPart_3_C', ratePerMinute: 1 },
    ]);
    expect(plan?.minutes).toBe(100);
  });

  it('proposes whole units a minute', () => {
    // 466 over 100 minutes is 4.66/min, which is a true number and a useless
    // instruction.
    const plan = planForPhase(db, snapshot({}, { Desc_SpaceElevatorPart_1_C: 34 }));

    for (const target of plan?.targets ?? []) {
      expect(Number.isInteger(target.ratePerMinute)).toBe(true);
    }
  });

  it('says what the factory makes of each part today', () => {
    // One assembler at full clock, running at 60% of the time it could.
    const plan = planForPhase(
      db,
      snapshot(
        {},
        {},
        {
          'r-smart-plating': {
            recipe: 'r-smart-plating',
            machine: 'assembler',
            count: 1,
            uptime: 0.6,
            clock: 1,
          },
        },
      ),
    );

    const smart = plan?.parts.find((part) => part.item === 'Desc_SpaceElevatorPart_1_C');
    // 1 per 30s is 2/min nominal; at 60% uptime that is 1.2.
    expect(smart?.ratePerMinute).toBeCloseTo(1.2);
  });

  it('reports nothing to make once the quota is covered', () => {
    const plan = planForPhase(
      db,
      snapshot({
        Desc_SpaceElevatorPart_1_C: 500,
        Desc_SpaceElevatorPart_2_C: 500,
        Desc_SpaceElevatorPart_3_C: 100,
      }),
    );

    expect(plan?.done).toBe(true);
    expect(plan?.targets).toEqual([]);
  });

  it('says nothing at all about a phase it has no quotas for', () => {
    // Quotas are transcribed, not extracted. Inventing a denominator would be
    // worse than showing none.
    const unknown = { ...snapshot({}), phase: { current: null, target: 'Phase_9', delivered: {} } };

    expect(planForPhase(db, unknown)).toBeNull();
    expect(planForPhase(db, { ...snapshot({}), phase: null })).toBeNull();
  });
});

describe('duration', () => {
  it('reads as a person would say it', () => {
    expect(duration(40)).toBe('40m');
    expect(duration(100)).toBe('1h 40m');
    expect(duration(120)).toBe('2h');
  });
});
