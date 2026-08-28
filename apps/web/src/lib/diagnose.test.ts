import type { GameDatabase } from '@factory-board/planner';
import type { BuildingPlacement } from '@factory-board/save-reader';
import { describe, expect, it } from 'vitest';
import { diagnoseLine, explain } from './diagnose';

/**
 * Real recipes at real rates, because the point of this file is that the maths
 * matches the game: a Rotor genuinely takes 5 Iron Rods and 25 Screws, which is
 * why counting *items* would call a Rotor assembler sitting on 200 rods and 25
 * screws well fed, and counting *runs* correctly calls it short of screws.
 */
const db: GameDatabase = {
  sourceBuildId: 0,
  items: {
    'iron-ore': { id: 'iron-ore', name: 'Iron Ore', isRaw: true, isFluid: false },
    'iron-ingot': { id: 'iron-ingot', name: 'Iron Ingot', isRaw: false, isFluid: false },
    'iron-rod': { id: 'iron-rod', name: 'Iron Rod', isRaw: false, isFluid: false },
    screw: { id: 'screw', name: 'Screw', isRaw: false, isFluid: false },
    rotor: { id: 'rotor', name: 'Rotor', isRaw: false, isFluid: false },
  },
  machines: {
    constructor: { id: 'constructor', name: 'Constructor', powerMW: 4 },
    assembler: { id: 'assembler', name: 'Assembler', powerMW: 15 },
  },
  buildings: {},
  recipes: {
    'r-iron-rod': {
      id: 'r-iron-rod',
      name: 'Iron Rod',
      durationSeconds: 4,
      machine: 'constructor',
      inputs: [{ item: 'iron-ingot', amount: 1 }],
      outputs: [{ item: 'iron-rod', amount: 1 }],
      isAlternate: false,
    },
    'r-screw': {
      id: 'r-screw',
      name: 'Screw',
      durationSeconds: 6,
      machine: 'constructor',
      inputs: [{ item: 'iron-rod', amount: 1 }],
      outputs: [{ item: 'screw', amount: 4 }],
      isAlternate: false,
    },
    'r-rotor': {
      id: 'r-rotor',
      name: 'Rotor',
      durationSeconds: 15,
      machine: 'assembler',
      inputs: [
        { item: 'iron-rod', amount: 5 },
        { item: 'screw', amount: 25 },
      ],
      outputs: [{ item: 'rotor', amount: 1 }],
      isAlternate: false,
    },
  },
  milestones: {},
};

const machine = (
  input: Record<string, number>,
  output: Record<string, number>,
): BuildingPlacement => ({
  machine: 'constructor',
  x: 0,
  y: 0,
  z: 0,
  role: 'production',
  input,
  output,
});

describe('diagnoseLine', () => {
  it('calls a full output backed up, not starving', () => {
    /*
     * The case this file was written for. On the reference save the iron rod
     * constructors sat at 67% with a full input buffer *and* a full output
     * buffer, and the board called them starving — so the advice was "build
     * more smelters", which is exactly the wrong end.
     */
    const line = diagnoseLine(
      db,
      'r-iron-rod',
      0.67,
      [machine({ 'iron-ingot': 100 }, { 'iron-rod': 200 })],
      { 'iron-rod': 5178 },
    );

    expect(line.verdict).toBe('blocked');
    expect(line.backlog).toMatchObject({ item: 'iron-rod', held: 200, stored: 5178 });
    expect(explain(line)).toContain('Nothing downstream');
  });

  it('names the ingredient that ran out, not the one that did not', () => {
    // 200 rods and 25 screws is 40 runs of rods and one run of screws. In
    // items the rods look like the problem; in runs the screws obviously are.
    const line = diagnoseLine(db, 'r-rotor', 0.6, [machine({ 'iron-rod': 200, screw: 25 }, {})]);

    expect(line.verdict).toBe('starving');
    expect(line.shortage?.item).toBe('screw');
    expect(explain(line)).toBe('Short of Screw — 25 left, 25 per run.');
  });

  it('says plainly when an ingredient is not arriving at all', () => {
    const line = diagnoseLine(db, 'r-rotor', 0, [machine({ 'iron-rod': 200 }, {})]);

    expect(line.verdict).toBe('starving');
    expect(line.shortage).toMatchObject({ item: 'screw', held: 0 });
    expect(explain(line)).toBe('No Screw arriving.');
  });

  it('checks the output before the input', () => {
    // A machine that cannot put anything down stops drawing what it is fed, so
    // its input buffer fills up and reads as perfectly healthy. Judging the
    // input first would call this one running well while it makes nothing.
    const line = diagnoseLine(db, 'r-iron-rod', 0.3, [
      machine({ 'iron-ingot': 100 }, { 'iron-rod': 200 }),
    ]);

    expect(line.verdict).toBe('blocked');
  });

  it('does not call a machine backed up for holding what it just made', () => {
    // One run's worth in the output is what a healthy machine looks like
    // between the belt's arrivals — it is the second uncollected run that means
    // something.
    const line = diagnoseLine(db, 'r-iron-rod', 0.8, [
      machine({ 'iron-ingot': 90 }, { 'iron-rod': 1 }),
    ]);

    expect(line.verdict).not.toBe('blocked');
  });

  it('sums the line rather than judging one machine', () => {
    // Four rod constructors where two are backed up and two are keeping pace
    // is one line that cannot shift its rods.
    const line = diagnoseLine(db, 'r-iron-rod', 0.67, [
      machine({ 'iron-ingot': 100 }, { 'iron-rod': 200 }),
      machine({ 'iron-ingot': 100 }, { 'iron-rod': 199 }),
      machine({ 'iron-ingot': 58 }, {}),
      machine({ 'iron-ingot': 60 }, {}),
    ]);

    expect(line.verdict).toBe('blocked');
    expect(line.backlog?.held).toBe(399);
    expect(line.machines).toBe(4);
  });

  it('leaves a healthy line alone without reading its buffers', () => {
    const line = diagnoseLine(db, 'r-screw', 1, [machine({}, {})]);

    expect(line.verdict).toBe('running');
    expect(explain(line)).toBeNull();
  });

  it('says nothing about a line the game has not measured', () => {
    // A machine built moments ago has no history, which is different from one
    // sitting idle — and calling it starving would be an invention.
    const line = diagnoseLine(db, 'r-screw', null, [machine({}, {})]);

    expect(line.verdict).toBe('unmeasured');
  });

  it('admits when the buffers do not explain it', () => {
    /*
     * Fed, not backed up, still slow. The likeliest cause is a power circuit
     * that cannot meet its demand, which is not read yet — so this says so
     * instead of picking the nearest-looking story. Guessing here is the exact
     * habit this file replaced.
     */
    const line = diagnoseLine(db, 'r-iron-rod', 0.4, [machine({ 'iron-ingot': 100 }, {})]);

    expect(line.verdict).toBe('unexplained');
    expect(explain(line)).toContain('check power');
  });

  it('does not invent a reason for a recipe it does not know', () => {
    const line = diagnoseLine(db, 'r-mystery', 0.5, [machine({}, {})]);

    expect(line.verdict).toBe('unexplained');
  });
});
