import { describe, expect, it } from 'vitest';
import { containsPoint, cornersOf, fitCamera, niceStep, type Placed } from './geometry';

/** A Constructor: 8 m across, 10 m deep, facing north. */
const constructor_ = (facing: number): Placed => ({ x: 0, y: 0, w: 8, l: 10, facing });

const round = (values: number[]) => values.map((value) => Math.round(value * 100) / 100);

describe('cornersOf', () => {
  it('lays an unrotated building out around its own centre', () => {
    expect(round(cornersOf(constructor_(0)))).toEqual([-4, -5, 4, -5, 4, 5, -4, 5]);
  });

  // A quarter turn swaps which way the long side runs. Getting the sign wrong
  // here turns every machine on the map through ninety degrees and still looks
  // plausible until it is held next to the game.
  it('turns a building a quarter turn clockwise', () => {
    expect(round(cornersOf(constructor_(90)))).toEqual([5, -4, 5, 4, -5, 4, -5, -4]);
  });

  it('comes back to where it started after a full turn', () => {
    expect(round(cornersOf(constructor_(360)))).toEqual(round(cornersOf(constructor_(0))));
  });

  it('keeps its size whatever angle it is placed at', () => {
    const corners = cornersOf({ x: 10, y: -4, w: 8, l: 10, facing: 37 });
    const side = (a: number, b: number) =>
      Math.hypot(corners[a * 2]! - corners[b * 2]!, corners[a * 2 + 1]! - corners[b * 2 + 1]!);
    expect(side(0, 1)).toBeCloseTo(8, 6);
    expect(side(1, 2)).toBeCloseTo(10, 6);
  });
});

describe('containsPoint', () => {
  it('knows its own rectangle, rotated', () => {
    const turned = constructor_(90);
    // 4.5 m east is inside a building turned to lie east–west, and outside one
    // that is not.
    expect(containsPoint(turned, 4.5, 0)).toBe(true);
    expect(containsPoint(constructor_(0), 4.5, 0)).toBe(false);
    expect(containsPoint(turned, 0, 4.5)).toBe(false);
    expect(containsPoint(constructor_(0), 0, 4.5)).toBe(true);
  });

  it('holds the edges and refuses just past them', () => {
    const placed = constructor_(0);
    expect(containsPoint(placed, 4, 5)).toBe(true);
    expect(containsPoint(placed, 4.01, 5)).toBe(false);
  });

  it('follows the building away from the origin', () => {
    const placed: Placed = { x: -540, y: 2320, w: 8, l: 10, facing: 0 };
    expect(containsPoint(placed, -540, 2320)).toBe(true);
    expect(containsPoint(placed, -540, 2320 + 6)).toBe(false);
  });
});

describe('fitCamera', () => {
  it('centres on the content and scales to whichever side runs out first', () => {
    const camera = fitCamera({ minX: 0, minY: 0, maxX: 200, maxY: 100 }, 800, 800, 1);
    expect(camera.x).toBe(100);
    expect(camera.y).toBe(50);
    expect(camera.scale).toBe(4);
  });

  it('leaves room around the edge by default', () => {
    expect(fitCamera({ minX: 0, minY: 0, maxX: 100, maxY: 100 }, 100, 100).scale).toBeCloseTo(0.88);
  });
});

describe('niceStep', () => {
  it('picks a round number of metres near a hundred pixels', () => {
    expect(niceStep(1)).toBe(200);
    expect(niceStep(10)).toBe(20);
    expect(niceStep(0.05)).toBe(5000);
  });
});
