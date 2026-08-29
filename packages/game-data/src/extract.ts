import type {
  GameBuilding,
  GameCarrier,
  GameDatabase,
  GameExtractor,
  GameGenerator,
  GameItem,
  GameMachine,
  GameMilestone,
  GameRecipe,
  GameSchematic,
  GeneratorFuel,
  RecipePort,
} from '@factory-board/planner';
import {
  classesMatching,
  parseAmounts,
  parseClearance,
  parseProducedIn,
  parseUnlockedRecipes,
  readNumber,
  readString,
  type DocsClass,
  type DocsGroup,
} from './docs.js';

/** Amounts for these forms are stored in litres; we normalise to cubic metres. */
const FLUID_FORMS = new Set(['RF_LIQUID', 'RF_GAS']);
const LITRES_PER_CUBIC_METRE = 1000;

const MILESTONE_PATTERN = /^Schematic_(\d+)-(\d+)_C$/;

/**
 * The game's own word for where an unlock comes from, in ours.
 *
 * Only the three a player can act on are named. Everything else that hands out
 * a recipe — the tutorial, the background unlocks the story grants — is
 * `other`, because there is nothing to tell someone to go and do about it.
 */
const SCHEMATIC_KINDS: Readonly<Record<string, GameSchematic['kind']>> = {
  EST_Milestone: 'milestone',
  EST_MAM: 'research',
  EST_Alternate: 'hard-drive',
};

export interface ExtractOptions {
  /** Steam build id to stamp on the database (see GameDatabase.sourceBuildId). */
  readonly sourceBuildId: number;
  /** Keep recipes whose machine has no power entry (workbenches). Defaults to false. */
  readonly includeHandcrafted?: boolean;
}

export interface ExtractionReport {
  readonly database: GameDatabase;
  readonly counts: {
    readonly items: number;
    readonly recipes: number;
    readonly alternateRecipes: number;
    readonly machines: number;
    readonly generators: number;
    readonly carriers: number;
    readonly extractors: number;
    readonly buildings: number;
    readonly milestones: number;
    readonly schematics: number;
  };
  readonly skipped: readonly string[];
}

/**
 * Item descriptors are scattered across native classes that do not all contain
 * the word "Descriptor" — ammo lives under FGAmmoTypeProjectile and friends. So
 * we take the union of the /Descriptor/ groups and every class named `Desc_*`.
 * Over-collecting is harmless: unreferenced items get pruned at the end.
 */
function buildItems(docs: readonly DocsGroup[]): {
  items: Record<string, GameItem>;
  rawIds: Set<string>;
} {
  const rawIds = new Set(classesMatching(docs, /FGResourceDescriptor/).map((c) => c.ClassName));
  const items: Record<string, GameItem> = {};

  const add = (cls: DocsClass): void => {
    if (items[cls.ClassName]) return;
    const isFluid = FLUID_FORMS.has(readString(cls['mForm']) ?? '');
    /*
     * Fluid energy is stated per litre and solid energy per item, so Fuel
     * arrives as 0.75 beside Coal's 300. Normalised here with every other
     * fluid figure — a generator's burn rate is otherwise wrong by a factor of
     * a thousand, in the direction that looks plausible.
     */
    const energy = readNumber(cls['mEnergyValue']) ?? 0;
    items[cls.ClassName] = {
      id: cls.ClassName,
      name: readString(cls['mDisplayName']) ?? cls.ClassName,
      isRaw: rawIds.has(cls.ClassName),
      isFluid,
      ...(energy > 0 ? { energyMJ: isFluid ? energy * LITRES_PER_CUBIC_METRE : energy } : {}),
    };
  };

  for (const cls of classesMatching(docs, /Descriptor/)) add(cls);
  for (const group of docs) {
    for (const cls of group.Classes) {
      if (cls.ClassName?.startsWith('Desc_')) add(cls);
    }
  }
  return { items, rawIds };
}

/**
 * Some manufacturers draw a fixed wattage; the Converter, Particle Accelerator
 * and Quantum Encoder instead declare an estimated range and leave
 * `mPowerConsumption` at zero. Missing that fallback silently drops every
 * recipe those machines make.
 *
 * Note the misspelled `mEstimatedMininumPowerConsumption` — that is the game's
 * own spelling; the correct one is accepted too in case it is ever fixed.
 */
function readMachinePower(
  cls: DocsClass,
): { powerMW: number; range?: { min: number; max: number } } | undefined {
  const fixed = readNumber(cls['mPowerConsumption']) ?? 0;
  if (fixed > 0) return { powerMW: fixed };

  const min =
    readNumber(cls['mEstimatedMininumPowerConsumption']) ??
    readNumber(cls['mEstimatedMinimumPowerConsumption']);
  const max = readNumber(cls['mEstimatedMaximumPowerConsumption']);
  if (min === undefined || max === undefined || max <= 0) return undefined;

  return { powerMW: (min + max) / 2, range: { min, max } };
}

/** Centimetres to metres, at the precision a map can use. */
const CM_PER_METRE = 100;
const round = (value: number) => Math.round(value * 10) / 10;

/**
 * Display names and footprints for every Build_ class, whether or not it makes
 * anything. The footprint is what lets a map draw a factory rather than a dot
 * cloud, and the game states it outright.
 */
function buildBuildings(docs: readonly DocsGroup[]): Record<string, GameBuilding> {
  const buildings: Record<string, GameBuilding> = {};
  for (const group of docs) {
    for (const cls of group.Classes) {
      if (!cls.ClassName?.startsWith('Build_')) continue;
      const id = cls.ClassName.replace(/^Build_|_C$/g, '');
      if (buildings[id]) continue;
      const clearance = parseClearance(cls['mClearanceData']);
      buildings[id] = {
        id,
        name: readString(cls['mDisplayName']) ?? id,
        ...(clearance
          ? {
              footprintM: {
                width: round(clearance.widthCm / CM_PER_METRE),
                length: round(clearance.lengthCm / CM_PER_METRE),
              },
            }
          : {}),
      };
    }
  }
  return buildings;
}

function buildMachines(docs: readonly DocsGroup[]): Record<string, GameMachine> {
  const machines: Record<string, GameMachine> = {};
  for (const group of docs) {
    for (const cls of group.Classes) {
      if (!cls.ClassName?.startsWith('Build_')) continue;
      const power = readMachinePower(cls);
      if (!power) continue;
      const id = cls.ClassName.replace(/^Build_|_C$/g, '');
      machines[id] = {
        id,
        name: readString(cls['mDisplayName']) ?? id,
        powerMW: power.powerMW,
        ...(power.range ? { powerRangeMW: power.range } : {}),
      };
    }
  }
  return machines;
}

/** `/Game/…/Desc_Water.Desc_Water_C` or a bare `Desc_Water_C`, either way. */
function className(raw: unknown): string | undefined {
  const text = readString(raw);
  if (!text) return undefined;
  const match = /([A-Za-z0-9_]+_C)'?"?$/.exec(text.trim());
  return match?.[1];
}

const SECONDS_PER_MINUTE = 60;

/**
 * Every generator that burns something, priced per minute at full output.
 *
 * Three numbers out of the game files, and one of them is not a number:
 *
 *  - **Fuel** comes from the item's own energy. A generator is a converter of
 *    megajoules into megawatt-seconds at par, so 75 MW off 300 MJ Coal is
 *    75/300 a second — 15 Coal/min, which is what the game does.
 *  - **Water** comes from `mSupplementalToPowerRatio`, which is litres per
 *    second per megawatt. Ten, for a Coal-Powered Generator, is 45 m³/min.
 *  - **Waste** comes from `mByproductAmount`, which is per fuel *item* rather
 *    than per minute, so it is priced off the fuel rate rather than the power.
 *
 * The Geothermal Generator is left out. It declares no fuel and no output —
 * what it makes depends on the purity of the vent it stands on, which is
 * world-generation data no save records, the same wall the node budget runs
 * into. A generator whose output cannot be stated is better absent than
 * invented.
 */
function buildGenerators(
  docs: readonly DocsGroup[],
  items: Readonly<Record<string, GameItem>>,
): Record<string, GameGenerator> {
  const generators: Record<string, GameGenerator> = {};

  for (const cls of classesMatching(docs, /FGBuildableGenerator/)) {
    const powerMW = readNumber(cls['mPowerProduction']) ?? 0;
    const entries = cls['mFuel'];
    if (powerMW <= 0 || !Array.isArray(entries)) continue;

    const ratio = readNumber(cls['mSupplementalToPowerRatio']) ?? 0;
    const fuels: GeneratorFuel[] = [];

    for (const entry of entries as readonly Record<string, unknown>[]) {
      const fuelId = className(entry['mFuelClass']);
      const fuel = fuelId ? items[fuelId] : undefined;
      if (!fuel?.energyMJ) continue;

      /** Display units a minute: m³ for a fluid, items for anything else. */
      const perMinute = (perSecond: number, item: GameItem): number =>
        (item.isFluid ? perSecond / LITRES_PER_CUBIC_METRE : perSecond) * SECONDS_PER_MINUTE;

      const ratePerMinute = (powerMW / fuel.energyMJ) * SECONDS_PER_MINUTE;

      const supplementalId = className(entry['mSupplementalResourceClass']);
      const supplemental = supplementalId ? items[supplementalId] : undefined;

      const byproductId = className(entry['mByproduct']);
      const byproduct = byproductId ? items[byproductId] : undefined;
      const byproductAmount = readNumber(entry['mByproductAmount']) ?? 0;

      fuels.push({
        item: fuel.id,
        ratePerMinute,
        ...(supplemental && ratio > 0
          ? {
              supplemental: {
                item: supplemental.id,
                ratePerMinute: perMinute(powerMW * ratio, supplemental),
              },
            }
          : {}),
        ...(byproduct && byproductAmount > 0
          ? {
              byproduct: {
                item: byproduct.id,
                ratePerMinute: byproduct.isFluid
                  ? (ratePerMinute * byproductAmount) / LITRES_PER_CUBIC_METRE
                  : ratePerMinute * byproductAmount,
              },
            }
          : {}),
      });
    }

    if (fuels.length === 0) continue;
    const id = cls.ClassName.replace(/^Build_|_C$/g, '');
    generators[id] = {
      id,
      name: readString(cls['mDisplayName']) ?? id,
      powerMW,
      fuels,
    };
  }

  return generators;
}

/**
 * Belts, lifts and pipes, in the units a plan is written in.
 *
 * Both figures are stated in the game's own internal terms and neither is
 * items a minute:
 *
 *  - `mSpeed` is **twice** the item rate. A Mk.1 belt says 120 and moves 60,
 *    and the ladder checks out all the way up — 2400 for the Mk.6's 1,200.
 *  - `mFlowLimit` is m³ a **second**. Five, for a Pipeline Mk.1, is the
 *    300 m³/min the game's own tooltip quotes.
 */
const BELT_SPEED_PER_ITEM = 2;

function buildCarriers(docs: readonly DocsGroup[]): Record<string, GameCarrier> {
  const carriers: Record<string, GameCarrier> = {};

  const add = (cls: DocsClass, kind: GameCarrier['kind'], ratePerMinute: number): void => {
    if (ratePerMinute <= 0) return;
    const id = cls.ClassName.replace(/^Build_|_C$/g, '');
    carriers[id] = {
      id,
      name: readString(cls['mDisplayName']) ?? id,
      kind,
      ratePerMinute,
    };
  };

  for (const cls of classesMatching(docs, /FGBuildableConveyorBelt/)) {
    add(cls, 'belt', (readNumber(cls['mSpeed']) ?? 0) / BELT_SPEED_PER_ITEM);
  }
  for (const cls of classesMatching(docs, /FGBuildableConveyorLift/)) {
    add(cls, 'lift', (readNumber(cls['mSpeed']) ?? 0) / BELT_SPEED_PER_ITEM);
  }
  /*
   * The trailing quote is load-bearing. A native class reads
   * `…FactoryGame.FGBuildablePipeline'`, so anchoring on the end of the string
   * matches nothing, and leaving the anchor off matches the pump, the junction
   * and the supports — none of which carry a flow limit, so the pipes came out
   * empty either way.
   */
  for (const cls of classesMatching(docs, /FGBuildablePipeline'/)) {
    add(cls, 'pipe', (readNumber(cls['mFlowLimit']) ?? 0) * SECONDS_PER_MINUTE);
  }

  return carriers;
}

/**
 * Miners, pumps and extractors, at a normal node.
 *
 * `mItemsPerCycle / mExtractCycleTime` a second is the rate, in internal units
 * — so a Water Extractor's 2000 a second is 120 m³ a minute once fluids are
 * normalised like everything else.
 *
 * **Purity is a property of the node, and the Water Extractor stands on
 * none.** The game separates them itself: water comes from `FGBuildableWaterPump`
 * and everything else from the resource-extractor classes, so which of them
 * ranges from half to double is read rather than guessed at from a class name.
 */
function buildExtractors(
  docs: readonly DocsGroup[],
  items: Readonly<Record<string, GameItem>>,
): Record<string, GameExtractor> {
  const extractors: Record<string, GameExtractor> = {};

  const add = (cls: DocsClass, purityVaries: boolean): void => {
    const perCycle = readNumber(cls['mItemsPerCycle']) ?? 0;
    const cycle = readNumber(cls['mExtractCycleTime']) ?? 0;
    if (perCycle <= 0 || cycle <= 0) return;

    const forms = readString(cls['mAllowedResourceForms']) ?? '';
    const fluid = /RF_LIQUID|RF_GAS/.test(forms);

    const resources: string[] = [];
    for (const match of (readString(cls['mAllowedResources']) ?? '').matchAll(
      /([A-Za-z0-9_]+_C)/g,
    )) {
      const id = match[1];
      if (id && items[id] && !resources.includes(id)) resources.push(id);
    }

    const perSecond = perCycle / cycle;
    const id = cls.ClassName.replace(/^Build_|_C$/g, '');
    extractors[id] = {
      id,
      name: readString(cls['mDisplayName']) ?? id,
      ratePerMinute: (fluid ? perSecond / LITRES_PER_CUBIC_METRE : perSecond) * SECONDS_PER_MINUTE,
      purityVaries,
      fluid,
      resources,
    };
  };

  for (const cls of classesMatching(
    docs,
    /FGBuildableResourceExtractor|FGBuildableFrackingExtractor/,
  )) {
    add(cls, true);
  }
  for (const cls of classesMatching(docs, /FGBuildableWaterPump/)) add(cls, false);

  return extractors;
}

function toPorts(
  raw: unknown,
  items: Readonly<Record<string, GameItem>>,
): RecipePort[] | undefined {
  const parsed = parseAmounts(raw);
  const ports: RecipePort[] = [];
  for (const { className, amount } of parsed) {
    const item = items[className];
    if (!item) return undefined;
    ports.push({
      item: className,
      amount: item.isFluid ? amount / LITRES_PER_CUBIC_METRE : amount,
    });
  }
  return ports;
}

function buildRecipes(
  docs: readonly DocsGroup[],
  items: Readonly<Record<string, GameItem>>,
  machines: Readonly<Record<string, GameMachine>>,
  skipped: string[],
): Record<string, GameRecipe> {
  const recipes: Record<string, GameRecipe> = {};

  for (const cls of classesMatching(docs, /FGRecipe/)) {
    const duration = readNumber(cls['mManufactoringDuration']);
    if (duration === undefined || duration <= 0) {
      skipped.push(`${cls.ClassName}: no manufacturing duration`);
      continue;
    }

    const machine = parseProducedIn(cls['mProducedIn']).find((id) => machines[id]);
    if (!machine) continue; // hand-crafted only; not a factory line.

    const outputs = toPorts(cls['mProduct'], items);
    const inputs = toPorts(cls['mIngredients'], items);
    if (!outputs || !inputs || outputs.length === 0) {
      skipped.push(`${cls.ClassName}: unresolved item reference`);
      continue;
    }

    recipes[cls.ClassName] = {
      id: cls.ClassName,
      name: readString(cls['mDisplayName']) ?? cls.ClassName,
      durationSeconds: duration,
      machine,
      inputs,
      outputs,
      isAlternate: cls.ClassName.startsWith('Recipe_Alternate_'),
    };
  }
  return recipes;
}

function buildMilestones(
  docs: readonly DocsGroup[],
  items: Readonly<Record<string, GameItem>>,
): Record<string, GameMilestone> {
  const milestones: Record<string, GameMilestone> = {};
  for (const cls of classesMatching(docs, /FGSchematic/)) {
    const match = MILESTONE_PATTERN.exec(cls.ClassName);
    if (!match) continue;
    milestones[cls.ClassName] = {
      id: cls.ClassName,
      name: readString(cls['mDisplayName']) ?? cls.ClassName,
      tier: Number(match[1]),
      cost: toPorts(cls['mCost'], items) ?? [],
      unlocks: parseUnlockedRecipes(cls['mUnlocks']),
    };
  }
  return milestones;
}

/**
 * Every unlock that hands out a recipe this database kept.
 *
 * A recipe is behind exactly one of these in the usual case and behind two in a
 * handful — Turbofuel arrives with its own hard drive and again with the sulfur
 * research — so this is built as schematic-to-recipes and read in reverse.
 *
 * Schematics unlocking nothing the database kept are dropped, which is most of
 * them: 574 classes in the game files, of which 197 unlock a recipe and the
 * rest sell AWESOME Shop parts and paint colours.
 */
function buildSchematics(
  docs: readonly DocsGroup[],
  recipes: Readonly<Record<string, GameRecipe>>,
): Record<string, GameSchematic> {
  const schematics: Record<string, GameSchematic> = {};
  for (const cls of classesMatching(docs, /FGSchematic/)) {
    const unlocks = parseUnlockedRecipes(cls['mUnlocks']).filter((id) => id in recipes);
    if (unlocks.length === 0) continue;

    const type = readString(cls['mType']) ?? '';
    schematics[cls.ClassName] = {
      id: cls.ClassName,
      name: readString(cls['mDisplayName']) ?? cls.ClassName,
      kind: SCHEMATIC_KINDS[type] ?? 'other',
      tier: readNumber(cls['mTechTier']) ?? 0,
      unlocks,
    };
  }
  return schematics;
}

/**
 * Turn a decoded Docs.json into the typed database the planner consumes.
 *
 * Items are pruned to those a recipe or milestone actually references, which
 * drops a few hundred equipment and customisation descriptors the planner has
 * no use for and roughly halves the payload the web app has to ship.
 */
export function extractDatabase(
  docs: readonly DocsGroup[],
  options: ExtractOptions,
): ExtractionReport {
  const skipped: string[] = [];
  const { items } = buildItems(docs);
  const machines = buildMachines(docs);
  const buildings = buildBuildings(docs);
  const recipes = buildRecipes(docs, items, machines, skipped);
  const generators = buildGenerators(docs, items);
  const carriers = buildCarriers(docs);
  const extractors = buildExtractors(docs, items);
  const milestones = buildMilestones(docs, items);
  const schematics = buildSchematics(docs, recipes);

  const referenced = new Set<string>();
  for (const recipe of Object.values(recipes)) {
    for (const port of [...recipe.inputs, ...recipe.outputs]) referenced.add(port.item);
  }
  for (const milestone of Object.values(milestones)) {
    for (const port of milestone.cost) referenced.add(port.item);
  }
  /*
   * Fuel counts as a reference. Every one of them happens to be in a recipe
   * today, so nothing would visibly break — until a generator names something
   * no recipe touches and the pruner quietly drops the item its burn rate is
   * stated in.
   */
  for (const generator of Object.values(generators)) {
    for (const fuel of generator.fuels) {
      referenced.add(fuel.item);
      if (fuel.supplemental) referenced.add(fuel.supplemental.item);
      if (fuel.byproduct) referenced.add(fuel.byproduct.item);
    }
  }

  const usedItems: Record<string, GameItem> = {};
  for (const id of referenced) {
    const item = items[id];
    if (item) usedItems[id] = item;
  }

  const usedMachines: Record<string, GameMachine> = {};
  for (const recipe of Object.values(recipes)) {
    const machine = machines[recipe.machine];
    if (machine) usedMachines[recipe.machine] = machine;
  }

  const database: GameDatabase = {
    sourceBuildId: options.sourceBuildId,
    items: usedItems,
    recipes,
    machines: usedMachines,
    generators,
    carriers,
    extractors,
    buildings,
    milestones,
    schematics,
  };

  return {
    database,
    counts: {
      items: Object.keys(usedItems).length,
      recipes: Object.keys(recipes).length,
      alternateRecipes: Object.values(recipes).filter((r) => r.isAlternate).length,
      machines: Object.keys(usedMachines).length,
      generators: Object.keys(generators).length,
      carriers: Object.keys(carriers).length,
      extractors: Object.keys(extractors).length,
      buildings: Object.keys(buildings).length,
      milestones: Object.keys(milestones).length,
      schematics: Object.keys(schematics).length,
    },
    skipped,
  };
}

export { type DocsClass, type DocsGroup };
