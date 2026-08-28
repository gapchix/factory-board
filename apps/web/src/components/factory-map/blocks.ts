import { groupNearby } from '@factory-board/layout';
import { cornersOf, type Placed } from './geometry';

/**
 * Machines standing together and making the same thing, named once.
 *
 * Four smelters in a row are one answer to "what is this", not four, and
 * drawing that answer four times draws it four times on top of itself — which
 * is why the map used to hold its machine names back until you were nose to the
 * glass. So same-product machines within a cell's reach of one another collapse
 * into a block, and the block carries the label.
 *
 * Kept apart from the drawing, like `geometry`, so the grouping can be tested
 * without a GPU.
 */

/** What a block needs to know about a machine: where it stands, and what it makes. */
export interface BlockMember extends Placed {
  /**
   * What this machine produces, already in the reader's language — an item for
   * a machine or a miner, the building's own name for a generator, which makes
   * power rather than anything that can be named as a product.
   *
   * Empty for anything that produces nothing: foundations, walls, storage.
   */
  readonly product: string;
}

export interface LabelBlock {
  readonly label: string;
  readonly count: number;
  /**
   * The ground the block stands on, in world metres.
   *
   * The whole rectangle rather than a point below it, because a caption is
   * placed *around* the machines it names and the first thing it must not
   * cover is them. Everything the old fixed drop needed — the centre, the
   * southern edge, the width that decides whether a name is worth drawing —
   * falls out of this.
   */
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

/**
 * How far apart two machines can stand and still be one block, in metres.
 *
 * A row of smelters sits about twelve metres centre to centre and a
 * coal generator is twenty-six metres long, so the reach has to clear a
 * generator's own footprint to group two of them. Two cells that happen to make
 * the same thing sit hundreds of metres apart and stay separate — which is the
 * point, because "Iron Ingot ×8" spanning two factories names neither.
 */
const REACH_M = 30;

/**
 * Group machines into the blocks a reader would name.
 *
 * Returned biggest first: when two labels want the same strip of screen, the
 * one standing for more machines is the one worth keeping.
 */
export function blocksOf(machines: readonly BlockMember[]): LabelBlock[] {
  const byProduct = new Map<string, BlockMember[]>();
  for (const machine of machines) {
    if (!machine.product) continue;
    const bucket = byProduct.get(machine.product);
    if (bucket) bucket.push(machine);
    else byProduct.set(machine.product, [machine]);
  }

  const blocks: LabelBlock[] = [];
  for (const [label, members] of byProduct) {
    for (const group of groupNearby(
      members,
      (machine) => ({ x: machine.x, y: machine.y }),
      REACH_M,
    )) {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const machine of group) {
        // The corners, not the centre: a caption placed beside a row of
        // generators has to clear the generators, and they are rotated.
        const corners = cornersOf(machine);
        for (let i = 0; i < corners.length; i += 2) {
          minX = Math.min(minX, corners[i]!);
          maxX = Math.max(maxX, corners[i]!);
          minY = Math.min(minY, corners[i + 1]!);
          maxY = Math.max(maxY, corners[i + 1]!);
        }
      }
      blocks.push({ label, count: group.length, minX, minY, maxX, maxY });
    }
  }

  blocks.sort((a, b) => b.count - a.count || widthOf(b) - widthOf(a));
  return blocks;
}

/** How wide the block stands, in metres — what decides when a name is worth drawing. */
export function widthOf(block: LabelBlock): number {
  return block.maxX - block.minX;
}

/** How a block names itself on the map. */
export function captionOf(block: LabelBlock): string {
  return block.count > 1 ? `${block.label} ×${block.count}` : block.label;
}
