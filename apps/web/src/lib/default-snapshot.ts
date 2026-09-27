import type {
  ActualLine,
  BuildingLink,
  BuildingPath,
  BuildingPlacement,
  PowerCircuit,
  WorldSnapshot,
} from '@factory-board/save-reader';
import { demoSnapshot } from '@factory-board/game-data/demo';
import { z } from 'zod';
import raw from '@/generated/default-snapshot.json';

/**
 * The save baked in at build time by `scripts/sync-save.mjs`.
 *
 * Parsed rather than cast, for the same reason the game database is: it is a
 * generated artefact that can be stale, half-written, or produced by an older
 * version of the reader. A bad one should degrade to "drop a save in", never to
 * a dashboard of `undefined`.
 */
const lineSchema = z.object({
  recipe: z.string(),
  machine: z.string(),
  count: z.number().int().nonnegative(),
  uptime: z.number().min(0).max(1).nullable(),
  clock: z.number().positive(),
});

const placementSchema = z.object({
  machine: z.string(),
  x: z.number(),
  y: z.number(),
  z: z.number(),
  recipe: z.string().optional(),
  facing: z.number().optional(),
  role: z.enum(['production', 'extraction', 'power']).optional(),
  resource: z.string().optional(),
  uptime: z.number().min(0).max(1).optional(),
  input: z.record(z.string(), z.number()).optional(),
  output: z.record(z.string(), z.number()).optional(),
  holding: z.record(z.string(), z.number()).optional(),
  fuel: z.number().optional(),
  circuit: z.number().optional(),
});

const circuitSchema = z.object({
  id: z.number(),
  members: z.array(z.number().int().nonnegative()),
  demandMW: z.number().nonnegative(),
  capacityMW: z.number().nonnegative(),
});

const pathSchema = z.object({
  kind: z.enum(['belt', 'pipe', 'power']),
  points: z.array(z.tuple([z.number(), z.number()])),
  building: z.number().int().nonnegative().optional(),
});

const linkSchema = z.object({
  from: z.number().int().nonnegative(),
  to: z.number().int().nonnegative(),
  kind: z.enum(['belt', 'pipe']),
});

const snapshotSchema = z.object({
  sessionName: z.string(),
  playDurationSeconds: z.number().nonnegative(),
  saveBuildVersion: z.number().nonnegative(),
  savedAt: z.number().nullable(),
  lines: z.record(z.string(), lineSchema),
  buildings: z.record(z.string(), z.number().int().nonnegative()),
  stored: z.record(z.string(), z.number()),
  placements: z.array(placementSchema),
  paths: z.array(pathSchema),
  links: z.array(linkSchema),
  milestones: z.array(z.string()),
  circuits: z.array(circuitSchema),
  phase: z
    .object({
      current: z.string().nullable(),
      target: z.string().nullable(),
      delivered: z.record(z.string(), z.number()),
      // Absent on a snapshot written before the reader learned it; 1 is the
      // game's own default.
      costMultiplier: z.number().positive().default(1),
    })
    .nullable(),
  objectCount: z.number().int().nonnegative(),
  modded: z.boolean().default(false),
});

/*
 * Zod strips what it has not been told about, so a schema that has fallen
 * behind the reader does not fail — it quietly deletes the fields it does not
 * know, and the board renders a base with no miners in it. That is exactly what
 * happened when placements learned what they were for and this file did not.
 *
 * The same key-completeness check the game database carries, for the same
 * reason: it compares keys rather than whole types, because the domain uses
 * readonly arrays where Zod infers mutable ones and a plain `extends` fails on
 * variance that has nothing to do with completeness.
 */
type AssertNoMissingKeys<Domain, Shape> =
  Exclude<keyof Domain, keyof Shape> extends never
    ? true
    : { error: 'schema is missing keys'; missing: Exclude<keyof Domain, keyof Shape> };

const _lineKeys: AssertNoMissingKeys<ActualLine, z.infer<typeof lineSchema>> = true;
const _placementKeys: AssertNoMissingKeys<
  BuildingPlacement,
  z.infer<typeof placementSchema>
> = true;
const _pathKeys: AssertNoMissingKeys<BuildingPath, z.infer<typeof pathSchema>> = true;
const _linkKeys: AssertNoMissingKeys<BuildingLink, z.infer<typeof linkSchema>> = true;
const _circuitKeys: AssertNoMissingKeys<PowerCircuit, z.infer<typeof circuitSchema>> = true;
const _snapshotKeys: AssertNoMissingKeys<WorldSnapshot, z.infer<typeof snapshotSchema>> = true;

void [_lineKeys, _placementKeys, _pathKeys, _linkKeys, _circuitKeys, _snapshotKeys];

/**
 * An earlier save from the same session, carrying only what a history digest
 * reads.
 *
 * The game's three rotating autosave slots are already a time series, and
 * History used to start empty and fill only while the page was open — a feature
 * about how a session is going, with one point in it. `scripts/sync-save.mjs`
 * now reads the rest of the session too.
 *
 * `placements` arrives as a list of bare roles because that is all
 * `digestOf` reads off them: it counts extractors and generators and takes the
 * length. Shipping four hundred real placements a save would put back the weight
 * [ADR 16](../../../../docs/adr/0016-history-keeps-a-digest.md) took out.
 */
const earlierSchema = z.object({
  source: z.string(),
  snapshot: z.object({
    sessionName: z.string(),
    playDurationSeconds: z.number().nonnegative(),
    savedAt: z.number().nullable(),
    lines: z.record(z.string(), lineSchema),
    milestones: z.array(z.string()),
    phase: z
      .object({
        current: z.string().nullable(),
        target: z.string().nullable(),
        delivered: z.record(z.string(), z.number()),
        costMultiplier: z.number().positive().default(1),
      })
      .nullable(),
    placements: z.array(
      z.object({ role: z.enum(['production', 'extraction', 'power']).optional() }),
    ),
  }),
});

const envelopeSchema = z.discriminatedUnion('present', [
  z.object({ present: z.literal(false) }),
  z.object({
    present: z.literal(true),
    source: z.string(),
    loadedAt: z.string(),
    snapshot: snapshotSchema,
    // Absent on an envelope written by an older sync script.
    earlier: z.array(earlierSchema).optional(),
  }),
]);

/** What a digest needs from a save, and nothing else. */
export type HistorySeed = z.infer<typeof earlierSchema>;

export interface DefaultSave {
  readonly snapshot: WorldSnapshot;
  readonly source: string;
  readonly loadedAt: string;
  /** Earlier saves from the same session, oldest first. */
  readonly earlier: readonly HistorySeed[];
}

function read(): DefaultSave | null {
  const parsed = envelopeSchema.safeParse(raw as unknown);
  if (!parsed.success || !parsed.data.present) return null;
  const { snapshot, source, loadedAt, earlier } = parsed.data;
  return { snapshot, source, loadedAt, earlier: earlier ?? [] };
}

export const defaultSave: DefaultSave | null = read();

/**
 * The demo base, on demand.
 *
 * Bundled rather than fetched, and put through the same schema as a save read
 * off disk — it arrives from a package, and a package can be a version behind.
 * "Parse at the boundary" does not have an exception for data we wrote
 * ourselves; that is precisely the data most likely to drift unnoticed.
 *
 * It reads correctly against the *real* database as well as the demo one,
 * because the demo uses the game's own recipe and item ids. So the button works
 * whatever is installed.
 */
function readDemo(): WorldSnapshot | null {
  const parsed = snapshotSchema.safeParse(demoSnapshot());
  return parsed.success ? parsed.data : null;
}

/**
 * Worked out once, at module load, so a caller can ask whether there is a demo
 * *before* offering a button for it. A control that silently does nothing when
 * pressed is worse than one that is not there.
 */
export const demoSave: WorldSnapshot | null = readDemo();

/**
 * Whether the save the app opened on is itself the demo.
 *
 * It is, on any machine without the game — and that changes what the header can
 * offer. There is no "back to your save" when the baked-in save *is* the demo,
 * and a button promising one is a button that does nothing. This is read from
 * the envelope rather than from the snapshot's name, because a real session
 * could be called anything, "demo" included.
 */
export const defaultIsDemo: boolean = defaultSave?.source === 'demo';

/**
 * Whether the base on screen is the demo, from where it came from.
 *
 * Three ways in: the reader asked for it, or the build baked it and it is
 * still the one showing. A real save dropped on a demo build is not the demo,
 * however the page opened.
 */
export function isDemo(source: { readonly kind: string } | null | undefined): boolean {
  return source?.kind === 'demo' || (source?.kind === 'default' && defaultIsDemo);
}
