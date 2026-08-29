import { describe, expect, it } from 'vitest';
import { blocksOf, captionOf, widthOf, type BlockMember, type LabelBlock } from './blocks';

/**
 * Footprints are the game's own: a Smelter is 6 × 9 m, a Constructor 8 × 10 m
 * and a Coal-Powered Generator 10 × 26 m, so the reach these tests lean on is
 * the reach a real base asks for.
 */
const smelter = (x: number, y: number, product: string, facing = 0): BlockMember => ({
  x,
  y,
  w: 6,
  l: 9,
  facing,
  product,
});

const centreOf = (block: LabelBlock) => (block.minX + block.maxX) / 2;

describe('blocksOf', () => {
  it('names a row of machines making the same thing once', () => {
    const row = [0, 12, 24, 36].map((x) => smelter(x, 0, 'Iron Ingot'));

    const blocks = blocksOf(row);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ label: 'Iron Ingot', count: 4 });
  });

  it('keeps two cells apart even when they make the same thing', () => {
    // Two smelter rows either side of the base. Naming them together would put
    // "Iron Ingot ×4" in the field between them, labelling neither.
    const blocks = blocksOf([
      smelter(0, 0, 'Iron Ingot'),
      smelter(12, 0, 'Iron Ingot'),
      smelter(900, 0, 'Iron Ingot'),
      smelter(912, 0, 'Iron Ingot'),
    ]);

    expect(blocks).toHaveLength(2);
    expect(blocks.map((block) => block.count)).toEqual([2, 2]);
    expect(blocks.map((block) => Math.round(centreOf(block)))).toEqual([6, 906]);
  });

  it('does not merge neighbours making different things', () => {
    const blocks = blocksOf([smelter(0, 0, 'Iron Ingot'), smelter(12, 0, 'Copper Ingot')]);

    expect(blocks.map((block) => block.label).sort()).toEqual(['Copper Ingot', 'Iron Ingot']);
    expect(blocks.every((block) => block.count === 1)).toBe(true);
  });

  it('ignores anything that produces nothing', () => {
    // Foundations and walls outnumber machines eight to one; they carry no
    // product and must not become a block of their own.
    const blocks = blocksOf([smelter(0, 0, ''), smelter(12, 0, ''), smelter(24, 0, 'Screws')]);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.label).toBe('Screws');
  });

  it('reports the ground a rotated footprint actually covers', () => {
    // Turned 90°, a 6 × 9 m smelter is 9 m across and 6 m deep, so its southern
    // edge is 3 m below centre rather than 4.5 m. A caption placed from the
    // centre — or from the unrotated size — would sit on the machine it names.
    const [upright] = blocksOf([smelter(0, 0, 'Iron Ingot')]);
    const [turned] = blocksOf([smelter(0, 0, 'Iron Ingot', 90)]);

    expect(upright?.maxY).toBeCloseTo(4.5);
    expect(upright?.minY).toBeCloseTo(-4.5);
    expect(widthOf(upright!)).toBeCloseTo(6);
    expect(turned?.maxY).toBeCloseTo(3);
    expect(turned?.minY).toBeCloseTo(-3);
    expect(widthOf(turned!)).toBeCloseTo(9);
  });

  it('puts the block standing for the most machines first', () => {
    // Screens are small and labels collide; the caller draws them in this order
    // and drops whatever no longer fits, so the biggest block has to come first.
    const blocks = blocksOf([
      smelter(0, 0, 'Screws'),
      smelter(500, 0, 'Iron Ingot'),
      smelter(512, 0, 'Iron Ingot'),
      smelter(524, 0, 'Iron Ingot'),
    ]);

    expect(blocks.map((block) => block.count)).toEqual([3, 1]);
  });
});

/** A Storage Container is 5 × 11 m, and names itself by what is in it. */
const box = (
  x: number,
  y: number,
  holding: Record<string, number>,
  product = 'Storage Container',
): BlockMember => ({ x, y, w: 5, l: 11, facing: 0, product, holding });

describe('a store', () => {
  /*
   * The one thing a reader can already see about a box is that it is a box.
   * What they cannot see is that this is where the five thousand iron rods
   * went — which the Overview has been reporting as a total, with nowhere to
   * point at.
   */
  it('is named by what it holds, summed across the boxes', () => {
    const blocks = blocksOf([box(0, 0, { 'Iron Rod': 4800 }), box(6, 0, { 'Iron Rod': 374 })]);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ label: 'Iron Rod', held: 5174, count: 2 });
    expect(captionOf(blocks[0]!)).toBe('5,174 Iron Rod');
  });

  /*
   * Boxes get stacked, and a top-down map draws a stack as one rectangle. On
   * the reference save two containers stand at exactly the same point holding
   * Cable and Wire — bucketed by contents like machines that is two captions
   * on one shape, and the placement drops one of them rather than stacking.
   */
  it('is one place even when the boxes hold different things', () => {
    const blocks = blocksOf([box(0, 0, { Cable: 2705 }), box(0, 0, { Wire: 2029 })]);

    expect(blocks).toHaveLength(1);
    expect(captionOf(blocks[0]!)).toBe('2,705 Cable +1 more');
  });

  it('falls back to what it is when there is nothing in it', () => {
    const blocks = blocksOf([box(0, 0, {})]);

    expect(blocks[0]).toMatchObject({ label: 'Storage Container', count: 1 });
    expect(blocks[0]?.held).toBeUndefined();
    expect(captionOf(blocks[0]!)).toBe('Storage Container');
  });

  it('never joins a store to the machines beside it', () => {
    // A box of iron rods next to the constructors making them is not a fifth
    // constructor, and "Iron Rod ×5" would say it was.
    const blocks = blocksOf([
      smelter(0, 0, 'Iron Rod'),
      smelter(12, 0, 'Iron Rod'),
      box(20, 0, { 'Iron Rod': 4800 }),
    ]);

    expect(blocks.map((b) => captionOf(b))).toEqual(['Iron Rod ×2', '4,800 Iron Rod']);
  });
});

describe('captionOf', () => {
  it('counts a block and leaves a lone machine uncounted', () => {
    const at = (label: string, count: number): LabelBlock => ({
      label,
      count,
      minX: 0,
      minY: 0,
      maxX: 40,
      maxY: 10,
    });

    expect(captionOf(at('Iron Ingot', 4))).toBe('Iron Ingot ×4');
    expect(captionOf(at('Rotor', 1))).toBe('Rotor');
  });
});
