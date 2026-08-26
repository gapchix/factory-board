import type {
  GameBuilding,
  GameDatabase,
  GameItem,
  GameMachine,
  GameMilestone,
  GameRecipe,
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
    readonly buildings: number;
    readonly milestones: number;
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
    items[cls.ClassName] = {
      id: cls.ClassName,
      name: readString(cls['mDisplayName']) ?? cls.ClassName,
      isRaw: rawIds.has(cls.ClassName),
      isFluid: FLUID_FORMS.has(readString(cls['mForm']) ?? ''),
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
  const milestones = buildMilestones(docs, items);

  const referenced = new Set<string>();
  for (const recipe of Object.values(recipes)) {
    for (const port of [...recipe.inputs, ...recipe.outputs]) referenced.add(port.item);
  }
  for (const milestone of Object.values(milestones)) {
    for (const port of milestone.cost) referenced.add(port.item);
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
    buildings,
    milestones,
  };

  return {
    database,
    counts: {
      items: Object.keys(usedItems).length,
      recipes: Object.keys(recipes).length,
      alternateRecipes: Object.values(recipes).filter((r) => r.isAlternate).length,
      machines: Object.keys(usedMachines).length,
      buildings: Object.keys(buildings).length,
      milestones: Object.keys(milestones).length,
    },
    skipped,
  };
}

export { type DocsClass, type DocsGroup };
