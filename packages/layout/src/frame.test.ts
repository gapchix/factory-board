import { describe, expect, it } from 'vitest';
import { boundsGap, frameContent, unionBounds } from './frame.js';

const p = (x: number, y: number) => ({ x, y });
const at = (item: { x: number; y: number }) => item;

/** A dense little factory around the origin. */
const factory = [p(0, 0), p(10, 0), p(20, 10), p(0, 20), p(15, 25), p(30, 5)];
const shifted = (dx: number) => factory.map((point) => p(point.x + dx, point.y));
/** Two buildings on their own, far enough out to form their own group. */
const outpost = [p(950, 0), p(960, 10)];

describe('frameContent', () => {
  it('frames nothing when there is nothing', () => {
    const result = frameContent([], at);
    expect(result.bounds).toBeNull();
    expect(result.inside).toEqual([]);
    expect(result.outside).toEqual([]);
  });

  it('frames a single point', () => {
    const result = frameContent([p(5, 7)], at);
    expect(result.bounds).toEqual({ minX: 5, minY: 7, maxX: 5, maxY: 7 });
    expect(result.outside).toEqual([]);
  });

  it('keeps one cluster whole', () => {
    const result = frameContent(factory, at);
    expect(result.outside).toEqual([]);
    expect(result.bounds).toEqual({ minX: 0, minY: 0, maxX: 30, maxY: 25 });
  });

  /*
   * The case this was written for. The map used to frame the *zones*, and a coal
   * generator a few metres past the last one fell outside and was drawn nowhere.
   */
  it('reaches past its own edge for a straggler nearby', () => {
    const stragglers = [p(120, 20), p(130, 30)];
    const result = frameContent([...factory, ...stragglers], at);
    expect(result.outside).toEqual([]);
    expect(result.bounds).toEqual({ minX: 0, minY: 0, maxX: 130, maxY: 30 });
  });

  it('leaves a genuinely distant building out, and says so', () => {
    const remote = p(-661, 2969);
    const result = frameContent([...factory, remote], at);
    expect(result.outside).toEqual([remote]);
    expect(result.inside).toEqual(factory);
    expect(result.bounds).toEqual({ minX: 0, minY: 0, maxX: 30, maxY: 25 });
  });

  it('absorbs a satellite through the group between it and the factory', () => {
    // Neither hop is within reach of the factory alone, but the frame grows as
    // it takes the first, which brings the second in.
    const near = [p(130, 0), p(140, 10)];
    const far = [p(260, 0), p(270, 10)];
    const result = frameContent([...factory, ...near, ...far], at);
    expect(result.outside).toEqual([]);
    expect(result.bounds?.maxX).toBe(270);
  });

  it('keeps both halves of a factory built in two places', () => {
    const halves = [...factory, ...shifted(800)];
    const result = frameContent(halves, at);
    expect(result.outside).toEqual([]);
    expect(result.bounds).toEqual({ minX: 0, minY: 0, maxX: 830, maxY: 25 });
  });

  it('reaches further for a bigger base', () => {
    const small = frameContent([...factory, ...outpost], at);
    expect(small.outside).toEqual(outpost);

    // The same two buildings, against a base spread over 830 m: now in reach.
    const large = frameContent([...factory, ...shifted(800), ...outpost], at);
    expect(large.outside).toEqual([]);
  });

  it('does not let a small outpost set the extent of a large factory', () => {
    // 40 machines in a block: a five-building outpost is not a fifth of that, so
    // it has to be near enough to be absorbed, and it is not.
    const big = Array.from({ length: 40 }, (_, i) => p((i % 8) * 10, Math.floor(i / 8) * 10));
    const remote = Array.from({ length: 5 }, (_, i) => p(2000 + i * 10, 0));
    const result = frameContent([...big, ...remote], at);
    expect(result.outside).toEqual(remote);
    expect(result.bounds?.maxX).toBe(70);
  });

  it('returns items in input order on both sides', () => {
    const remote = p(-661, 2969);
    const result = frameContent([factory[0]!, remote, factory[1]!], at);
    expect(result.inside).toEqual([factory[0], factory[1]]);
    expect(result.outside).toEqual([remote]);
  });

  it('honours an explicit reach', () => {
    const result = frameContent([...factory, ...outpost], at, { minReachM: 1000 });
    expect(result.outside).toEqual([]);
  });
});

describe('boundsGap', () => {
  const box = { minX: 0, minY: 0, maxX: 10, maxY: 10 };

  it('is zero for boxes that touch or overlap', () => {
    expect(boundsGap(box, { minX: 5, minY: 5, maxX: 15, maxY: 15 })).toBe(0);
    expect(boundsGap(box, { minX: 10, minY: 0, maxX: 20, maxY: 10 })).toBe(0);
  });

  it('measures the straight-line gap, not the centre distance', () => {
    expect(boundsGap(box, { minX: 30, minY: 0, maxX: 40, maxY: 10 })).toBe(20);
    expect(boundsGap(box, { minX: 13, minY: 14, maxX: 20, maxY: 20 })).toBeCloseTo(5);
  });
});

describe('unionBounds', () => {
  it('covers both boxes', () => {
    expect(
      unionBounds({ minX: 0, minY: 0, maxX: 1, maxY: 1 }, { minX: -5, minY: 2, maxX: 3, maxY: 4 }),
    ).toEqual({ minX: -5, minY: 0, maxX: 3, maxY: 4 });
  });
});
