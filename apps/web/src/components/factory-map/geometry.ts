/**
 * Where a building sits, and where the camera looks.
 *
 * Kept apart from the drawing so it can be tested without a GPU — and because
 * a sign error in here would turn every machine on the map the wrong way round,
 * which is exactly the sort of thing that looks plausible until you compare it
 * with the game.
 */

export interface Placed {
  /** Centre, in world metres. */
  readonly x: number;
  readonly y: number;
  /** Footprint along its own axes, in metres, before rotation. */
  readonly w: number;
  readonly l: number;
  /** Degrees clockwise from north, as the save records it. */
  readonly facing: number;
}

export interface Camera {
  /** World metres at the centre of the viewport. */
  x: number;
  y: number;
  /** Pixels per metre. */
  scale: number;
}

export interface Extent {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

/**
 * The four corners of a building, in world metres.
 *
 * World and screen agree about direction — +x is east and +y is south on both —
 * so the yaw out of the save is a plain rotation with no flip in it.
 */
export function cornersOf(placed: Placed): number[] {
  const angle = (placed.facing * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const hw = placed.w / 2;
  const hl = placed.l / 2;
  const corner = (dx: number, dy: number): [number, number] => [
    placed.x + dx * cos - dy * sin,
    placed.y + dx * sin + dy * cos,
  ];
  return [corner(-hw, -hl), corner(hw, -hl), corner(hw, hl), corner(-hw, hl)].flat();
}

/** Is this world point inside the building's own rectangle? */
export function containsPoint(placed: Placed, x: number, y: number): boolean {
  const angle = (-placed.facing * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = x - placed.x;
  const dy = y - placed.y;
  const localX = dx * cos - dy * sin;
  const localY = dx * sin + dy * cos;
  return Math.abs(localX) <= placed.w / 2 && Math.abs(localY) <= placed.l / 2;
}

/** A round number of metres that lands near a hundred pixels on screen. */
export function niceStep(scale: number): number {
  const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];
  const target = 110 / scale;
  return steps.find((step) => step >= target) ?? steps[steps.length - 1]!;
}

/** Where the camera should sit to hold these bounds, with room to breathe. */
export function fitCamera(bounds: Extent, width: number, height: number, pad = 0.88): Camera {
  const worldW = Math.max(1, bounds.maxX - bounds.minX);
  const worldH = Math.max(1, bounds.maxY - bounds.minY);
  return {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2,
    scale: Math.min(width / worldW, height / worldH) * pad,
  };
}
