/**
 * Marking direction along a polyline.
 *
 * A belt drawn as a plain line says two machines are joined; it does not say
 * which way the ore moves, which is most of what you want to know when a cell is
 * starving. Chevrons along the run say it — but only if they are evenly spaced
 * along the *route*, not per segment: a belt bends every few metres, and one
 * arrow per segment gives a dense clump at every corner and nothing on the
 * straights.
 */

export interface PathMarker {
  readonly x: number;
  readonly y: number;
  /** Direction of travel here, in radians, measured as `atan2(dy, dx)`. */
  readonly angle: number;
}

export interface SampleOptions {
  /** Runs shorter than this get no marker at all. Default 0. */
  readonly minLength?: number;
}

/**
 * Points spaced roughly `spacing` apart along the polyline, each carrying the
 * direction of the segment it lands on.
 *
 * Spacing is nominal: the count is rounded, then the markers are distributed
 * evenly and inset by half a gap, so a run always gets at least one and they sit
 * symmetrically rather than crowding one end.
 */
export function sampleAlong(
  points: readonly (readonly [number, number])[],
  spacing: number,
  options: SampleOptions = {},
): PathMarker[] {
  if (points.length < 2 || spacing <= 0) return [];

  const segments: { x: number; y: number; dx: number; dy: number; length: number }[] = [];
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const from = points[i - 1]!;
    const to = points[i]!;
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const length = Math.hypot(dx, dy);
    if (length === 0) continue;
    segments.push({ x: from[0], y: from[1], dx, dy, length });
    total += length;
  }
  if (total === 0 || total < (options.minLength ?? 0)) return [];

  const count = Math.max(1, Math.round(total / spacing));
  const step = total / count;

  const markers: PathMarker[] = [];
  let segment = 0;
  let travelled = 0;
  for (let i = 0; i < count; i += 1) {
    const target = (i + 0.5) * step;
    while (segment < segments.length - 1 && travelled + segments[segment]!.length < target) {
      travelled += segments[segment]!.length;
      segment += 1;
    }
    const current = segments[segment]!;
    const along = Math.min(1, Math.max(0, (target - travelled) / current.length));
    markers.push({
      x: current.x + current.dx * along,
      y: current.y + current.dy * along,
      angle: Math.atan2(current.dy, current.dx),
    });
  }
  return markers;
}
