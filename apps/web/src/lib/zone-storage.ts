import { z } from 'zod';
import type { ZoneName } from './zones';

/**
 * Names the player has given places in their base.
 *
 * Kept apart from the plan on purpose: a plan is what you intend to build and
 * is thrown away when you clear it, whereas "this corner is the coal plant" is
 * a fact about the world that outlives any number of plans.
 *
 * Each name is pinned to a coordinate rather than to a zone id, because ids are
 * positional and the next autosave renumbers them. Parsed rather than cast, for
 * the same reason the plan is.
 */
const storedZonesSchema = z.object({
  version: z.literal(1),
  names: z.array(
    z.object({
      at: z.object({ x: z.number().finite(), y: z.number().finite() }),
      name: z.string().min(1).max(40),
    }),
  ),
});

const STORAGE_KEY = 'factory-board.zones.v1';

export function loadZoneNames(): ZoneName[] {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return [];
    const result = storedZonesSchema.safeParse(JSON.parse(raw));
    return result.success ? result.data.names : [];
  } catch {
    // Private browsing, blocked site data, or malformed JSON. Start fresh.
    return [];
  }
}

export function saveZoneNames(names: readonly ZoneName[]): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify({ version: 1, names }));
  } catch {
    // Storage unavailable or full; the names still hold for this session.
  }
}
