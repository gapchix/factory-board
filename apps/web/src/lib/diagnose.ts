import type { GameDatabase, ItemId, MachineId, RecipeId } from '@factory-board/planner';
import type { BuildingPlacement, PowerCircuit, WorldSnapshot } from '@factory-board/save-reader';
import { itemName } from './format';
import { forcedFlow, tightestPerRecipe } from './throughput';

/**
 * Why a line is slow — starving or backed up.
 *
 * The board could say a line ran at 67%. It labelled everything between 60%
 * and 95% "starving", which is a guess dressed as a reading, and on the
 * reference save it was **wrong about the largest line in the base**: the four
 * iron rod constructors averaged 67% with full input buffers *and* full output
 * buffers, which is the opposite problem. Acting on "starving" there — building
 * more smelters — makes it worse.
 *
 * The save knows. Every machine carries an input buffer and an output buffer,
 * and the two together separate the cases that uptime alone runs into one:
 *
 * - **starving** — an ingredient has run down. The machine consumed everything
 *   that arrived and is waiting.
 * - **blocked** — product has piled up. Whatever is downstream stopped taking
 *   it, and the machine has nowhere to put the next one.
 *
 * Measured in *batches* rather than items, because a recipe wanting 25 screws
 * and one wanting 2 wire are not comparable in items and are exactly
 * comparable in batches. That also names the culprit: of everything a recipe
 * needs, the ingredient with the fewest batches buffered is the one holding it
 * up — which is how a Rotor assembler sitting on 200 iron rods is correctly
 * reported as short of screws.
 *
 * Power is checked before either, because it is the one cause that explains a
 * whole grid at once and is read exactly rather than inferred: the save states
 * what every building asks for and what every generator can supply, per grid.
 * A circuit that cannot meet its own demand stops everything on it, and a
 * stopped machine's buffers describe a supply problem it does not have.
 *
 * What it will not do is guess. A machine with power, plenty of input and
 * nothing piled up that is still slow gets `unexplained` rather than a story.
 * Saying "starving" there would be the same mistake this file exists to fix.
 */

export type Verdict =
  /** Running as well as the game measures anything. */
  | 'running'
  /** An ingredient has run down. `shortage` names it. */
  | 'starving'
  /** Product has piled up with nowhere to go. `backlog` names it. */
  | 'blocked'
  /** Its grid cannot meet its own demand, or it is on no grid at all. */
  | 'unpowered'
  /** Slow, and neither power nor the buffers account for it. */
  | 'unexplained'
  /** The game has not measured this line yet. */
  | 'unmeasured';

export interface Shortage {
  readonly item: ItemId;
  readonly name: string;
  /** Items waiting in the input buffers, across every machine on the line. */
  readonly held: number;
  /** What one run of the recipe consumes. */
  readonly perBatch: number;
  /** `held / perBatch` — how many more runs the buffer can cover. */
  readonly batches: number;
  /**
   * How many of the same item are sitting in containers.
   *
   * The difference between "make more of this" and "the belt goes somewhere
   * else". On the reference save three of the five starving lines were waiting
   * for something the base already held thousands of.
   */
  readonly stored: number;
}

export interface Backlog {
  readonly item: ItemId;
  readonly name: string;
  /** Items waiting in the output buffers, across every machine on the line. */
  readonly held: number;
  /** `held / perBatch` — how many runs have been made and not collected. */
  readonly batches: number;
  /** How many of the same item are sitting in containers elsewhere. */
  readonly stored: number;
}

export interface PowerFault {
  /** Over capacity, or not wired to a grid at all. */
  readonly kind: 'overloaded' | 'unwired';
  /** The grid's own id, or null when the machines are on none. */
  readonly circuit: number | null;
  readonly demandMW: number;
  readonly capacityMW: number;
}

/**
 * The belt a backed-up line's product cannot get down.
 *
 * "Backed up" says the line has nowhere to put things and leaves the reason to
 * be found. Sometimes the reason is the belt itself, and the save states it:
 * a run that every one of these machines' output is forced through, carrying
 * more than its tier can take.
 */
export interface CarrierLimit {
  readonly carrier: MachineId;
  readonly name: string;
  readonly capacityPerMinute: number;
  readonly carryingPerMinute: number;
}

export interface LineDiagnosis {
  readonly recipe: RecipeId;
  readonly verdict: Verdict;
  readonly uptime: number | null;
  readonly machines: number;
  readonly shortage: Shortage | null;
  readonly backlog: Backlog | null;
  readonly power: PowerFault | null;
  /** Set only when a full belt is the stated reason a line is backed up. */
  readonly carrier: CarrierLimit | null;
  /**
   * The recipe book has no entry for this line's recipe, so its buffers could
   * not be read against anything. Always `unexplained` — and the one case
   * where the fix is a better book rather than anything in the world.
   */
  readonly unknownRecipe: boolean;
}

/**
 * Uptime at or above this counts as running, so the buffers are not consulted.
 *
 * The game measures over a five-minute window and a machine that is keeping up
 * still dips below 100% whenever a belt hiccups. This is the same step the
 * board's status colour has always used.
 */
const RUNNING = 0.95;

/**
 * Runs' worth of product waiting before a line counts as backed up.
 *
 * One is not enough: a machine that has just finished a run is holding exactly
 * one until the belt takes it, which is what a healthy machine looks like. Two
 * means a whole run went by uncollected.
 */
const BACKED_UP_BATCHES = 2;

/**
 * Runs' worth of an ingredient left before a line counts as starving.
 *
 * The mirror of the rule above, and the reason it is a small number: a machine
 * that is keeping up sits on a *deep* buffer, because the belt delivers faster
 * than it consumes. On the reference save the healthy lines hold 20 to 100
 * runs' worth and the starving ones hold one or less.
 */
const STARVED_BATCHES = 2;

const sum = (
  placements: readonly BuildingPlacement[],
  pick: (placement: BuildingPlacement) => Readonly<Record<ItemId, number>> | undefined,
): Record<ItemId, number> => {
  const total: Record<ItemId, number> = {};
  for (const placement of placements) {
    for (const [item, count] of Object.entries(pick(placement) ?? {})) {
      total[item] = (total[item] ?? 0) + count;
    }
  }
  return total;
};

/**
 * Diagnose one line from the machines running it.
 *
 * Buffers are summed across the line rather than judged per machine, because
 * the question is about the line: four rod constructors where two are backed up
 * and two are keeping pace is one line that cannot shift its rods.
 */
export function diagnoseLine(
  db: GameDatabase,
  recipe: RecipeId,
  uptime: number | null,
  placements: readonly BuildingPlacement[],
  stored: Readonly<Record<ItemId, number>> = {},
  circuits: readonly PowerCircuit[] = [],
  carrier: CarrierLimit | null = null,
): LineDiagnosis {
  const machines = placements.length;
  const base = {
    recipe,
    uptime,
    machines,
    shortage: null,
    backlog: null,
    power: null,
    carrier: null,
    unknownRecipe: false,
  } as const;
  if (uptime === null) return { ...base, verdict: 'unmeasured' };
  if (uptime >= RUNNING) return { ...base, verdict: 'running' };

  /*
   * Power first. A grid that cannot meet its own demand stops everything on
   * it, and a stopped machine's buffers look exactly like starvation — full
   * inputs, empty output. This is read rather than inferred, so checking it
   * first costs nothing in confidence.
   */
  const fault = powerFault(placements, circuits);
  if (fault) return { ...base, verdict: 'unpowered', power: fault };

  const known = db.recipes[recipe];
  if (!known) return { ...base, verdict: 'unexplained', unknownRecipe: true };

  /* Backed up first: a full output explains a slow machine on its own, and a
   * machine that cannot put anything down stops drawing its inputs, so its
   * input buffer fills too and would otherwise read as perfectly healthy. */
  const output = sum(placements, (placement) => placement.output);
  let worstBacklog: Backlog | null = null;
  for (const port of known.outputs) {
    const held = output[port.item] ?? 0;
    const batches = port.amount > 0 ? held / port.amount : 0;
    if (batches < BACKED_UP_BATCHES) continue;
    if (worstBacklog && worstBacklog.batches >= batches) continue;
    worstBacklog = {
      item: port.item,
      name: itemName(db, port.item),
      held,
      batches,
      stored: stored[port.item] ?? 0,
    };
  }
  if (worstBacklog) return { ...base, verdict: 'blocked', backlog: worstBacklog, carrier };

  /* Then the tightest ingredient. Batches rather than items, so a recipe
   * wanting 25 screws and one wanting 2 wire can be compared at all. */
  const input = sum(placements, (placement) => placement.input);
  let tightest: Shortage | null = null;
  for (const port of known.inputs) {
    if (port.amount <= 0) continue;
    const held = input[port.item] ?? 0;
    const batches = held / port.amount;
    if (tightest && tightest.batches <= batches) continue;
    tightest = {
      item: port.item,
      name: itemName(db, port.item),
      held,
      perBatch: port.amount,
      batches,
      stored: stored[port.item] ?? 0,
    };
  }
  if (tightest && tightest.batches <= STARVED_BATCHES) {
    return { ...base, verdict: 'starving', shortage: tightest };
  }

  /*
   * Slow, fed, and not backed up. The buffers have nothing more to say, so
   * neither does this — the honest answer is the one the old label refused to
   * give.
   */
  return { ...base, verdict: 'unexplained' };
}

/**
 * Is this line's power the problem?
 *
 * A machine on no grid at all is the plainer fault of the two and is checked
 * first — it is not slow, it is off. Otherwise the grid is at fault only when
 * it cannot supply what is asked of it, which the save states outright.
 */
function powerFault(
  placements: readonly BuildingPlacement[],
  circuits: readonly PowerCircuit[],
): PowerFault | null {
  if (placements.length === 0) return null;
  if (placements.every((placement) => placement.circuit === undefined)) {
    // Only when there are grids to be off: a save read before any power was
    // built must not report every machine as unwired.
    if (circuits.length === 0) return null;
    return { kind: 'unwired', circuit: null, demandMW: 0, capacityMW: 0 };
  }
  for (const placement of placements) {
    const grid = circuits.find((circuit) => circuit.id === placement.circuit);
    if (!grid || grid.capacityMW >= grid.demandMW) continue;
    return {
      kind: 'overloaded',
      circuit: grid.id,
      demandMW: grid.demandMW,
      capacityMW: grid.capacityMW,
    };
  }
  return null;
}

/** Every measured line, worst first — the order a reader wants them in. */
export function diagnose(db: GameDatabase, snapshot: WorldSnapshot): LineDiagnosis[] {
  const byRecipe = new Map<RecipeId, BuildingPlacement[]>();
  for (const placement of snapshot.placements) {
    if (!placement.recipe) continue;
    const bucket = byRecipe.get(placement.recipe);
    if (bucket) bucket.push(placement);
    else byRecipe.set(placement.recipe, [placement]);
  }

  /*
   * A full belt is a reason, where the save can prove one. `forcedFlow` only
   * reports segments a line's output *cannot* avoid, so a limit named here is
   * arithmetic on two stated numbers rather than a story about a backlog.
   */
  const tightest = tightestPerRecipe(forcedFlow(db, snapshot));

  const out: LineDiagnosis[] = [];
  for (const [recipe, line] of Object.entries(snapshot.lines)) {
    const segment = tightest.get(recipe);
    const full =
      segment && segment.carryingPerMinute >= segment.capacityPerMinute
        ? {
            carrier: segment.carrier,
            name: segment.name,
            capacityPerMinute: segment.capacityPerMinute,
            carryingPerMinute: segment.carryingPerMinute,
          }
        : null;

    out.push(
      diagnoseLine(
        db,
        recipe,
        line.uptime,
        byRecipe.get(recipe) ?? [],
        snapshot.stored,
        snapshot.circuits,
        full,
      ),
    );
  }
  out.sort((a, b) => (a.uptime ?? 2) - (b.uptime ?? 2));
  return out;
}

/** One line of prose saying what is wrong, or null when nothing is. */
export function explain(diagnosis: LineDiagnosis): string | null {
  const { shortage, backlog, power, carrier } = diagnosis;
  switch (diagnosis.verdict) {
    case 'unpowered':
      if (!power) return null;
      return power.kind === 'unwired'
        ? 'Not wired to a power grid.'
        : `Grid ${power.circuit} is over capacity — ${Math.round(power.demandMW)} MW asked for, ${Math.round(power.capacityMW)} MW built.`;
    case 'blocked':
      if (!backlog) return null;
      return (
        `Output full — ${Math.round(backlog.held)} ${backlog.name} waiting${
          backlog.stored > 0 ? `, ${backlog.stored.toLocaleString()} more in storage` : ''
        }. ` +
        /* Where the belt itself is the reason, say so instead of leaving
         * "nothing downstream is taking them" to be investigated. */
        (carrier
          ? `The ${carrier.name} out of it carries ${carrier.capacityPerMinute}/min and these machines make ${Math.round(carrier.carryingPerMinute)}.`
          : 'Nothing downstream is taking them.')
      );
    case 'starving': {
      if (!shortage) return null;
      const short =
        shortage.held === 0
          ? `No ${shortage.name} arriving.`
          : `Short of ${shortage.name} — ${Math.round(shortage.held)} left, ${shortage.perBatch} per run.`;
      /*
       * And whether the base already has some. A line waiting for an item it
       * holds a thousand of is not short of it — the belt goes somewhere else,
       * and "build more" is the wrong instruction. One run's worth is the floor,
       * so a stray handful in a box does not raise it.
       */
      return shortage.stored >= shortage.perBatch
        ? `${short} ${shortage.stored.toLocaleString()} sitting in a container — this is routing, not production.`
        : short;
    }
    case 'unexplained':
      return diagnosis.unknownRecipe
        ? 'The recipe book does not know this recipe, so its buffers cannot be read.'
        : 'Powered, fed and not backed up, yet still slow.';
    default:
      return null;
  }
}

/**
 * What the fix for a line's problem could be based on: the book, and what the world has.
 *
 * `built` is carrier tiers standing somewhere in the world. A save records
 * which *recipes* are unlocked (ADR 30) but not which *buildings*, so a tier
 * nobody has built is offered with that said, rather than called locked or
 * available.
 */
export interface FixContext {
  readonly db: GameDatabase;
  readonly built: ReadonlySet<MachineId>;
  /** The recipes running in this save that make each item. */
  readonly makers: ReadonlyMap<ItemId, readonly RecipeId[]>;
}

export function fixContext(db: GameDatabase, snapshot: WorldSnapshot): FixContext {
  const built = new Set<MachineId>();
  for (const machine of Object.keys(snapshot.buildings)) {
    if (db.carriers[machine]) built.add(machine);
  }
  const makers = new Map<ItemId, RecipeId[]>();
  for (const recipe of Object.keys(snapshot.lines)) {
    for (const port of db.recipes[recipe]?.outputs ?? []) {
      const list = makers.get(port.item);
      if (list) list.push(recipe);
      else makers.set(port.item, [recipe]);
    }
  }
  return { db, built, makers };
}

const CARRIER_NOUN = { belt: 'belt', lift: 'lift', pipe: 'pipeline' } as const;

/**
 * One line saying what to do about a problem, or null when there is nothing to fix.
 *
 * `explain` says what is wrong, and this says what to try, and the two are kept
 * apart because the second is advice and the first is a reading. So each rule
 * only suggests what the diagnosis has already established. A full belt gets a
 * tier that carries the rate, **of the same kind**, because a full lift is not
 * fixed by a faster belt and a pipe's m³ are not items. A starving line gets
 * the line that makes what it is short of, never "build more" for something
 * already sitting in a box.
 */
export function fixFor(diagnosis: LineDiagnosis, context: FixContext): string | null {
  const { db, built, makers } = context;
  const { shortage, backlog, power, carrier } = diagnosis;
  switch (diagnosis.verdict) {
    case 'unpowered':
      if (!power) return null;
      return power.kind === 'unwired'
        ? 'Connect these machines to a power grid.'
        : `Add at least ${Math.ceil(power.demandMW - power.capacityMW)} MW to grid ${power.circuit}, or refuel the generators it already has.`;
    case 'blocked': {
      if (!backlog) return null;
      if (!carrier) {
        return `Give the ${backlog.name} somewhere to go: a line that uses it, a container or an AWESOME Sink.`;
      }
      const current = db.carriers[carrier.carrier];
      if (!current) return 'Give the output a second route.';
      const unit = current.kind === 'pipe' ? ' m³/min' : '/min';
      const next = Object.values(db.carriers)
        .filter((tier) => tier.kind === current.kind)
        .filter(
          (tier) =>
            tier.ratePerMinute > carrier.capacityPerMinute &&
            tier.ratePerMinute >= carrier.carryingPerMinute,
        )
        /* Two tiers can share a rate (a Pipeline and a Clean Pipeline), and
         * the one already standing is the one to name. */
        .sort(
          (a, b) =>
            a.ratePerMinute - b.ratePerMinute || Number(built.has(b.id)) - Number(built.has(a.id)),
        )[0];
      if (!next) {
        return `No single ${CARRIER_NOUN[current.kind]} carries ${Math.round(carrier.carryingPerMinute)}${unit}: split the output onto a second one.`;
      }
      return (
        `Upgrade it to ${next.name} (${next.ratePerMinute}${unit}).` +
        (built.has(next.id) ? '' : ' You have not built one yet, so it may still need unlocking.')
      );
    }
    case 'starving': {
      if (!shortage) return null;
      if (shortage.stored >= shortage.perBatch) {
        return `Feed it from the container holding ${shortage.name}.`;
      }
      if (db.items[shortage.item]?.isRaw) {
        return `Bring in more ${shortage.name}: another miner, a better node, or a faster belt from the ones you have.`;
      }
      const others = (makers.get(shortage.item) ?? []).filter(
        (recipe) => recipe !== diagnosis.recipe,
      );
      if (others.length === 0) {
        return `Nothing in this base makes ${shortage.name}. Build a line for it.`;
      }
      const names = others.map((recipe) => db.recipes[recipe]?.name ?? recipe).join(', ');
      return `Get more ${shortage.name} here: build more ${names}, or check its belt reaches this line.`;
    }
    case 'unexplained':
      return diagnosis.unknownRecipe
        ? "Drop your game's Docs.json on the page so this line can be read."
        : 'Check these machines in the game. From here they look powered, fed and clear.';
    default:
      return null;
  }
}

/** Slow lines sharing one cause, to be fixed once. */
export interface Problem {
  /** What they share: a grid, a missing item, an unknown recipe, or only the line itself. */
  readonly key: string;
  /** The slowest of them, whose reading and fix speak for the group. */
  readonly worst: LineDiagnosis;
  readonly lines: readonly LineDiagnosis[];
}

/**
 * What a line's problem comes down to, so lines with one cause are one problem.
 *
 * Every line on an overloaded grid reads as unpowered, and listed one per line
 * the worst three of a browning-out base are the same sentence three times,
 * while the second and third problems never make the list. A full belt stays
 * per line: two lines capped by Mk.2 belts are two belts to replace.
 */
function causeOf(diagnosis: LineDiagnosis): string {
  const { verdict, power, shortage } = diagnosis;
  if (verdict === 'unpowered' && power) {
    return power.kind === 'unwired' ? 'unwired' : `grid:${power.circuit}`;
  }
  if (verdict === 'starving' && shortage) return `short:${shortage.item}`;
  if (verdict === 'unexplained' && diagnosis.unknownRecipe) return 'book';
  return `line:${diagnosis.recipe}`;
}

/**
 * The few things most worth fixing, for the top of the page and for sharing.
 *
 * Slow lines only, since a running or unmeasured line has nothing to fix. Grouped by
 * cause, then ranked by the slowest line in each group, and by how many lines it
 * holds up when two are equally slow. It ranks by uptime and by nothing
 * cleverer: a weighting of what each line is worth would be an opinion, and
 * the bottleneck list below it already reads worst first.
 */
export function topProblems(diagnoses: readonly LineDiagnosis[], limit = 3): Problem[] {
  const groups = new Map<string, LineDiagnosis[]>();
  for (const diagnosis of diagnoses) {
    if (diagnosis.verdict === 'running' || diagnosis.verdict === 'unmeasured') continue;
    const key = causeOf(diagnosis);
    const group = groups.get(key);
    if (group) group.push(diagnosis);
    else groups.set(key, [diagnosis]);
  }
  const slowest = (lines: readonly LineDiagnosis[]) =>
    lines.reduce((worst, line) => ((line.uptime ?? 1) < (worst.uptime ?? 1) ? line : worst));
  return [...groups.entries()]
    .map(([key, lines]) => ({ key, worst: slowest(lines), lines }))
    .sort(
      (a, b) => (a.worst.uptime ?? 1) - (b.worst.uptime ?? 1) || b.lines.length - a.lines.length,
    )
    .slice(0, limit);
}
