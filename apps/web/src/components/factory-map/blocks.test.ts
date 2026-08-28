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
