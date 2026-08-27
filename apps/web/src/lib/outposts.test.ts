import { describe, expect, it } from 'vitest';
import { bearingOf, compassOf, liftOutposts } from './outposts';

interface Point {
  readonly x: number;
  readonly y: number;
  readonly id: string;
}

const at = (x: number, y: number, id = `${x},${y}`): Point => ({ x, y, id });
const where = (point: Point) => ({ x: point.x, y: point.y });

/** A dense block of machines, the way a factory cell actually sits. */
const cell = (originX: number, originY: number, count: number, tag: string): Point[] =>
  Array.from({ length: count }, (_, i) =>
    at(originX + (i % 4) * 12, originY + Math.floor(i / 4) * 12, `${tag}${i}`),
  );

describe('liftOutposts', () => {
  it('keeps a base that is all one piece whole', () => {
    const lifted = liftOutposts(cell(0, 0, 12, 'a'), where);

    expect(lifted.outposts).toEqual([]);
    expect(lifted.inside).toHaveLength(12);
  });

  it('lifts a wing that costs the factory too much of the frame', () => {
    // 36 machines across 36 m, and six more 400 m east. Framing both makes the
    // map ten times wider than the factory to reach a sixth of the buildings.
    const factory = cell(0, 0, 36, 'f');
    const wing = cell(400, 0, 6, 'w');

    const lifted = liftOutposts([...factory, ...wing], where);

    expect(lifted.outposts).toHaveLength(1);
    expect(lifted.outposts[0]?.members).toHaveLength(6);
    expect(lifted.inside).toHaveLength(36);
    expect(lifted.core?.maxX).toBe(36);
  });

  it('keeps a wing the factory can afford', () => {
    // Same six machines, but close enough that the frame barely grows: the
    // factory keeps well over its share, so there is nothing to gain by
    // exiling them.
    const lifted = liftOutposts([...cell(0, 0, 36, 'f'), ...cell(90, 0, 6, 'w')], where);

    expect(lifted.outposts).toEqual([]);
    expect(lifted.inside).toHaveLength(42);
  });

  it('does not let an unaffordable wing hide a cheaper one behind it', () => {
    // The near wing is the one that breaks the budget, because it sits at right
    // angles and stretches the short side. Testing only the nearest and giving
    // up would strand the far one, which the frame can actually afford.
    const factory = cell(0, 0, 36, 'f');
    const expensive = cell(0, 900, 4, 'x');
    const cheap = cell(60, 0, 4, 'c');

    const lifted = liftOutposts([...factory, ...expensive, ...cheap], where);

    expect(lifted.outposts).toHaveLength(1);
    expect(lifted.outposts[0]?.members.map((m) => m.id)).toEqual(
      expect.arrayContaining(['x0', 'x1', 'x2', 'x3']),
    );
    expect(lifted.inside.map((m) => m.id)).toEqual(expect.arrayContaining(['c0']));
  });

  it('reports how far each outpost is and which way', () => {
    // Due south: the world's +y runs south, the same as the screen's.
    const lifted = liftOutposts([...cell(0, 0, 36, 'f'), at(18, 640, 'coal')], where);

    // Measured from the centre of the frame, not its edge: the cell is 96 m
    // deep, so its centre is at y = 48 and the miner is 592 m away.
    const [outpost] = lifted.outposts;
    expect(outpost?.compass).toBe('S');
    expect(outpost?.distanceM).toBeCloseTo(592, 0);
  });

  it('orders outposts nearest first', () => {
    const lifted = liftOutposts(
      [...cell(0, 0, 36, 'f'), at(18, 900, 'far'), at(18, -400, 'near')],
      where,
    );

    expect(lifted.outposts.map((o) => o.members[0]?.id)).toEqual(['near', 'far']);
  });

  it('never lifts a half of the factory, however far it stands', () => {
    // A base built in two halves 900 m apart. Both are expensive by span, and
    // exiling either would put half of what you built in a margin note.
    const lifted = liftOutposts([...cell(0, 0, 36, 'a'), ...cell(900, 0, 30, 'b')], where);

    expect(lifted.outposts).toEqual([]);
    expect(lifted.inside).toHaveLength(66);
  });

  it('leaves nothing behind: inside plus outposts is everything', () => {
    const all = [...cell(0, 0, 36, 'f'), ...cell(400, 0, 6, 'w'), at(18, 900, 'coal')];

    const lifted = liftOutposts(all, where);

    const seen = [...lifted.inside, ...lifted.outposts.flatMap((o) => o.members)];
    expect(seen).toHaveLength(all.length);
    expect(new Set(seen.map((m) => m.id)).size).toBe(all.length);
  });
});

describe('bearingOf and compassOf', () => {
  it('measures clockwise from north, with +y running south', () => {
    const origin = { x: 0, y: 0 };
    expect(bearingOf(origin, { x: 0, y: -100 })).toBeCloseTo(0);
    expect(bearingOf(origin, { x: 100, y: 0 })).toBeCloseTo(90);
    expect(bearingOf(origin, { x: 0, y: 100 })).toBeCloseTo(180);
    expect(bearingOf(origin, { x: -100, y: 0 })).toBeCloseTo(270);
  });

  it('names the nearest point of the rose, and wraps to north', () => {
    expect(compassOf(0)).toBe('N');
    expect(compassOf(44)).toBe('NE');
    expect(compassOf(180)).toBe('S');
    expect(compassOf(350)).toBe('N');
  });
});
