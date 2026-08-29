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
   * For a building that produces nothing but is worth pointing at anyway — the
   * Space Elevator, the HUB, a storage container — its own name.
   *
   * Empty only for what is never named: foundations, walls, and the fittings
   * a belt runs through.
   */
  readonly product: string;
  /**
   * What this one holds, by item name, when it is a store.
   *
   * Present and empty for an empty container, which is the difference between
   * "a box with nothing in it" and "not a box". A store is named by its
   * *contents* rather than by what it is, because "Storage Container" is the
   * one thing about it a reader can already see.
   */
  readonly holding?: Readonly<Record<string, number>> | undefined;
}

export interface LabelBlock {
  readonly label: string;
  readonly count: number;
  /**
   * True when nothing here is built yet — the block stands for machines the
   * plan wants.
   *
   * Without it a dashed rectangle on the map is an unexplained empty box: the
   * first person to see one asked what the weird empty boxes were, which is the
   * correct question about a shape that names nothing.
   */
  readonly planned?: boolean | undefined;
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
  /**
   * How much of `label` this store holds, summed across the boxes in it.
   *
   * Absent for machines, which are counted rather than measured — four
   * smelters is `count: 4`, and 4,800 iron rods is not four of anything.
   */
  readonly held?: number | undefined;
  /** Kinds of thing the store holds beyond the one it is named for. */
  readonly alsoHolds?: number | undefined;
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
 * Every store goes in one bucket, whatever is in it.
 *
 * Bucketing them by contents like machines would split a stack of boxes into
 * one block per item and drop two captions on the same rectangle — which is
 * what a base does: on the reference save one pair of containers stands at
 * exactly the same point holding 2,705 Cable and 2,029 Wire. A stack of boxes
 * is one *place*, so it is grouped by where it stands and named afterwards.
 */
const STORES = '#stores';

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
    const key = machine.holding ? STORES : machine.product;
    const bucket = byProduct.get(key);
    if (bucket) bucket.push(machine);
    else byProduct.set(key, [machine]);
  }

  const blocks: LabelBlock[] = [];
  for (const [key, members] of byProduct) {
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

      const box = { count: group.length, minX, minY, maxX, maxY };
      blocks.push(key === STORES ? { ...box, ...stored(group) } : { ...box, label: key });
    }
  }

  blocks.sort((a, b) => b.count - a.count || widthOf(b) - widthOf(a));
  return blocks;
}

/**
 * How a store names itself: by what it mostly holds.
 *
 * A container's own name is the one thing about it a reader can already see —
 * it is a box, drawn as a box. What they cannot see is that this box is where
 * four thousand eight hundred iron rods went. An empty one falls back to what
 * it is, because there is nothing else to say about it.
 */
function stored(group: readonly BlockMember[]): {
  label: string;
  held?: number;
  alsoHolds?: number;
} {
  const total = new Map<string, number>();
  for (const member of group) {
    for (const [item, count] of Object.entries(member.holding ?? {})) {
      total.set(item, (total.get(item) ?? 0) + count);
    }
  }

  const ranked = [...total.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const biggest = ranked[0];
  if (!biggest) return { label: group[0]?.product ?? '' };
  return {
    label: biggest[0],
    held: biggest[1],
    ...(ranked.length > 1 ? { alsoHolds: ranked.length - 1 } : {}),
  };
}

/** How wide the block stands, in metres — what decides when a name is worth drawing. */
export function widthOf(block: LabelBlock): number {
  return block.maxX - block.minX;
}

/** How a block names itself on the map. */
export function captionOf(block: LabelBlock): string {
  if (block.held !== undefined) {
    const more = block.alsoHolds ? ` +${block.alsoHolds} more` : '';
    return `${block.held.toLocaleString()} ${block.label}${more}`;
  }
  const counted = block.count > 1 ? `${block.label} ×${block.count}` : block.label;
  return block.planned ? `${counted} · to build` : counted;
}
