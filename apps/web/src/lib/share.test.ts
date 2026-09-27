import type { GameDatabase } from '@factory-board/planner';
import { describe, expect, it } from 'vitest';
import type { FixContext, LineDiagnosis } from './diagnose';
import { type ProblemRow, problemRows, shareText } from './share';

const row = (title: string, why: string | null, fix: string | null): ProblemRow => ({
  key: title,
  title,
  why,
  fix,
  lines: 1,
});

const url = 'https://factory.example';

describe('shareText', () => {
  it('lists each problem with its reading and its fix', () => {
    const text = shareText({
      rows: [
        row(
          'Iron Rod',
          'Output full — 90 Iron Rod waiting.',
          'Upgrade it to Conveyor Belt Mk.3 (270/min).',
        ),
        row(
          'Rotor',
          'No Screw arriving.',
          'Nothing in this base makes Screw. Build a line for it.',
        ),
      ],
      power: null,
      sessionName: null,
      url,
    });

    expect(text).toBe(
      [
        '**My Satisfactory base: top problems** (Factory Board)',
        '',
        '- **Iron Rod**: Output full — 90 Iron Rod waiting. Fix: Upgrade it to Conveyor Belt Mk.3 (270/min).',
        '- **Rotor**: No Screw arriving. Fix: Nothing in this base makes Screw. Build a line for it.',
        '',
        'Diagnosed at https://factory.example. The save never leaves the browser.',
      ].join('\n'),
    );
  });

  it('says so when nothing is slow', () => {
    const text = shareText({ rows: [], power: null, sessionName: null, url });

    expect(text).toContain('- Nothing slow. The base is keeping up.');
  });

  it('names the session only when asked to', () => {
    const named = shareText({ rows: [], power: null, sessionName: 'polska', url });
    const anonymous = shareText({ rows: [], power: null, sessionName: null, url });

    expect(named.startsWith('**polska: top problems**')).toBe(true);
    expect(anonymous).not.toContain('polska');
  });

  it('keeps a row with no fix readable', () => {
    const text = shareText({
      rows: [row('Screw', 'Slow.', null)],
      power: null,
      sessionName: null,
      url,
    });

    expect(text).toContain('- **Screw**: Slow.');
    expect(text).not.toContain('Fix:');
  });

  it('adds the power line, and says how many grids are over', () => {
    const fine = shareText({
      rows: [],
      power: { demandMW: 125.4, capacityMW: 200, grids: 1, overloaded: 0 },
      sessionName: null,
      url,
    });
    const over = shareText({
      rows: [],
      power: { demandMW: 188, capacityMW: 150, grids: 3, overloaded: 1 },
      sessionName: null,
      url,
    });

    expect(fine).toContain('Power: 125 / 200 MW across 1 grid');
    expect(fine).not.toContain('over capacity');
    expect(over).toContain('Power: 188 / 150 MW across 3 grids (1 over capacity)');
  });

  it('leaves power out when the save has no grids', () => {
    const text = shareText({
      rows: [],
      power: { demandMW: 0, capacityMW: 0, grids: 0, overloaded: 0 },
      sessionName: null,
      url,
    });

    expect(text).not.toContain('Power:');
  });
});

describe('problemRows', () => {
  const db = {
    items: { 'iron-rod': { id: 'iron-rod', name: 'Iron Rod', isRaw: false, isFluid: false } },
    recipes: {
      'r-iron-rod': {
        id: 'r-iron-rod',
        name: 'Iron Rod',
        durationSeconds: 4,
        machine: 'constructor',
        inputs: [],
        outputs: [{ item: 'iron-rod', amount: 1 }],
        isAlternate: false,
      },
    },
    carriers: {},
  } as unknown as GameDatabase;
  const context: FixContext = { db, built: new Set(), makers: new Map() };
  const line = (recipe: string, extra: Partial<LineDiagnosis> = {}): LineDiagnosis => ({
    recipe,
    verdict: 'unexplained',
    uptime: 0.4,
    machines: 1,
    shortage: null,
    backlog: null,
    power: null,
    carrier: null,
    unknownRecipe: false,
    ...extra,
  });

  it('names a group by its slowest line and counts the rest', () => {
    const [first] = problemRows(
      [
        {
          key: 'grid:1',
          worst: line('r-iron-rod'),
          lines: [line('r-iron-rod'), line('b'), line('c')],
        },
      ],
      db,
      context,
    );

    expect(first?.title).toBe('Iron Rod and 2 more lines');
    expect(first?.lines).toBe(3);
  });

  it('does not count a lone line as more', () => {
    const [first] = problemRows(
      [{ key: 'line:r-iron-rod', worst: line('r-iron-rod'), lines: [line('r-iron-rod')] }],
      db,
      context,
    );

    expect(first?.title).toBe('Iron Rod');
    expect(first?.fix).toBe(
      'Check these machines in the game. From here they look powered, fed and clear.',
    );
  });

  it('calls the unknown-recipe group what it is', () => {
    const unknown = line('Recipe_Mystery_C', { unknownRecipe: true });
    const [first] = problemRows(
      [{ key: 'book', worst: unknown, lines: [unknown, unknown] }],
      db,
      context,
    );

    expect(first?.title).toBe('2 lines the recipe book does not know');
    expect(first?.fix).toBe("Drop your game's Docs.json on the page so this line can be read.");
  });
});
