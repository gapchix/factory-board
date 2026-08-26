import { describe, expect, it } from 'vitest';
import { joinRuns, sampleAlong, type Polyline } from './path.js';

const HALF_PI = Math.PI / 2;

describe('sampleAlong', () => {
  it('needs two distinct points', () => {
    expect(sampleAlong([], 10)).toEqual([]);
    expect(sampleAlong([[0, 0]], 10)).toEqual([]);
    expect(
      sampleAlong(
        [
          [0, 0],
          [0, 0],
        ],
        10,
      ),
    ).toEqual([]);
  });

  it('spaces markers evenly and insets them by half a gap', () => {
    const markers = sampleAlong(
      [
        [0, 0],
        [100, 0],
      ],
      50,
    );
    expect(markers.map((m) => m.x)).toEqual([25, 75]);
    expect(markers.every((m) => m.y === 0 && m.angle === 0)).toBe(true);
  });

  it('gives a short run one marker rather than none', () => {
    const markers = sampleAlong(
      [
        [0, 0],
        [10, 0],
      ],
      50,
    );
    expect(markers).toHaveLength(1);
    expect(markers[0]?.x).toBe(5);
  });

  it('drops runs below the minimum length', () => {
    const line = [
      [0, 0],
      [10, 0],
    ] as const;
    expect(sampleAlong(line, 50, { minLength: 20 })).toEqual([]);
    expect(sampleAlong(line, 50, { minLength: 10 })).toHaveLength(1);
  });

  /* Spacing is measured along the route, so a corner does not attract markers. */
  it('measures distance along the polyline, not per segment', () => {
    const markers = sampleAlong(
      [
        [0, 0],
        [100, 0],
        [100, 100],
      ],
      100,
    );
    expect(markers).toHaveLength(2);
    expect(markers[0]).toEqual({ x: 50, y: 0, angle: 0 });
    expect(markers[1]?.x).toBe(100);
    expect(markers[1]?.y).toBe(50);
    expect(markers[1]?.angle).toBeCloseTo(HALF_PI);
  });

  it('points the other way when the polyline runs the other way', () => {
    const markers = sampleAlong(
      [
        [100, 0],
        [0, 0],
      ],
      50,
    );
    expect(markers.map((m) => m.x)).toEqual([75, 25]);
    expect(markers.every((m) => Math.abs(m.angle) === Math.PI)).toBe(true);
  });

  it('ignores repeated points', () => {
    const markers = sampleAlong(
      [
        [0, 0],
        [0, 0],
        [100, 0],
        [100, 0],
      ],
      50,
    );
    expect(markers.map((m) => m.x)).toEqual([25, 75]);
  });

  it('rejects a spacing of zero rather than looping forever', () => {
    expect(
      sampleAlong(
        [
          [0, 0],
          [10, 0],
        ],
        0,
      ),
    ).toEqual([]);
  });
});

const run = (...points: [number, number][]): Polyline => points;

describe('joinRuns', () => {
  it('joins a chain of runs into one, without doubling the joints', () => {
    const joined = joinRuns([run([0, 0], [10, 0]), run([10, 0], [20, 0]), run([20, 0], [20, 10])]);
    expect(joined).toEqual([
      [
        [0, 0],
        [10, 0],
        [20, 0],
        [20, 10],
      ],
    ]);
  });

  it('joins a chain given in any order', () => {
    const joined = joinRuns([run([10, 0], [20, 0]), run([0, 0], [10, 0])]);
    expect(joined).toHaveLength(1);
    expect(joined[0]?.[0]).toEqual([0, 0]);
  });

  // One belt in and two out is a splitter, and it stays three runs: welding an
  // arbitrary two of them together would draw a route that does not exist.
  it('leaves a split alone', () => {
    const joined = joinRuns([
      run([0, 0], [10, 0]),
      run([10, 0], [20, 10]),
      run([10, 0], [20, -10]),
    ]);
    expect(joined).toHaveLength(3);
  });

  it('leaves a merge alone', () => {
    const joined = joinRuns([run([0, 10], [10, 0]), run([0, -10], [10, 0]), run([10, 0], [20, 0])]);
    expect(joined).toHaveLength(3);
  });

  // Point order is the direction items travel, so a run is never turned round
  // to make a longer one.
  it('never reverses a run to make a join', () => {
    const joined = joinRuns([run([0, 0], [10, 0]), run([20, 0], [10, 0])]);
    expect(joined).toHaveLength(2);
  });

  it('closes a joint that rounding left a metre apart', () => {
    expect(joinRuns([run([0, 0], [10, 0]), run([11, 0], [20, 0])])).toHaveLength(1);
    expect(joinRuns([run([0, 0], [10, 0]), run([13, 0], [20, 0])])).toHaveLength(2);
  });

  it('passes a lone run through and drops a degenerate one', () => {
    expect(joinRuns([run([0, 0], [10, 0])])).toEqual([
      [
        [0, 0],
        [10, 0],
      ],
    ]);
    expect(joinRuns([[[0, 0]]])).toEqual([]);
    expect(joinRuns([])).toEqual([]);
  });

  it('does not spin forever on a loop', () => {
    const joined = joinRuns([run([0, 0], [10, 0]), run([10, 0], [10, 10]), run([10, 10], [0, 0])]);
    expect(joined).toHaveLength(1);
    expect(joined[0]).toHaveLength(4);
  });
});
