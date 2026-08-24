import { z } from 'zod';

/**
 * Plans live in localStorage, which is user-editable, survives deploys and can
 * hold data written by an older version of the app. So it is parsed, not cast.
 * A plan that no longer fits the schema is discarded rather than crashing the
 * board — losing a plan is annoying, a white screen is worse.
 */
const storedPlanSchema = z.object({
  version: z.literal(1),
  targets: z.array(
    z.object({
      item: z.string().min(1),
      ratePerMinute: z.number().positive().finite(),
    }),
  ),
  recipeChoices: z.record(z.string(), z.string()),
});

export type StoredPlan = z.infer<typeof storedPlanSchema>;

const STORAGE_KEY = 'factory-board.plan.v1';

export function loadPlan(): StoredPlan | null {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return null;
    const result = storedPlanSchema.safeParse(JSON.parse(raw));
    return result.success ? result.data : null;
  } catch {
    // Private browsing, blocked site data, or malformed JSON. Start fresh.
    return null;
  }
}

export function savePlan(plan: Omit<StoredPlan, 'version'>): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify({ version: 1, ...plan }));
  } catch {
    // Storage unavailable or full; the in-memory plan still works.
  }
}
