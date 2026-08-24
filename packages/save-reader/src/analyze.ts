import type {
  ActualLine,
  BuildingPath,
  BuildingPlacement,
  PhaseProgress,
  WorldSnapshot,
} from './types.js';

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
  readonly transform?: {
    readonly translation?: { x?: unknown; y?: unknown; z?: unknown };
    readonly rotation?: { x?: unknown; y?: unknown; z?: unknown; w?: unknown };
  };
}

interface Vec3 {
  x: number;
  y: number;
  z: number;
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

const CM_PER_METRE = 100;
/** A save with an enormous belt network should not bloat the snapshot. */
const MAX_PATHS = 20000;

function vec3(value: unknown): Vec3 | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const v = value as Record<string, unknown>;
  const x = num(v['x']);
  const y = num(v['y']);
  const z = num(v['z']);
  return x === undefined || y === undefined || z === undefined ? undefined : { x, y, z };
}

/**
 * Spline points are stored in the belt's local space, so they need the owning
 * object's rotation and translation applied to become world coordinates.
 *
 * Standard quaternion rotation: v + 2 * cross(q.xyz, cross(q.xyz, v) + q.w * v).
 */
function toWorld(transform: RawSaveObject['transform'], local: Vec3): Vec3 {
  const t = vec3(transform?.translation) ?? { x: 0, y: 0, z: 0 };
  const q = transform?.rotation;
  const ux = num(q?.x) ?? 0;
  const uy = num(q?.y) ?? 0;
  const uz = num(q?.z) ?? 0;
  const w = num(q?.w) ?? 1;

  const cx = uy * local.z - uz * local.y;
  const cy = uz * local.x - ux * local.z;
  const cz = ux * local.y - uy * local.x;
  const dx = cx + w * local.x;
  const dy = cy + w * local.y;
  const dz = cz + w * local.z;

  return {
    x: t.x + local.x + 2 * (uy * dz - uz * dy),
    y: t.y + local.y + 2 * (uz * dx - ux * dz),
    z: t.z + local.z + 2 * (ux * dy - uy * dx),
  };
}

const toMetres = (points: readonly Vec3[]): [number, number][] => {
  const out: [number, number][] = [];
  for (const p of points) {
    const point: [number, number] = [
      Math.round(p.x / CM_PER_METRE),
      Math.round(p.y / CM_PER_METRE),
    ];
    const last = out[out.length - 1];
    // Rounding to metres collapses near-duplicate spline points; drop them.
    if (last && last[0] === point[0] && last[1] === point[1]) continue;
    out.push(point);
  }
  return out;
};

/** Belt and pipe routes, from the spline stored on the object. */
function readSpline(object: RawSaveObject): [number, number][] {
  const raw = object.properties?.['mSplineData'];
  if (!raw || typeof raw !== 'object' || !('values' in raw)) return [];
  const values = (raw as { values: unknown }).values;
  if (!Array.isArray(values)) return [];

  const world: Vec3[] = [];
  for (const entry of values) {
    const location = vec3(
      propValue((entry as { properties?: Record<string, unknown> })?.properties, 'Location'),
    );
    if (location) world.push(toWorld(object.transform, location));
  }
  return toMetres(world);
}

/** Power lines carry their endpoints already in world space. */
function readWires(object: RawSaveObject): [number, number][][] {
  const raw = object.properties?.['mWireInstances'];
  if (!raw || typeof raw !== 'object' || !('values' in raw)) return [];
  const values = (raw as { values: unknown }).values;
  if (!Array.isArray(values)) return [];

  const wires: [number, number][][] = [];
  for (const entry of values) {
    const locations = (entry as { properties?: Record<string, unknown> })?.properties?.[
      'Locations'
    ];
    const list = Array.isArray(locations) ? locations : [locations];
    const points: Vec3[] = [];
    for (const item of list) {
      const point = vec3((item as { value?: unknown })?.value);
      if (point) points.push(point);
    }
    const line = toMetres(points);
    if (line.length >= 2) wires.push(line);
  }
  return wires;
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
  const placements: BuildingPlacement[] = [];
  const paths: BuildingPath[] = [];
  const milestones: string[] = [];
  let phase: PhaseProgress | null = null;
  let objectCount = 0;

  for (const level of Object.values(save.levels ?? {})) {
    for (const object of level.objects ?? []) {
      objectCount += 1;
      const typePath = object.typePath ?? '';
      const properties = object.properties;

      const recipe = objectPath(propValue(properties, 'mCurrentRecipe'));

      if (typePath.includes('/Build_')) {
        const id = buildingId(typePath);
        buildings[id] = (buildings[id] ?? 0) + 1;

        if (paths.length < MAX_PATHS) {
          if (/ConveyorBelt|ConveyorLift/.test(id)) {
            const points = readSpline(object);
            if (points.length >= 2) paths.push({ kind: 'belt', points });
          } else if (/Pipeline/.test(id)) {
            const points = readSpline(object);
            if (points.length >= 2) paths.push({ kind: 'pipe', points });
          } else if (/PowerLine/.test(id)) {
            for (const points of readWires(object)) paths.push({ kind: 'power', points });
          }
        }

        const at = object.transform?.translation;
        const x = num(at?.x);
        const y = num(at?.y);
        const z = num(at?.z);
        if (x !== undefined && y !== undefined && z !== undefined) {
          placements.push({
            machine: id,
            x: Math.round(x / CM_PER_METRE),
            y: Math.round(y / CM_PER_METRE),
            z: Math.round(z / CM_PER_METRE),
            ...(recipe ? { recipe } : {}),
          });
        }
      }

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
    placements,
    paths,
    milestones: [...new Set(milestones)].sort(),
    phase,
    objectCount,
  };
}
