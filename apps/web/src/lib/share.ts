import type { GameDatabase } from '@factory-board/planner';
import { explain, type FixContext, fixFor, type Problem } from './diagnose';
import { recipeName } from './format';

/**
 * A problem as a person reads it: a name, what is wrong, and what to try.
 *
 * Built once and read by both the top of the Overview and the text copied out
 * of it, so the page and a Reddit paste cannot disagree about what is broken.
 */
export interface ProblemRow {
  readonly key: string;
  readonly title: string;
  readonly why: string | null;
  readonly fix: string | null;
  /** How many production lines this one cause holds up. */
  readonly lines: number;
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

export function problemRows(
  problems: readonly Problem[],
  db: GameDatabase,
  context: FixContext,
): ProblemRow[] {
  return problems.map((problem) => {
    const others = problem.lines.length - 1;
    const title =
      problem.key === 'book'
        ? `${plural(problem.lines.length, 'line')} the recipe book does not know`
        : recipeName(db, problem.worst.recipe) +
          (others > 0 ? ` and ${plural(others, 'more line')}` : '');
    return {
      key: problem.key,
      title,
      why: explain(problem.worst),
      fix: fixFor(problem.worst, context),
      lines: problem.lines.length,
    };
  });
}

export interface ShareInput {
  readonly rows: readonly ProblemRow[];
  readonly power: {
    readonly demandMW: number;
    readonly capacityMW: number;
    readonly grids: number;
    readonly overloaded: number;
  } | null;
  /** Left out unless the player asks: a session name is theirs to publish. */
  readonly sessionName: string | null;
  readonly url: string;
}

/**
 * The diagnosis as Markdown, for pasting into a Reddit post or a Discord message.
 *
 * Both render a `-` list and `**bold**`, and neither renders anything much
 * fancier the same way, so that is all it uses.
 */
export function shareText({ rows, power, sessionName, url }: ShareInput): string {
  const lines = [`**${sessionName ?? 'My Satisfactory base'}: top problems** (Factory Board)`, ''];
  if (rows.length === 0) lines.push('- Nothing slow. The base is keeping up.');
  for (const row of rows) {
    const parts = [row.why, row.fix ? `Fix: ${row.fix}` : null].filter(Boolean);
    lines.push(`- **${row.title}**${parts.length > 0 ? `: ${parts.join(' ')}` : ''}`);
  }
  if (power && power.grids > 0) {
    lines.push(
      '',
      `Power: ${Math.round(power.demandMW)} / ${Math.round(power.capacityMW)} MW across ${plural(power.grids, 'grid')}` +
        (power.overloaded > 0 ? ` (${power.overloaded} over capacity)` : ''),
    );
  }
  lines.push('', `Diagnosed at ${url}. The save never leaves the browser.`);
  return lines.join('\n');
}
