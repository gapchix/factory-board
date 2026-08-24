import type { ActualLine, PhaseProgress, WorldSnapshot } from './types.js';

/**
 * A deliberately loose view of what the save parser returns.
 *
 * The upstream parser exposes the whole Unreal property tree, and its exact
 * types shift between game updates. Reading through a minimal structural type
 * with defensive accessors means a renamed property degrades one field instead
 * of failing the entire load.
 */
export interface RawSaveObject {
  readonly typePath?: string;
  readonly instanceName?: string;
  readonly properties?: Record<string, unknown>;
}

export interface RawSaveLevel {
  readonly objects?: readonly RawSaveObject[];
}

export interface RawSave {
  readonly header?: Record<string, unknown>;
  readonly levels?: Record<string, RawSaveLevel>;
}

/** `…/Build_ConstructorMk1.Build_ConstructorMk1_C` → `Build_ConstructorMk1_C` */
function tail(path: unknown): string {
  return typeof path === 'string' ? (path.split('.').pop() ?? '') : '';
}

function stripClass(name: string): string {
  return name.replace(/_C$/, '');
}

/**
 * `…/Build_ConstructorMk1.Build_ConstructorMk1_C` → `ConstructorMk1`.
 *
 * Both the prefix and the suffix have to go: this id is the join key against
 * `GameDatabase.machines`, which the extractor keys the same way. Strip only one
 * of them and every building silently fails to match a machine.
 */
function buildingId(typePath: string): string {
  return stripClass(tail(typePath)).replace(/^Build_/, '');
}

function propValue(properties: Record<string, unknown> | undefined, key: string): unknown {
  const prop = properties?.[key];
  if (prop && typeof prop === 'object' && 'value' in prop) {
    return (prop as { value: unknown }).value;
  }
  return undefined;
}

function propValues(properties: Record<string, unknown> | undefined, key: string): unknown[] {
  const prop = properties?.[key];
  if (prop && typeof prop === 'object' && 'values' in prop) {
    const values = (prop as { values: unknown }).values;
    if (Array.isArray(values)) return values;
  }
  return [];
}

function objectPath(value: unknown): string {
  if (value && typeof value === 'object' && 'pathName' in value) {
    return tail((value as { pathName: unknown }).pathName);
  }
  return '';
}

function num(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

interface LineAccumulator {
  machine: string;
  count: number;
  uptimeSamples: number[];
  clockSamples: number[];
}

function readPhase(properties: Record<string, unknown> | undefined): PhaseProgress {
  const delivered: Record<string, number> = {};
  for (const entry of propValues(properties, 'mTargetGamePhasePaidOffCosts')) {
    if (!entry || typeof entry !== 'object' || !('properties' in entry)) continue;
    const inner = (entry as { properties?: Record<string, unknown> }).properties;
    const item = objectPath(propValue(inner, 'ItemClass'));
    const amount = num(propValue(inner, 'Amount'));
    if (item && amount !== undefined) delivered[item] = amount;
  }
  const current = objectPath(propValue(properties, 'mCurrentGamePhase'));
  const target = objectPath(propValue(properties, 'mTargetGamePhase'));
  return {
    current: current || null,
    target: target || null,
    delivered,
  };
}

/**
 * Reduce a parsed save into the handful of facts the board actually uses.
 *
 * Uptime comes from the game's own productivity measurement, which every
 * manufacturer stores as a produced-duration over a window duration. It is the
 * single most useful number in the file: it tells you which lines are starving
 * without walking to each machine.
 */
export function analyzeSave(save: RawSave): WorldSnapshot {
  const lines = new Map<string, LineAccumulator>();
  const buildings: Record<string, number> = {};
  const milestones: string[] = [];
  let phase: PhaseProgress | null = null;
  let objectCount = 0;

  for (const level of Object.values(save.levels ?? {})) {
    for (const object of level.objects ?? []) {
      objectCount += 1;
      const typePath = object.typePath ?? '';
      const properties = object.properties;

      if (typePath.includes('/Build_')) {
        const id = buildingId(typePath);
        buildings[id] = (buildings[id] ?? 0) + 1;
      }

      const recipe = objectPath(propValue(properties, 'mCurrentRecipe'));
      if (recipe) {
        let line = lines.get(recipe);
        if (!line) {
          line = {
            machine: buildingId(typePath),
            count: 0,
            uptimeSamples: [],
            clockSamples: [],
          };
          lines.set(recipe, line);
        }
        line.count += 1;

        const producing = num(propValue(properties, 'mLastProductivityMeasurementProduceDuration'));
        const window = num(propValue(properties, 'mLastProductivityMeasurementDuration'));
        if (producing !== undefined && window !== undefined && window > 0) {
          line.uptimeSamples.push(Math.max(0, Math.min(1, producing / window)));
        }

        // Absent means an untouched 100% clock rather than zero.
        line.clockSamples.push(num(propValue(properties, 'mCurrentPotential')) ?? 1);
      }

      if (/SchematicManager/.test(typePath)) {
        for (const entry of propValues(properties, 'mPurchasedSchematics')) {
          const id = objectPath(entry);
          if (id) milestones.push(id);
        }
      }

      if (/GamePhaseManager/.test(typePath)) {
        phase = readPhase(properties);
      }
    }
  }

  const mean = (values: readonly number[]): number | null =>
    values.length === 0 ? null : values.reduce((sum, v) => sum + v, 0) / values.length;

  const resolved: Record<string, ActualLine> = {};
  for (const [recipe, line] of lines) {
    resolved[recipe] = {
      recipe,
      machine: line.machine,
      count: line.count,
      uptime: mean(line.uptimeSamples),
      clock: mean(line.clockSamples) ?? 1,
    };
  }

  const header = save.header;
  return {
    sessionName: str(header?.['sessionName'], 'Unnamed save'),
    playDurationSeconds: num(header?.['playDurationSeconds']) ?? 0,
    saveBuildVersion: num(header?.['buildVersion']) ?? 0,
    lines: resolved,
    buildings,
    milestones: [...new Set(milestones)].sort(),
    phase,
    objectCount,
  };
}
