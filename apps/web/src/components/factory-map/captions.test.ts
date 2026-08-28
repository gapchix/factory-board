import { describe, expect, it } from 'vitest';
import { placeCaptions, type CaptionRect, type CaptionRequest } from './captions';

/**
 * A block twenty pixels square at (x, y), wanting a name of the given size.
 *
 * Sizes are in screen pixels because that is the only unit this file has: the
 * caller has already projected the world through the camera by the time it
 * asks.
 */
const at = (x: number, y: number, width = 60, height = 12, size = 20): CaptionRequest => ({
  block: { left: x - size / 2, right: x + size / 2, top: y - size / 2, bottom: y + size / 2 },
  width,
  height,
});

const view = { width: 800, height: 600 };

const box = (left: number, top: number, width: number, height: number): CaptionRect => ({
  left,
  right: left + width,
  top,
  bottom: top + height,
});

describe('placeCaptions', () => {
  it('puts a name below its block when nothing is in the way', () => {
    // Below is where this map has always put them, and where a reader looks.
    const [placement] = placeCaptions([at(400, 300)], [], view);

    expect(placement?.x).toBeCloseTo(400);
    expect(placement?.y).toBeGreaterThan(310);
    expect(placement?.leader).toBeNull();
  });

  it('moves a caption rather than dropping it', () => {
    // This is the whole point. The space below is spoken for, and the old fixed
    // drop had no second answer: the name was simply not drawn.
    const request = at(400, 300);
    const blocked = box(340, 306, 120, 30);

    const [placement] = placeCaptions([request], [blocked], view);

    expect(placement).not.toBeNull();
    expect(placement!.y).toBeLessThan(300);
  });

  it('never lets two captions overlap', () => {
    // Two blocks close enough that both names want the same strip of screen.
    const placements = placeCaptions([at(400, 300), at(400, 340)], [], view);

    expect(placements.every((placement) => placement !== null)).toBe(true);
    const [first, second] = placements;
    const apart = Math.abs(first!.x - second!.x) > 60 || Math.abs(first!.y - second!.y) > 12;
    expect(apart).toBe(true);
  });

  it('never puts a caption on the machines of another block', () => {
    // A caption crossing someone else's machines names neither. The blocks are
    // claimed before any caption is placed, so this holds without the caller
    // having to say so.
    const neighbour = at(400, 330);
    const [placement] = placeCaptions([at(400, 300), neighbour], [], view);

    const rect = {
      left: placement!.x - 30,
      right: placement!.x + 30,
      top: placement!.y - 6,
      bottom: placement!.y + 6,
    };
    const overlapsNeighbour =
      rect.left < neighbour.block.right &&
      rect.right > neighbour.block.left &&
      rect.top < neighbour.block.bottom &&
      rect.bottom > neighbour.block.top;
    expect(overlapsNeighbour).toBe(false);
  });

  it('draws a leader from the block edge, not its centre', () => {
    // A leader starting at the centre is drawn through the machines it points
    // at, which is worse than no leader.
    const request = at(400, 300);
    // Four thin bands, one against each side of the block: every touching
    // position is spoken for and the next ring out is not, which is exactly
    // when a caption needs explaining.
    const walls = [
      box(340, 310, 120, 8),
      box(340, 282, 120, 8),
      box(410, 290, 8, 20),
      box(382, 290, 8, 20),
    ];

    const [placement] = placeCaptions([request], walls, view);

    expect(placement?.leader).not.toBeNull();
    const [x1, y1, x2, y2] = placement!.leader!;
    // It starts on the block's southern edge, not at its centre.
    expect(y1).toBeCloseTo(310);
    expect(x1).toBeCloseTo(400);
    // And stops at the type rather than running under it.
    expect(x2).toBeCloseTo(400);
    expect(y2).toBeLessThan(placement!.y);
    expect(y2).toBeGreaterThan(y1);
  });

  it('gives up rather than stacking names', () => {
    // Hover still says what a machine is, and zooming in makes the room. A
    // second name in the same six pixels says nothing at all.
    const wall = box(0, 0, view.width, view.height);

    const [placement] = placeCaptions([at(400, 300)], [wall], view);

    expect(placement).toBeNull();
  });

  it('keeps a caption inside the surface', () => {
    // Half a name off the edge is not a name.
    const [placement] = placeCaptions([at(4, 300)], [], view);

    if (placement) expect(placement.x - 30).toBeGreaterThanOrEqual(0);
  });

  it('lets a block nobody can see hold no space at all', () => {
    // The camera has moved past it. Its name is not drawn, and — more to the
    // point — it must not deny the space to a block that is in view.
    const offscreen = at(-4000, -4000);
    const visible = at(400, 300);

    const placements = placeCaptions([offscreen, visible], [], view);

    expect(placements[0]).toBeNull();
    expect(placements[1]).not.toBeNull();
  });

  it('names a cell from its top-left corner', () => {
    // A zone box is a hundred metres of factory. Centring its name over that
    // stops it reading as a corner mark and starts it reading as a label for
    // whatever machine it happens to land on.
    const zone: CaptionRequest = {
      block: box(200, 200, 300, 160),
      width: 70,
      height: 12,
      corner: true,
    };

    const [placement] = placeCaptions([zone], [], view);

    expect(placement!.x - 35).toBeCloseTo(200);
    expect(placement!.y + 6).toBeLessThan(200);
  });

  it('walks a cell name round its box rather than losing it', () => {
    // On the reference save a building stood on the IRON INGOT corner and the
    // name was drawn straight through it.
    const zone: CaptionRequest = {
      block: box(200, 200, 300, 160),
      width: 70,
      height: 12,
      corner: true,
    };
    const onTheCorner = box(190, 176, 120, 30);

    const [placement] = placeCaptions([zone], [onTheCorner], view);

    expect(placement).not.toBeNull();
    const clear =
      placement!.x - 35 > onTheCorner.right ||
      placement!.x + 35 < onTheCorner.left ||
      placement!.y - 6 > onTheCorner.bottom ||
      placement!.y + 6 < onTheCorner.top;
    expect(clear).toBe(true);
  });

  it('gives the first block asked its pick of the space', () => {
    // The caller sorts biggest-first, so this is how "the block standing for
    // four machines keeps the strip of screen" is actually enforced.
    // Two blocks side by side, near enough that only one of the two names
    // fits in the strip below them.
    const forward = placeCaptions([at(400, 300), at(440, 300)], [], view);
    const reversed = placeCaptions([at(440, 300), at(400, 300)], [], view);

    expect(forward[0]!.y).toBeGreaterThan(300);
    expect(forward[1]!.y).toBeLessThan(300);
    expect(reversed[0]!.y).toBeGreaterThan(300);
    expect(reversed[1]!.y).toBeLessThan(300);
  });
});
