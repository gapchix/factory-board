/**
 * Where a block's name goes.
 *
 * Every caption used to hang four pixels below its block, which is the right
 * answer for one block and the wrong one for a factory: on the reference save
 * `Solid Biofuel` was struck through by the IRON INGOT zone caption, `Iron
 * Ingot ×4` ran into `SCREWS`, and both crossed machines belonging to neither.
 * A fixed offset has nowhere to go when the space below is spoken for, so the
 * loser was simply dropped — a name lost to a collision that moving three
 * pixels would have solved.
 *
 * So a caption tries a ring of positions around its block and takes the first
 * that is clear. Rings, not just sides: touching, a step out, a stride out.
 * Past the first ring a caption is far enough from its block to be ambiguous
 * about which one it names, so it is joined back to it by a leader line — the
 * same bargain the schematic map struck before it was deleted
 * ([ADR 21](../../../../docs/adr/0021-one-map-not-two.md)), ported here because
 * this map now has to answer for both.
 *
 * Nothing here knows what a Satisfactory is, or what Pixi is: it takes
 * rectangles in screen pixels and returns positions in screen pixels.
 */

export interface CaptionRect {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

/** A block wanting a name, and what that name measures once rendered. */
export interface CaptionRequest {
  /** The ground the block stands on, in screen pixels. */
  readonly block: CaptionRect;
  /** What the caption measures on screen, in pixels. */
  readonly width: number;
  readonly height: number;
  /**
   * Hug a corner of the block rather than centring on a side.
   *
   * A zone name belongs at the top-left of the cell it names, the way a caption
   * belongs under the machines it names — the same search, a different first
   * choice. Without it a zone name would centre itself over a hundred metres of
   * factory and stop reading as a corner mark.
   */
  readonly corner?: boolean | undefined;
}

export interface CaptionPlacement {
  /** Centre of the caption on screen, in pixels. */
  readonly x: number;
  readonly y: number;
  /**
   * The hairline joining a caption that had to move out to the block it names,
   * as `[x1, y1, x2, y2]` — block edge first. Null when the caption sits
   * against its own block and needs no explaining.
   */
  readonly leader: readonly [number, number, number, number] | null;
}

export interface CaptionOptions {
  /**
   * How far out from the block each ring of positions sits, in pixels.
   *
   * The first ring touches. Past it a caption gets a leader line, so the gaps
   * widen: a leader two pixels long is a smudge on the type, not an
   * explanation.
   */
  readonly rings: readonly number[];
  /** Clear air kept around a caption, so two that merely miss still read apart. */
  readonly pad: number;
  /** A leader shorter than this is dropped; the caption speaks for itself. */
  readonly minLeader: number;
  /** Clear air kept inside the edges of the surface. */
  readonly margin: number;
}

export const CAPTION_DEFAULTS: CaptionOptions = {
  rings: [4, 13, 26],
  pad: 3,
  minLeader: 6,
  margin: 2,
};

const overlaps = (a: CaptionRect, b: CaptionRect): boolean =>
  a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

const intersectsView = (rect: CaptionRect, width: number, height: number): boolean =>
  rect.right > 0 && rect.left < width && rect.bottom > 0 && rect.top < height;

/**
 * Where the line from the centre of a box towards a point leaves the box.
 *
 * A leader starting at the block's centre would be drawn straight through the
 * machines it is meant to point at, so it starts at the edge instead. The same
 * sum run from the caption's centre stops the line short of the type.
 */
function edgeToward(
  cx: number,
  cy: number,
  halfW: number,
  halfH: number,
  dx: number,
  dy: number,
): [number, number] {
  const tx = dx === 0 ? Infinity : halfW / Math.abs(dx);
  const ty = dy === 0 ? Infinity : halfH / Math.abs(dy);
  const t = Math.min(tx, ty);
  if (!Number.isFinite(t)) return [cx, cy];
  return [cx + dx * t, cy + dy * t];
}

/** Every position a caption of this size would accept, nearest ring first. */
function candidatesFor(
  request: CaptionRequest,
  rings: readonly number[],
): { x: number; y: number; ring: number }[] {
  const { block, width, height } = request;
  const cx = (block.left + block.right) / 2;
  const cy = (block.top + block.bottom) / 2;
  const hw = (block.right - block.left) / 2;
  const hh = (block.bottom - block.top) / 2;
  const halfW = width / 2;
  const halfH = height / 2;

  const spots: { x: number; y: number; ring: number }[] = [];
  if (request.corner) {
    // Top-left first, which is where a cell has always been named. The rest
    // walk round the box, so a crowded corner costs the name its corner rather
    // than costing the cell its name.
    for (const [ring, gap] of rings.entries()) {
      spots.push(
        { x: block.left + halfW, y: block.top - gap - halfH, ring },
        { x: block.right - halfW, y: block.top - gap - halfH, ring },
        { x: block.left + halfW, y: block.bottom + gap + halfH, ring },
        { x: block.right - halfW, y: block.bottom + gap + halfH, ring },
        { x: block.left - gap - halfW, y: block.top + halfH, ring },
        { x: block.right + gap + halfW, y: block.top + halfH, ring },
      );
    }
    return spots;
  }
  for (const [ring, gap] of rings.entries()) {
    // Below first: a name under the thing it names is what a reader expects,
    // and it is where this map has always put them. The rest are fallbacks, in
    // the order they cost the reader least.
    spots.push(
      { x: cx, y: cy + hh + gap + halfH, ring },
      { x: cx, y: cy - hh - gap - halfH, ring },
      { x: cx + hw + gap + halfW, y: cy, ring },
      { x: cx - hw - gap - halfW, y: cy, ring },
    );
    // Diagonals only past the first ring: touching a corner reads as crooked,
    // a step away reads as deliberate.
    if (ring === 0) continue;
    const out = gap * 0.72;
    for (const sx of [1, -1]) {
      for (const sy of [1, -1]) {
        spots.push({
          x: cx + sx * (hw + out + halfW),
          y: cy + sy * (hh + out + halfH),
          ring,
        });
      }
    }
  }
  return spots;
}

/**
 * Place as many captions as the screen has room for, in the order given.
 *
 * The order is the priority: whatever comes first gets its pick of the space,
 * so the caller sorts by what is worth keeping — a block standing for four
 * machines outranks a lone constructor. A caption with nowhere to go is
 * dropped rather than stacked; hovering still names the machine, and zooming
 * in makes the room that was missing.
 *
 * `taken` is what is already spoken for before any block is considered — the
 * zone captions, which name a whole cell and would be the worse loss. The
 * blocks themselves are added to it here, so a caption never lands on machines,
 * its own included.
 */
export function placeCaptions(
  requests: readonly CaptionRequest[],
  taken: readonly CaptionRect[],
  view: { readonly width: number; readonly height: number },
  options: CaptionOptions = CAPTION_DEFAULTS,
): (CaptionPlacement | null)[] {
  const { rings, pad, minLeader, margin } = options;
  const claimed: CaptionRect[] = [...taken, ...requests.map((request) => request.block)];
  const placements: (CaptionPlacement | null)[] = [];

  for (const request of requests) {
    // A block nobody can see must not hold space against one in view.
    if (!intersectsView(request.block, view.width, view.height)) {
      placements.push(null);
      continue;
    }

    const halfW = request.width / 2;
    const halfH = request.height / 2;
    let placed: CaptionPlacement | null = null;

    for (const spot of candidatesFor(request, rings)) {
      const rect: CaptionRect = {
        left: spot.x - halfW - pad,
        right: spot.x + halfW + pad,
        top: spot.y - halfH - pad,
        bottom: spot.y + halfH + pad,
      };
      if (rect.left < margin || rect.right > view.width - margin) continue;
      if (rect.top < margin || rect.bottom > view.height - margin) continue;
      if (claimed.some((other) => overlaps(rect, other))) continue;

      claimed.push(rect);
      placed = { x: spot.x, y: spot.y, leader: leaderFor(request, spot, minLeader) };
      break;
    }

    placements.push(placed);
  }

  return placements;
}

function leaderFor(
  request: CaptionRequest,
  spot: { x: number; y: number; ring: number },
  minLeader: number,
): readonly [number, number, number, number] | null {
  if (spot.ring === 0) return null;
  const { block } = request;
  const cx = (block.left + block.right) / 2;
  const cy = (block.top + block.bottom) / 2;
  const dx = spot.x - cx;
  const dy = spot.y - cy;
  if (dx === 0 && dy === 0) return null;

  const [x1, y1] = edgeToward(
    cx,
    cy,
    (block.right - block.left) / 2,
    (block.bottom - block.top) / 2,
    dx,
    dy,
  );
  const [x2, y2] = edgeToward(spot.x, spot.y, request.width / 2, request.height / 2, -dx, -dy);
  return Math.hypot(x2 - x1, y2 - y1) < minLeader ? null : [x1, y1, x2, y2];
}
