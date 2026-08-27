/**
 * What is off the map, and where to point at it.
 *
 * The camera opens on the factory and the rest of the base is a drag away —
 * which is fine, except nothing said the rest of the base was there. A coal
 * outpost 300 m east is the reason the coal plant is amber, and until you
 * happened to drag east there was no way to learn it existed
 * ([ADR 21](../../../../docs/adr/0021-one-map-not-two.md) records losing this
 * with the schematic map, which drew a pointer at the frame edge and then a
 * whole rail of them).
 *
 * So every place that is entirely off screen gets a chip on the edge it lies
 * beyond, at the point where the line to it leaves the view. Position carries
 * the direction, the arrow carries it again for anything near a corner, and the
 * number carries how far. It is worked out against the *current* camera rather
 * than the opening frame, so it keeps telling the truth as the reader moves —
 * pan east to the outpost and the factory grows a chip of its own.
 *
 * Nothing here knows what a Satisfactory is, or what Pixi is: it takes boxes
 * and a camera and returns rectangles in screen pixels.
 */

/** A place worth pointing at: a zone, in the only terms this file needs. */
export interface SignpostTarget {
  readonly id: string;
  readonly label: string;
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly uptime: number | null;
}

/** The camera, as the map holds it, plus the size of the surface it draws on. */
export interface SignpostView {
  /** Camera centre, in world metres. */
  readonly x: number;
  readonly y: number;
  /** Pixels per metre. */
  readonly scale: number;
  /** Surface size, in pixels. */
  readonly width: number;
  readonly height: number;
}

export interface SignpostOptions {
  readonly chipWidth: number;
  readonly chipHeight: number;
  /** Clear air between a chip and the edge of the surface. */
  readonly margin: number;
  /** Clear air between two chips on the same edge. */
  readonly gap: number;
  /** Chips on one edge before the rest are counted rather than drawn. */
  readonly maxPerEdge: number;
}

export const SIGNPOST_DEFAULTS: SignpostOptions = {
  chipWidth: 134,
  chipHeight: 34,
  margin: 8,
  gap: 6,
  maxPerEdge: 4,
};

export type SignpostEdge = 'left' | 'right' | 'top' | 'bottom';

export interface Signpost {
  /** The zone to fly to, or null for the chip that stands for the rest. */
  readonly id: string | null;
  readonly label: string;
  /** Uptime of the place, for the tone bar. Null on an overflow chip. */
  readonly uptime: number | null;
  /** Chip's top-left corner, in pixels within the surface. */
  readonly x: number;
  readonly y: number;
  readonly edge: SignpostEdge;
  /** Radians from the middle of the view towards the place, screen axes. */
  readonly bearing: number;
  /** Metres from the middle of the view to the middle of the place. */
  readonly distanceM: number;
  /** How many further places this chip stands for. Zero on a real one. */
  readonly more: number;
}

/** `310 m`, `1.2 km` — the precision a distance deserves at its size. */
export function distanceLabel(metres: number): string {
  if (metres >= 1000) return `${(metres / 1000).toFixed(1)} km`;
  if (metres >= 100) return `${Math.round(metres / 5) * 5} m`;
  return `${Math.round(metres)} m`;
}

interface Placed {
  target: SignpostTarget;
  edge: SignpostEdge;
  /** Chip centre before crowding is resolved. */
  cx: number;
  cy: number;
  bearing: number;
  distanceM: number;
}

/**
 * Which chips to draw, and where.
 *
 * Returns an empty list when everything is on screen, which is the common case
 * at the opening frame and the reason this costs nothing to leave running.
 */
export function signpostsFor(
  targets: readonly SignpostTarget[],
  view: SignpostView,
  options: SignpostOptions = SIGNPOST_DEFAULTS,
): Signpost[] {
  const { chipWidth, chipHeight, margin, gap, maxPerEdge } = options;
  if (view.scale <= 0) return [];

  // Half the room a chip's centre may occupy, which is what the ray is aimed
  // at: a surface too small to hold one chip gets none rather than a chip
  // hanging off both edges at once.
  const halfW = view.width / 2 - margin - chipWidth / 2;
  const halfH = view.height / 2 - margin - chipHeight / 2;
  if (halfW <= 0 || halfH <= 0) return [];

  const seenW = view.width / 2 / view.scale;
  const seenH = view.height / 2 / view.scale;
  const seen = {
    minX: view.x - seenW,
    maxX: view.x + seenW,
    minY: view.y - seenH,
    maxY: view.y + seenH,
  };

  const placed: Placed[] = [];
  for (const target of targets) {
    // Any part of it on screen is enough. A zone half in view needs no
    // signpost; the reader can see where it went.
    const visible =
      target.minX <= seen.maxX &&
      target.maxX >= seen.minX &&
      target.minY <= seen.maxY &&
      target.maxY >= seen.minY;
    if (visible) continue;

    const dx = (target.minX + target.maxX) / 2 - view.x;
    const dy = (target.minY + target.maxY) / 2 - view.y;
    if (dx === 0 && dy === 0) continue;

    const sx = dx * view.scale;
    const sy = dy * view.scale;
    // How far along the ray the view's edge is, in each axis. The nearer of the
    // two is the edge it actually leaves by.
    const tx = sx === 0 ? Infinity : halfW / Math.abs(sx);
    const ty = sy === 0 ? Infinity : halfH / Math.abs(sy);
    const t = Math.min(tx, ty);
    if (!Number.isFinite(t)) continue;

    placed.push({
      target,
      edge: tx <= ty ? (sx < 0 ? 'left' : 'right') : sy < 0 ? 'top' : 'bottom',
      cx: view.width / 2 + sx * t,
      cy: view.height / 2 + sy * t,
      bearing: Math.atan2(dy, dx),
      distanceM: Math.hypot(dx, dy),
    });
  }

  // Nearest first, so a cap keeps what is most likely to be the answer.
  placed.sort((a, b) => a.distanceM - b.distanceM);

  const out: Signpost[] = [];
  for (const edge of ['left', 'right', 'top', 'bottom'] as const) {
    const onEdge = placed.filter((entry) => entry.edge === edge);
    if (onEdge.length === 0) continue;

    const vertical = edge === 'left' || edge === 'right';
    const extent = vertical ? chipHeight : chipWidth;
    const limit = vertical ? view.height : view.width;
    const across = vertical
      ? edge === 'left'
        ? margin
        : view.width - margin - chipWidth
      : edge === 'top'
        ? margin
        : view.height - margin - chipHeight;

    const shown = onEdge.slice(0, maxPerEdge);
    const hidden = onEdge.length - shown.length;

    const chips: { entry: Placed | null; along: number; more: number }[] = shown.map((entry) => ({
      entry,
      along: vertical ? entry.cy : entry.cx,
      more: 0,
    }));
    if (hidden > 0) {
      // The count goes where the ones it stands for were heading, so it reads
      // as part of the same rail rather than as a stray note.
      const last = shown[shown.length - 1]!;
      chips.push({ entry: null, along: vertical ? last.cy : last.cx, more: hidden });
    }

    /*
     * Two places in nearly the same direction want nearly the same pixel, so
     * the chips are pushed apart along their own edge: forwards first, then
     * backwards off the far end for the case where the forward pass ran out of
     * room. Order along the edge is preserved, so a chip still sits on the side
     * its place lies towards.
     */
    chips.sort((a, b) => a.along - b.along);
    let cursor = margin + extent / 2;
    for (const chip of chips) {
      chip.along = Math.max(chip.along, cursor);
      cursor = chip.along + extent + gap;
    }
    let back = limit - margin - extent / 2;
    for (let i = chips.length - 1; i >= 0; i -= 1) {
      const chip = chips[i]!;
      chip.along = Math.min(chip.along, back);
      back = chip.along - extent - gap;
    }

    for (const chip of chips) {
      const along = chip.along - extent / 2;
      const [x, y] = vertical ? [across, along] : [along, across];
      if (chip.entry) {
        out.push({
          id: chip.entry.target.id,
          label: chip.entry.target.label,
          uptime: chip.entry.target.uptime,
          x,
          y,
          edge,
          bearing: chip.entry.bearing,
          distanceM: chip.entry.distanceM,
          more: 0,
        });
      } else {
        out.push({
          id: null,
          label: `+${chip.more} more`,
          uptime: null,
          x,
          y,
          edge,
          bearing: 0,
          distanceM: 0,
          more: chip.more,
        });
      }
    }
  }

  return out;
}

/** The chip under a point, if any. Last drawn wins, as on the map itself. */
export function signpostAt(
  signposts: readonly Signpost[],
  x: number,
  y: number,
  options: SignpostOptions = SIGNPOST_DEFAULTS,
): Signpost | null {
  for (let i = signposts.length - 1; i >= 0; i -= 1) {
    const chip = signposts[i]!;
    if (
      x >= chip.x &&
      x <= chip.x + options.chipWidth &&
      y >= chip.y &&
      y <= chip.y + options.chipHeight
    ) {
      return chip;
    }
  }
  return null;
}
