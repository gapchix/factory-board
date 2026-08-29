import type { GameDatabase, GeneratorFuel, ItemId, MachineId } from './types.js';

/**
 * What it costs to keep the lights on.
 *
 * The board has been able to say a plan draws 344 MW since the first week, and
 * has told anyone whose grid went over to *"build generators there before the
 * machines"* since the day grids were read. It could not say which generator,
 * how many, or what feeding them would take, because nothing in the database
 * knew a generator from a wall: the extractor kept `mPowerConsumption` and
 * every generator declares zero of it.
 *
 * Two rules do all the work here.
 *
 * **Fuel burn is linear in load.** A generator carrying half a grid burns half
 * the coal. So the fuel bill is a function of the *megawatts drawn*, not of how
 * many generators stand behind them — five coal generators idling at 20% cost
 * exactly what one at full output costs. This is what makes the question
 * answerable at all: a plan states its draw, and its draw states its fuel.
 *
 * **Generators come whole.** Covering a shortfall of 80 MW takes two
 * Coal-Powered Generators, not 1.07, and the second one is not free — but it
 * only burns what it is asked for. So a cover has two numbers that do not
 * agree, and both are true: what the generators *could* supply, and what they
 * would *burn* carrying the load asked of them.
 */

/** What carrying a load costs per minute, once you know what is burning it. */
export interface FuelBurn {
  readonly generator: MachineId;
  readonly generatorName: string;
  readonly fuel: ItemId;
  /** The load being carried, in MW. Everything else here is priced from it. */
  readonly powerMW: number;
  readonly fuelPerMinute: number;
  /** Water, where the generator needs it. */
  readonly supplemental?: { readonly item: ItemId; readonly ratePerMinute: number } | undefined;
  /** Nuclear waste, where it makes any. */
  readonly byproduct?: { readonly item: ItemId; readonly ratePerMinute: number } | undefined;
}

/** A generator, and optionally the one fuel of its you mean. */
export interface FuelChoice {
  readonly generator: MachineId;
  /** Defaults to the generator's first fuel, which is the game's plain one. */
  readonly fuel?: ItemId | undefined;
}

export interface GeneratorCover extends FuelBurn {
  /** How many to build. Whole generators — you cannot place two thirds of one. */
  readonly count: number;
  /** What those generators can supply, which is at least `powerMW`. */
  readonly capacityMW: number;
}

function fuelEntry(
  db: GameDatabase,
  choice: FuelChoice,
): { generatorId: MachineId; name: string; powerMW: number; fuel: GeneratorFuel } | null {
  const generator = db.generators[choice.generator];
  if (!generator || generator.powerMW <= 0) return null;
  const fuel = choice.fuel
    ? generator.fuels.find((entry) => entry.item === choice.fuel)
    : generator.fuels[0];
  if (!fuel || fuel.ratePerMinute <= 0) return null;
  return { generatorId: generator.id, name: generator.name, powerMW: generator.powerMW, fuel };
}

/**
 * What one kind of generator burns to carry `powerMW`.
 *
 * Not how many to build — this is the running cost of a load, which is the
 * figure a plan needs. `null` when the database has never heard of the
 * generator or of what it burns, because an invented burn rate reads exactly
 * like a measured one.
 */
export function fuelToCarry(
  db: GameDatabase,
  choice: FuelChoice,
  powerMW: number,
): FuelBurn | null {
  const entry = fuelEntry(db, choice);
  if (!entry || powerMW <= 0) return null;

  const load = powerMW / entry.powerMW;
  const { fuel } = entry;
  return {
    generator: entry.generatorId,
    generatorName: entry.name,
    fuel: fuel.item,
    powerMW,
    fuelPerMinute: fuel.ratePerMinute * load,
    ...(fuel.supplemental
      ? {
          supplemental: {
            item: fuel.supplemental.item,
            ratePerMinute: fuel.supplemental.ratePerMinute * load,
          },
        }
      : {}),
    ...(fuel.byproduct
      ? {
          byproduct: {
            item: fuel.byproduct.item,
            ratePerMinute: fuel.byproduct.ratePerMinute * load,
          },
        }
      : {}),
  };
}

export interface CoverOptions {
  /**
   * Generators to lead with, in the order given, and the fuel to quote each on.
   *
   * How the world gets a say: a grid already running coal generators should be
   * offered another coal generator before it is offered a reactor, whatever
   * the arithmetic prefers.
   */
  readonly prefer?: readonly FuelChoice[];
  /**
   * Which fuel to quote a generator on when `prefer` does not name it.
   *
   * The game's own first fuel is a poor default for exactly one generator and
   * it is the one every new save has: a Biomass Burner's list opens with
   * Leaves, so covering 240 MW came out as *876 Leaves a minute* — arithmetic
   * nobody can act on, from the only building available at that tier. What
   * fuel is the right one is not in the recipe book; it is in the world, which
   * knows what the base already makes, mines and has in a box.
   */
  readonly fuels?: Readonly<Record<MachineId, ItemId>>;
}

/**
 * Ways to cover `powerMW`, best first.
 *
 * Beyond `prefer`, the order is by how little of what you build would stand
 * idle, then by how few buildings that takes. Ranking by count alone answers a
 * 200 MW hole with a 2,500 MW reactor — one building, and twelve times the
 * power asked for. This ordering is a last resort in any case: a base with
 * generators of its own answers the question through `prefer`, and one with
 * none is early enough that the smallest generator is the right suggestion.
 */
export function generatorsToCover(
  db: GameDatabase,
  powerMW: number,
  options: CoverOptions = {},
): GeneratorCover[] {
  if (powerMW <= 0) return [];

  const cover = (choice: FuelChoice): GeneratorCover | null => {
    const entry = fuelEntry(db, choice);
    if (!entry) return null;
    const count = Math.ceil(powerMW / entry.powerMW);
    const burn = fuelToCarry(db, choice, powerMW);
    if (!burn) return null;
    return { ...burn, count, capacityMW: count * entry.powerMW };
  };

  const seen = new Set<string>();
  const preferred: GeneratorCover[] = [];
  for (const choice of options.prefer ?? []) {
    const built = cover(choice);
    if (!built || seen.has(built.generator)) continue;
    seen.add(built.generator);
    preferred.push(built);
  }

  const rest = Object.keys(db.generators)
    .filter((id) => !seen.has(id))
    .map((generator) => {
      const fuel = options.fuels?.[generator];
      return cover(fuel ? { generator, fuel } : { generator }) ?? cover({ generator });
    })
    .filter((entry): entry is GeneratorCover => entry !== null)
    .sort(
      (a, b) =>
        a.capacityMW - b.capacityMW || a.count - b.count || a.generator.localeCompare(b.generator),
    );

  return [...preferred, ...rest];
}
