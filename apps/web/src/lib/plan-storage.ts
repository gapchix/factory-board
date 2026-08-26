import { z } from 'zod';

/**
 * Plans live in localStorage, which is user-editable, survives deploys and can
 * hold data written by an older version of the app. So it is parsed, not cast.
 * A plan that no longer fits the schema is discarded rather than crashing the
 * board — losing a plan is annoying, a white screen is worse.
 */
const storedPlanSchema = z.object({
  // v2 added the zone each target is meant to be built in. A v1 plan is still
  // a valid plan: it simply says nothing about where anything goes.
  version: z.union([z.literal(1), z.literal(2)]),
  targets: z.array(
    z.object({
      item: z.string().min(1),
      ratePerMinute: z.number().positive().finite(),
    }),
  ),
  recipeChoices: z.record(z.string(), z.string()),
  zoneAssignments: z
    .record(z.string(), z.object({ x: z.number().finite(), y: z.number().finite() }))
    .optional(),
});

type StoredPlanInput = z.input<typeof storedPlanSchema>;

export interface StoredPlan {
  targets: { item: string; ratePerMinute: number }[];
  recipeChoices: Record<string, string>;
  /** Target item → a point in the zone it is to be built in. */
  zoneAssignments: Record<string, { x: number; y: number }>;
}

const STORAGE_KEY = 'factory-board.plan.v1';

export function loadPlan(): StoredPlan | null {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return null;
    const result = storedPlanSchema.safeParse(JSON.parse(raw));
    if (!result.success) return null;
    return {
      targets: result.data.targets,
      recipeChoices: result.data.recipeChoices,
      zoneAssignments: result.data.zoneAssignments ?? {},
    };
  } catch {
    // Private browsing, blocked site data, or malformed JSON. Start fresh.
    return null;
  }
}

export function savePlan(plan: StoredPlan): void {
  try {
    const stored: StoredPlanInput = { version: 2, ...plan };
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // Storage unavailable or full; the in-memory plan still works.
  }
}
