import { describe, expect, it } from 'vitest';
import {
  distanceLabel,
  signpostAt,
  signpostsFor,
  SIGNPOST_DEFAULTS,
  type SignpostTarget,
  type SignpostView,
} from './signposts';

/** A place, given as a box around a point. */
const at = (id: string, x: number, y: number, size = 20): SignpostTarget => ({
  id,
  label: id,
  minX: x - size / 2,
  maxX: x + size / 2,
  minY: y - size / 2,
  maxY: y + size / 2,
  uptime: 0.5,
});

/** A 800 x 600 surface, one pixel per metre, looking at the origin. */
const view = (overrides: Partial<SignpostView> = {}): SignpostView => ({
  x: 0,
  y: 0,
  scale: 1,
  width: 800,
  height: 600,
  ...overrides,
});

describe('signpostsFor', () => {
  it('says nothing about a place that is on screen', () => {
    expect(signpostsFor([at('home', 0, 0)], view())).toEqual([]);
  });

  it('says nothing about a place only half on screen', () => {
    // Straddling the right edge: the reader can see where it went.
    expect(signpostsFor([at('edge', 400, 0, 60)], view())).toEqual([]);
  });

  it('points at a place due west from the left edge', () => {
    const [chip] = signpostsFor([at('water', -900, 0)], view());
    expect(chip?.id).toBe('water');
    expect(chip?.edge).toBe('left');
    expect(chip?.x).toBe(SIGNPOST_DEFAULTS.margin);
    // Level with the middle of the view, because it is due west of it.
    expect(chip!.y + SIGNPOST_DEFAULTS.chipHeight / 2).toBeCloseTo(300, 5);
    expect(chip?.distanceM).toBeCloseTo(900, 5);
  });

  it('points at a place due south from the bottom edge', () => {
    const [chip] = signpostsFor([at('coal', 0, 700)], view());
    expect(chip?.edge).toBe('bottom');
    expect(chip?.y).toBe(600 - SIGNPOST_DEFAULTS.margin - SIGNPOST_DEFAULTS.chipHeight);
    expect(chip!.x + SIGNPOST_DEFAULTS.chipWidth / 2).toBeCloseTo(400, 5);
  });

  it('measures distance in metres, not in pixels', () => {
    // Zoomed in eight times, the place is eight times further away in pixels
    // and exactly as far away in the world.
    const near = signpostsFor([at('mine', 0, 700)], view())[0];
    const far = signpostsFor([at('mine', 0, 700)], view({ scale: 8 }))[0];
    expect(near?.distanceM).toBeCloseTo(700, 5);
    expect(far?.distanceM).toBeCloseTo(700, 5);
  });

  it('keeps a chip clear of the one beside it', () => {
    // Two places in almost the same direction want almost the same pixel.
    const chips = signpostsFor([at('a', -900, 0), at('b', -900, 4)], view());
    expect(chips).toHaveLength(2);
    const [first, second] = [...chips].sort((x, y) => x.y - y.y);
    expect(second!.y - first!.y).toBeGreaterThanOrEqual(
      SIGNPOST_DEFAULTS.chipHeight + SIGNPOST_DEFAULTS.gap,
    );
  });

  it('keeps every chip inside the surface', () => {
    const crowd = Array.from({ length: 4 }, (_, i) => at(`z${i}`, -900, i * 3));
    for (const chip of signpostsFor(crowd, view())) {
      expect(chip.y).toBeGreaterThanOrEqual(SIGNPOST_DEFAULTS.margin);
      expect(chip.y + SIGNPOST_DEFAULTS.chipHeight).toBeLessThanOrEqual(
        600 - SIGNPOST_DEFAULTS.margin,
      );
    }
  });

  it('counts what it cannot fit rather than dropping it silently', () => {
    const crowd = Array.from({ length: 7 }, (_, i) => at(`z${i}`, -900 - i * 10, i * 3));
    const chips = signpostsFor(crowd, view());
    const overflow = chips.filter((chip) => chip.id === null);
    expect(chips.filter((chip) => chip.id !== null)).toHaveLength(SIGNPOST_DEFAULTS.maxPerEdge);
    expect(overflow).toHaveLength(1);
    expect(overflow[0]?.more).toBe(3);
    expect(overflow[0]?.label).toBe('+3 more');
  });

  it('keeps the nearest places when it has to choose', () => {
    const crowd = Array.from({ length: 6 }, (_, i) => at(`z${i}`, -900 - i * 400, i * 3));
    const kept = signpostsFor(crowd, view())
      .filter((chip) => chip.id !== null)
      .map((chip) => chip.id);
    expect(kept).toEqual(expect.arrayContaining(['z0', 'z1', 'z2', 'z3']));
    expect(kept).not.toContain('z5');
  });

  it('gives no chips a surface too small to hold one', () => {
    expect(signpostsFor([at('water', -900, 0)], view({ width: 40, height: 40 }))).toEqual([]);
  });
});

describe('signpostAt', () => {
  it('finds the chip under a point, and nothing under empty surface', () => {
    const chips = signpostsFor([at('water', -900, 0)], view());
    const chip = chips[0]!;
    expect(signpostAt(chips, chip.x + 4, chip.y + 4)?.id).toBe('water');
    expect(signpostAt(chips, chip.x - 4, chip.y + 4)).toBeNull();
  });
});

describe('distanceLabel', () => {
  it('loses precision as the number grows, because nobody walks it', () => {
    expect(distanceLabel(42)).toBe('42 m');
    expect(distanceLabel(312)).toBe('310 m');
    expect(distanceLabel(1240)).toBe('1.2 km');
  });
});
