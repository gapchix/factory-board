import type { WorldSnapshot } from '@factory-board/save-reader';
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
});

const pathSchema = z.object({
  kind: z.enum(['belt', 'pipe', 'power']),
  points: z.array(z.tuple([z.number(), z.number()])),
});

const snapshotSchema = z.object({
  sessionName: z.string(),
  playDurationSeconds: z.number().nonnegative(),
  saveBuildVersion: z.number().nonnegative(),
  lines: z.record(z.string(), lineSchema),
  buildings: z.record(z.string(), z.number().int().nonnegative()),
  placements: z.array(placementSchema),
  paths: z.array(pathSchema),
  milestones: z.array(z.string()),
  phase: z
    .object({
      current: z.string().nullable(),
      target: z.string().nullable(),
      delivered: z.record(z.string(), z.number()),
    })
    .nullable(),
  objectCount: z.number().int().nonnegative(),
});

const envelopeSchema = z.discriminatedUnion('present', [
  z.object({ present: z.literal(false) }),
  z.object({
    present: z.literal(true),
    source: z.string(),
    loadedAt: z.string(),
    snapshot: snapshotSchema,
  }),
]);

export interface DefaultSave {
  readonly snapshot: WorldSnapshot;
  readonly source: string;
  readonly loadedAt: string;
}

function read(): DefaultSave | null {
  const parsed = envelopeSchema.safeParse(raw as unknown);
  if (!parsed.success || !parsed.data.present) return null;
  const { snapshot, source, loadedAt } = parsed.data;
  return { snapshot, source, loadedAt };
}

export const defaultSave: DefaultSave | null = read();
