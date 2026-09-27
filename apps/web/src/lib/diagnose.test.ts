import type { GameDatabase } from '@factory-board/planner';
import type { BuildingPlacement, WorldSnapshot } from '@factory-board/save-reader';
import { describe, expect, it } from 'vitest';
import {
  diagnose,
  diagnoseLine,
  explain,
  type FixContext,
  fixFor,
  type LineDiagnosis,
  topProblems,
} from './diagnose';

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
  generators: {},
  carriers: {},
  extractors: {},
  schematics: {},
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

  /*
   * "Nothing downstream is taking them" is where the board used to stop, and
   * sometimes the belt itself is the answer: a run every one of these machines
   * has to get its output down, carrying more than its tier can take. Two
   * stated numbers rather than a story about a backlog — and only ever offered
   * where `forcedFlow` proves the output cannot go round it.
   */
  it('names the belt when a full one is the reason', () => {
    const line = diagnoseLine(
      db,
      'r-iron-rod',
      0.67,
      [machine({ 'iron-ingot': 100 }, { 'iron-rod': 200 })],
      {},
      [],
      {
        carrier: 'ConveyorBeltMk1',
        name: 'Conveyor Belt Mk.1',
        capacityPerMinute: 60,
        carryingPerMinute: 120,
      },
    );

    expect(line.verdict).toBe('blocked');
    expect(explain(line)).toContain('Conveyor Belt Mk.1 out of it carries 60/min');
    expect(explain(line)).not.toContain('Nothing downstream');
  });

  it('does not blame a belt for a line that is starving', () => {
    const line = diagnoseLine(
      db,
      'r-rotor',
      0.6,
      [machine({ 'iron-rod': 200, screw: 0 }, {})],
      {},
      [],
      {
        carrier: 'ConveyorBeltMk1',
        name: 'Conveyor Belt Mk.1',
        capacityPerMinute: 60,
        carryingPerMinute: 120,
      },
    );

    expect(line.verdict).toBe('starving');
    expect(line.carrier).toBeNull();
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

  it('admits when nothing it can read explains it', () => {
    /*
     * Powered, fed, not backed up, still slow. Everything this file can check
     * has been checked, so it says that rather than picking the nearest-looking
     * story. Guessing here is the exact habit it replaced.
     */
    const line = diagnoseLine(db, 'r-iron-rod', 0.4, [machine({ 'iron-ingot': 100 }, {})]);

    expect(line.verdict).toBe('unexplained');
    expect(explain(line)).toBe('Powered, fed and not backed up, yet still slow.');
  });

  it('does not invent a reason for a recipe it does not know', () => {
    const line = diagnoseLine(db, 'r-mystery', 0.5, [machine({}, {})]);

    expect(line.verdict).toBe('unexplained');
  });
});

describe('diagnoseLine · power', () => {
  const grid = (id: number, demandMW: number, capacityMW: number) => ({
    id,
    members: [],
    demandMW,
    capacityMW,
  });
  const onGrid = (
    circuit: number | undefined,
    input: Record<string, number>,
    output: Record<string, number> = {},
  ): BuildingPlacement => ({
    ...machine(input, output),
    ...(circuit === undefined ? {} : { circuit }),
  });

  it('blames the grid before the buffers', () => {
    /*
     * A machine whose grid has died looks exactly like a starving one — it
     * stops drawing, so its input fills and its output stays empty. Reading
     * the buffers first would report a supply problem it does not have.
     */
    const line = diagnoseLine(db, 'r-iron-rod', 0.2, [onGrid(1, { 'iron-ingot': 0 })], {}, [
      grid(1, 40, 30),
    ]);

    expect(line.verdict).toBe('unpowered');
    expect(line.power).toMatchObject({ kind: 'overloaded', circuit: 1 });
    expect(explain(line)).toBe('Grid 1 is over capacity — 40 MW asked for, 30 MW built.');
  });

  it('leaves a grid alone when it can meet its demand', () => {
    const line = diagnoseLine(db, 'r-iron-rod', 0.5, [onGrid(0, { 'iron-ingot': 0 })], {}, [
      grid(0, 166, 490),
    ]);

    expect(line.verdict).toBe('starving');
  });

  it('judges each grid on its own, because the game does', () => {
    // A base with two grids can have one browning out while the other idles;
    // a machine is only in trouble if *its* grid is.
    const line = diagnoseLine(
      db,
      'r-iron-rod',
      0.5,
      [onGrid(0, { 'iron-ingot': 100 }, { 'iron-rod': 200 })],
      {},
      [grid(0, 10, 490), grid(1, 40, 30)],
    );

    expect(line.verdict).toBe('blocked');
  });

  it('says when a machine is wired to nothing', () => {
    const line = diagnoseLine(db, 'r-iron-rod', 0, [onGrid(undefined, { 'iron-ingot': 100 })], {}, [
      grid(0, 10, 490),
    ]);

    expect(line.verdict).toBe('unpowered');
    expect(explain(line)).toBe('Not wired to a power grid.');
  });

  it('does not call everything unwired on a save with no power at all', () => {
    // A fresh save has no grids to be off. Reporting every machine as unwired
    // there would be the guessing this file exists to avoid.
    const line = diagnoseLine(
      db,
      'r-iron-rod',
      0.5,
      [onGrid(undefined, { 'iron-ingot': 0 })],
      {},
      [],
    );

    expect(line.verdict).toBe('starving');
  });
});

describe('diagnoseLine · what is already in a box', () => {
  it('says when the missing thing is already on site', () => {
    /*
     * The reference save's Rotor assembler sat on 25 screws and the base held
     * a thousand more in a container. "Short of screws" invites building more
     * screw constructors, which is the wrong end entirely — the belt goes
     * somewhere else.
     */
    const line = diagnoseLine(db, 'r-rotor', 0.6, [machine({ 'iron-rod': 200, screw: 25 }, {})], {
      screw: 1000,
    });

    expect(line.shortage).toMatchObject({ item: 'screw', stored: 1000 });
    expect(explain(line)).toBe(
      'Short of Screw — 25 left, 25 per run. 1,000 sitting in a container — this is routing, not production.',
    );
  });

  it('ignores a handful that would not cover a single run', () => {
    // Three screws in a box explains nothing about a recipe that wants 25.
    const line = diagnoseLine(db, 'r-rotor', 0.6, [machine({ 'iron-rod': 200, screw: 25 }, {})], {
      screw: 3,
    });

    expect(explain(line)).toBe('Short of Screw — 25 left, 25 per run.');
  });

  it('says it even when nothing is arriving at all', () => {
    const line = diagnoseLine(db, 'r-rotor', 0, [machine({ 'iron-rod': 200 }, {})], {
      screw: 1000,
    });

    expect(explain(line)).toContain('1,000 sitting in a container');
  });
});

const emptySnapshot: WorldSnapshot = {
  sessionName: 'test',
  playDurationSeconds: 0,
  saveBuildVersion: 0,
  savedAt: null,
  lines: {},
  buildings: {},
  stored: {},
  placements: [],
  paths: [],
  links: [],
  milestones: [],
  circuits: [],
  phase: null,
  objectCount: 0,
  modded: false,
};

/**
 * The carrier ladder at the game's own rates: belts and lifts 60 → 1,200, the
 * pipelines 300 and 600 m³/min. Kinds are mixed on purpose, so a rule that
 * forgot to stay within one would reach for a belt to fix a lift.
 */
const carrier = (id: string, kind: 'belt' | 'lift' | 'pipe', ratePerMinute: number, name: string) =>
  [id, { id, name, kind, ratePerMinute }] as const;
const withCarriers: GameDatabase = {
  ...db,
  carriers: Object.fromEntries([
    carrier('ConveyorBeltMk1', 'belt', 60, 'Conveyor Belt Mk.1'),
    carrier('ConveyorBeltMk2', 'belt', 120, 'Conveyor Belt Mk.2'),
    carrier('ConveyorBeltMk3', 'belt', 270, 'Conveyor Belt Mk.3'),
    carrier('ConveyorBeltMk4', 'belt', 480, 'Conveyor Belt Mk.4'),
    carrier('ConveyorBeltMk5', 'belt', 780, 'Conveyor Belt Mk.5'),
    carrier('ConveyorBeltMk6', 'belt', 1200, 'Conveyor Belt Mk.6'),
    carrier('ConveyorLiftMk1', 'lift', 60, 'Conveyor Lift Mk.1'),
    carrier('ConveyorLiftMk2', 'lift', 120, 'Conveyor Lift Mk.2'),
    carrier('ConveyorLiftMk3', 'lift', 270, 'Conveyor Lift Mk.3'),
    carrier('Pipeline', 'pipe', 300, 'Pipeline Mk.1'),
    carrier('PipelineMK2', 'pipe', 600, 'Pipeline Mk.2'),
    carrier('PipelineMK2_NoIndicator', 'pipe', 600, 'Clean Pipeline Mk.2'),
  ]),
};

const context = (
  overrides: Partial<{ built: string[]; makers: Record<string, string[]> }> = {},
): FixContext => ({
  db: withCarriers,
  built: new Set(overrides.built ?? ['ConveyorBeltMk1', 'ConveyorBeltMk2']),
  makers: new Map(Object.entries(overrides.makers ?? {})),
});

const backedUpOn = (id: string, capacityPerMinute: number, carryingPerMinute: number) =>
  diagnoseLine(
    withCarriers,
    'r-iron-rod',
    0.5,
    [machine({ 'iron-ingot': 50 }, { 'iron-rod': 90 })],
    {},
    [],
    { carrier: id, name: id, capacityPerMinute, carryingPerMinute },
  );

describe('fixFor · a full carrier', () => {
  it('names the next belt that carries the rate', () => {
    const fix = fixFor(
      backedUpOn('ConveyorBeltMk2', 120, 180),
      context({ built: ['ConveyorBeltMk3'] }),
    );

    expect(fix).toBe('Upgrade it to Conveyor Belt Mk.3 (270/min).');
  });

  it('skips a tier that would still be full', () => {
    const fix = fixFor(
      backedUpOn('ConveyorBeltMk2', 120, 300),
      context({ built: ['ConveyorBeltMk4'] }),
    );

    expect(fix).toBe('Upgrade it to Conveyor Belt Mk.4 (480/min).');
  });

  it('says when nobody has built that tier yet, rather than calling it locked', () => {
    const fix = fixFor(backedUpOn('ConveyorBeltMk2', 120, 180), context());

    expect(fix).toBe(
      'Upgrade it to Conveyor Belt Mk.3 (270/min). You have not built one yet, so it may still need unlocking.',
    );
  });

  it('keeps a lift a lift', () => {
    const fix = fixFor(
      backedUpOn('ConveyorLiftMk2', 120, 200),
      context({ built: ['ConveyorLiftMk3'] }),
    );

    expect(fix).toBe('Upgrade it to Conveyor Lift Mk.3 (270/min).');
  });

  it('keeps a pipe a pipe, in m³', () => {
    const fix = fixFor(backedUpOn('Pipeline', 300, 450), context({ built: ['PipelineMK2'] }));

    expect(fix).toBe('Upgrade it to Pipeline Mk.2 (600 m³/min).');
  });

  it('names the variant already built when two share a rate', () => {
    const fix = fixFor(
      backedUpOn('Pipeline', 300, 450),
      context({ built: ['PipelineMK2_NoIndicator'] }),
    );

    expect(fix).toBe('Upgrade it to Clean Pipeline Mk.2 (600 m³/min).');
  });

  it('splits when no tier of its kind is enough', () => {
    const lift = fixFor(backedUpOn('ConveyorLiftMk3', 270, 400), context());
    const belt = fixFor(backedUpOn('ConveyorBeltMk6', 1200, 1500), context());

    expect(lift).toBe('No single lift carries 400/min: split the output onto a second one.');
    expect(belt).toBe('No single belt carries 1500/min: split the output onto a second one.');
  });

  it('does not guess a tier for a carrier the book does not know', () => {
    const fix = fixFor(backedUpOn('ConveyorBeltMk9', 2000, 2400), context());

    expect(fix).toBe('Give the output a second route.');
  });

  it('points somewhere to send it when no belt is to blame', () => {
    const line = diagnoseLine(withCarriers, 'r-iron-rod', 0.3, [machine({}, { 'iron-rod': 90 })]);

    expect(fixFor(line, context())).toBe(
      'Give the Iron Rod somewhere to go: a line that uses it, a container or an AWESOME Sink.',
    );
  });
});

describe('fixFor · a short ingredient', () => {
  it('names the line that makes it', () => {
    const line = diagnoseLine(withCarriers, 'r-rotor', 0.6, [
      machine({ 'iron-rod': 200, screw: 25 }, {}),
    ]);

    expect(fixFor(line, context({ makers: { screw: ['r-screw'] } }))).toBe(
      'Get more Screw here: build more Screw, or check its belt reaches this line.',
    );
  });

  it('says when nothing in the base makes it', () => {
    const line = diagnoseLine(withCarriers, 'r-rotor', 0.6, [
      machine({ 'iron-rod': 200, screw: 25 }, {}),
    ]);

    expect(fixFor(line, context())).toBe('Nothing in this base makes Screw. Build a line for it.');
  });

  it('does not count the starving line as its own supplier', () => {
    const line = diagnoseLine(withCarriers, 'r-rotor', 0.6, [
      machine({ 'iron-rod': 200, screw: 25 }, {}),
    ]);

    expect(fixFor(line, context({ makers: { screw: ['r-rotor'] } }))).toBe(
      'Nothing in this base makes Screw. Build a line for it.',
    );
  });

  it('sends you to the box rather than to build more', () => {
    const line = diagnoseLine(
      withCarriers,
      'r-rotor',
      0.6,
      [machine({ 'iron-rod': 200, screw: 25 }, {})],
      { screw: 800 },
    );

    expect(fixFor(line, context({ makers: { screw: ['r-screw'] } }))).toBe(
      'Feed it from the container holding Screw.',
    );
  });

  it('asks for more extraction for something that comes out of the ground', () => {
    const ore: GameDatabase = {
      ...withCarriers,
      recipes: {
        ...withCarriers.recipes,
        'r-iron-ingot': {
          id: 'r-iron-ingot',
          name: 'Iron Ingot',
          durationSeconds: 2,
          machine: 'constructor',
          inputs: [{ item: 'iron-ore', amount: 1 }],
          outputs: [{ item: 'iron-ingot', amount: 1 }],
          isAlternate: false,
        },
      },
    };
    const line = diagnoseLine(ore, 'r-iron-ingot', 0.4, [machine({ 'iron-ore': 0 }, {})]);

    expect(fixFor(line, { ...context(), db: ore })).toBe(
      'Bring in more Iron Ore: another miner, a better node, or a faster belt from the ones you have.',
    );
  });
});

describe('fixFor · power and the rest', () => {
  const onGrid = (circuit: number | undefined) => ({
    ...machine({ 'iron-ingot': 0 }, {}),
    circuit,
  });
  const grid = (id: number, demandMW: number, capacityMW: number) => ({
    id,
    members: [],
    demandMW,
    capacityMW,
  });

  it('says how much power is missing, rounded up', () => {
    const line = diagnoseLine(withCarriers, 'r-iron-rod', 0.2, [onGrid(3)], {}, [
      grid(3, 140.2, 100),
    ]);

    expect(fixFor(line, context())).toBe(
      'Add at least 41 MW to grid 3, or refuel the generators it already has.',
    );
  });

  it('wires an unwired line', () => {
    const line = diagnoseLine(withCarriers, 'r-iron-rod', 0, [onGrid(undefined)], {}, [
      grid(1, 10, 50),
    ]);

    expect(fixFor(line, context())).toBe('Connect these machines to a power grid.');
  });

  it('asks for the book when the recipe is unknown', () => {
    const line = diagnoseLine(withCarriers, 'r-mystery', 0.5, [machine({}, {})]);

    expect(explain(line)).toBe(
      'The recipe book does not know this recipe, so its buffers cannot be read.',
    );
    expect(fixFor(line, context())).toBe(
      "Drop your game's Docs.json on the page so this line can be read.",
    );
  });

  it('sends you to look when nothing it can read explains it', () => {
    const line = diagnoseLine(withCarriers, 'r-iron-rod', 0.4, [
      machine({ 'iron-ingot': 100 }, {}),
    ]);

    expect(fixFor(line, context())).toBe(
      'Check these machines in the game. From here they look powered, fed and clear.',
    );
  });

  it('has nothing to fix on a line that is running or unmeasured', () => {
    expect(
      fixFor(diagnoseLine(withCarriers, 'r-screw', 1, [machine({}, {})]), context()),
    ).toBeNull();
    expect(
      fixFor(diagnoseLine(withCarriers, 'r-screw', null, [machine({}, {})]), context()),
    ).toBeNull();
  });
});

describe('topProblems', () => {
  const at = (
    recipe: string,
    uptime: number | null,
    extra: Partial<LineDiagnosis> = {},
  ): LineDiagnosis => ({
    recipe,
    verdict: 'blocked',
    uptime,
    machines: 1,
    shortage: null,
    backlog: null,
    power: null,
    carrier: null,
    unknownRecipe: false,
    ...extra,
  });
  const overloaded = (circuit: number) => ({
    verdict: 'unpowered' as const,
    power: { kind: 'overloaded' as const, circuit, demandMW: 140, capacityMW: 100 },
  });

  it('leaves out lines with nothing to fix', () => {
    const top = topProblems([
      at('a', 0.99, { verdict: 'running' }),
      at('b', null, { verdict: 'unmeasured' }),
      at('c', 0.5),
    ]);

    expect(top.map((problem) => problem.worst.recipe)).toEqual(['c']);
  });

  it('is empty for a base that is keeping up', () => {
    expect(topProblems([at('a', 0.98, { verdict: 'running' })])).toEqual([]);
  });

  it('makes one problem of every line on one overloaded grid', () => {
    const top = topProblems([
      at('a', 0.1, overloaded(3)),
      at('b', 0.2, overloaded(3)),
      at('c', 0.3, overloaded(3)),
      at('d', 0.4),
      at('e', 0.5),
    ]);

    expect(top.map((problem) => problem.key)).toEqual(['grid:3', 'line:d', 'line:e']);
    expect(top[0]?.lines).toHaveLength(3);
    expect(top[0]?.worst.recipe).toBe('a');
  });

  it('keeps two grids apart', () => {
    const top = topProblems([at('a', 0.1, overloaded(1)), at('b', 0.2, overloaded(2))]);

    expect(top.map((problem) => problem.key)).toEqual(['grid:1', 'grid:2']);
  });

  it('groups lines short of the same thing', () => {
    const short = {
      verdict: 'starving' as const,
      shortage: { item: 'screw', name: 'Screw', held: 0, perBatch: 25, batches: 0, stored: 0 },
    };
    const top = topProblems([at('rotor', 0.3, short), at('plate', 0.4, short)]);

    expect(top).toHaveLength(1);
    expect(top[0]?.key).toBe('short:screw');
  });

  it('makes one problem of every line the book does not know', () => {
    const unknown = { verdict: 'unexplained' as const, unknownRecipe: true };
    const top = topProblems([at('x', 0.4, unknown), at('y', 0.5, unknown), at('z', 0.6, unknown)]);

    expect(top).toHaveLength(1);
    expect(top[0]?.key).toBe('book');
    expect(top[0]?.lines).toHaveLength(3);
  });

  it('ranks by the slowest line, then by how many a problem holds up', () => {
    const top = topProblems([
      at('solo', 0.3),
      at('a', 0.3, overloaded(1)),
      at('b', 0.6, overloaded(1)),
    ]);

    expect(top.map((problem) => problem.key)).toEqual(['grid:1', 'line:solo']);
  });

  it('stops at three', () => {
    const top = topProblems(['a', 'b', 'c', 'd', 'e'].map((recipe, i) => at(recipe, i / 10)));

    expect(top.map((problem) => problem.worst.recipe)).toEqual(['a', 'b', 'c']);
  });

  it('reads the same list the bottleneck panel does', () => {
    const lines = diagnose(withCarriers, {
      ...emptySnapshot,
      lines: {
        'r-iron-rod': {
          recipe: 'r-iron-rod',
          machine: 'constructor',
          count: 1,
          uptime: 0.3,
          clock: 1,
        },
        'r-screw': { recipe: 'r-screw', machine: 'constructor', count: 1, uptime: 1, clock: 1 },
      },
      placements: [{ ...machine({}, { 'iron-rod': 90 }), recipe: 'r-iron-rod' }],
    });
    const top = topProblems(lines);

    expect(top.map((problem) => problem.worst)).toEqual(
      lines.filter((line) => line.verdict !== 'running' && line.verdict !== 'unmeasured'),
    );
  });
});
