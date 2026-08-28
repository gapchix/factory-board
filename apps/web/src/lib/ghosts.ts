import type { GameDatabase, MachineId, RecipeId } from '@factory-board/planner';
import type { BuildingPlacement } from '@factory-board/save-reader';

/**
 * Where the machines the plan is missing would stand.
 *
 * The board could say "build six more constructors" and, since zones, say which
 * cell they belong in. It could not show you the six. That is the last step of
 * the thesis and the one that turns a number into an instruction: a plan drawn
 * on the base, at the size and angle the machines would actually be, on ground
 * that is actually free.
 *
 * Three questions, in order:
 *
 * **Which cell?** The zone the target was assigned to, if one was. Otherwise the
 * zone that already runs this recipe — more iron rod constructors go where the
 * iron rod constructors are, and saying so is not a guess. A recipe nothing
 * makes anywhere yet has no home, and is reported rather than dropped on the
 * nearest patch of grass.
 *
 * **Which way round?** However the ones already there face. A row built side by
 * side reads as a row; a ghost at some house angle reads as a mistake.
 *
 * **Where exactly?** The first free cell of a grid laid over the zone, in
 * reading order, skipping anything a building already stands on and anything an
 * earlier ghost has taken. The grid extends past the zone's edge, because that
 * is where a factory grows when the inside is full.
 *
 * Pure geometry: it takes placements and boxes and returns boxes, and knows
 * nothing about Pixi.
 */

export interface GhostZone {
  readonly id: string;
  readonly name: string;
  readonly bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

export interface GhostSite {
  readonly recipe: RecipeId;
  readonly machine: MachineId;
  /** What it would make, for the caption and the hover card. */
  readonly name: string;
  readonly zoneId: string;
  readonly zoneName: string;
  /** Centre, in world metres. */
  readonly x: number;
  readonly y: number;
  /** Footprint along its own axes, before rotation. */
  readonly w: number;
  readonly l: number;
  readonly facing: number;
}

export interface GhostPlan {
  readonly sites: readonly GhostSite[];
  /** Machines with a zone but no room found in it. */
  readonly unplaced: number;
  /** What the plan wants that nowhere in the base already makes. */
  readonly homeless: readonly string[];
}

const EMPTY: GhostPlan = { sites: [], unplaced: 0, homeless: [] };

/** Clear ground kept between a ghost and whatever it stands next to, in metres. */
const GAP_M = 2;

/**
 * How far past a zone's edge a ghost may be placed, in metres.
 *
 * A cell that is already full is the normal case for a plan that says to build
 * more, so refusing to leave the box would put the answer at "no room" almost
 * every time. This is about two rows of machines.
 */
const OVERSPILL_M = 28;

interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const overlaps = (a: Box, b: Box): boolean =>
  a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY;

/** The axis-aligned box a rotated footprint covers. */
function boxOf(x: number, y: number, w: number, l: number, facing: number): Box {
  const angle = (facing * Math.PI) / 180;
  const cos = Math.abs(Math.cos(angle));
  const sin = Math.abs(Math.sin(angle));
  const halfW = (w * cos + l * sin) / 2;
  const halfL = (w * sin + l * cos) / 2;
  return { minX: x - halfW, minY: y - halfL, maxX: x + halfW, maxY: y + halfL };
}

/** What the plan is short of, per recipe: wanted here, minus what is standing. */
export interface Missing {
  readonly recipe: RecipeId;
  readonly machine: MachineId;
  readonly name: string;
  readonly count: number;
  /** The zone the target was pinned to, when it was pinned at all. */
  readonly zoneId?: string | undefined;
}

export function placeGhosts(
  db: GameDatabase,
  placements: readonly BuildingPlacement[],
  zones: readonly GhostZone[],
  missing: readonly Missing[],
): GhostPlan {
  if (missing.length === 0 || zones.length === 0) return EMPTY;

  /* Everything already standing, as boxes, so a ghost never lands on one. */
  const taken: Box[] = [];
  for (const placement of placements) {
    const footprint = db.buildings[placement.machine]?.footprintM;
    if (!footprint) continue;
    const box = boxOf(
      placement.x,
      placement.y,
      footprint.width,
      footprint.length,
      placement.facing ?? 0,
    );
    taken.push({
      minX: box.minX - GAP_M,
      minY: box.minY - GAP_M,
      maxX: box.maxX + GAP_M,
      maxY: box.maxY + GAP_M,
    });
  }

  /** Where a recipe is already made, and which way those machines face. */
  const home = new Map<RecipeId, { zoneId: string; facing: number; count: number }>();
  for (const zone of zones) {
    for (const placement of placements) {
      if (!placement.recipe) continue;
      if (
        placement.x < zone.bounds.minX ||
        placement.x > zone.bounds.maxX ||
        placement.y < zone.bounds.minY ||
        placement.y > zone.bounds.maxY
      ) {
        continue;
      }
      const seen = home.get(placement.recipe);
      if (seen && seen.zoneId !== zone.id) {
        // Made in two places: whichever has more machines wins the ghosts.
        if (seen.count > 1) continue;
      }
      home.set(placement.recipe, {
        zoneId: zone.id,
        facing: seen?.facing ?? placement.facing ?? 0,
        count: (seen?.zoneId === zone.id ? seen.count : 0) + 1,
      });
    }
  }

  const sites: GhostSite[] = [];
  const homeless: string[] = [];
  let unplaced = 0;

  for (const want of missing) {
    const known = home.get(want.recipe);
    const zoneId = want.zoneId ?? known?.zoneId;
    const zone = zones.find((candidate) => candidate.id === zoneId);
    if (!zone) {
      homeless.push(want.name);
      continue;
    }

    const footprint = db.buildings[want.machine]?.footprintM;
    if (!footprint) {
      homeless.push(want.name);
      continue;
    }
    const facing = known?.facing ?? 0;
    const box = boxOf(0, 0, footprint.width, footprint.length, facing);
    const stepX = box.maxX - box.minX + GAP_M;
    const stepY = box.maxY - box.minY + GAP_M;

    for (let placed = 0; placed < want.count; placed += 1) {
      const spot = firstFree(zone, stepX, stepY, taken);
      if (!spot) {
        unplaced += want.count - placed;
        break;
      }
      taken.push({
        minX: spot.x - stepX / 2,
        minY: spot.y - stepY / 2,
        maxX: spot.x + stepX / 2,
        maxY: spot.y + stepY / 2,
      });
      sites.push({
        recipe: want.recipe,
        machine: want.machine,
        name: want.name,
        zoneId: zone.id,
        zoneName: zone.name,
        x: spot.x,
        y: spot.y,
        w: footprint.width,
        l: footprint.length,
        facing,
      });
    }
  }

  return { sites, unplaced, homeless };
}

/**
 * The first cell of the zone's grid that nothing stands on, reading order.
 *
 * Reading order rather than nearest-to-anything on purpose: ghosts for one
 * recipe come out as a row or a block, which is how a factory is actually laid
 * out and how a reader tells six machines from six coincidences.
 */
function firstFree(
  zone: GhostZone,
  stepX: number,
  stepY: number,
  taken: readonly Box[],
): { x: number; y: number } | null {
  /*
   * Inside the cell before outside it. A gap between the machines is where a
   * player would put the next one, and spilling into open ground while the
   * factory has a hole in it reads as the map not having looked.
   */
  return scan(zone.bounds, stepX, stepY, taken) ?? scan(grow(zone.bounds), stepX, stepY, taken);
}

const grow = (box: Box): Box => ({
  minX: box.minX - OVERSPILL_M,
  minY: box.minY - OVERSPILL_M,
  maxX: box.maxX + OVERSPILL_M,
  maxY: box.maxY + OVERSPILL_M,
});

function scan(
  area: Box,
  stepX: number,
  stepY: number,
  taken: readonly Box[],
): { x: number; y: number } | null {
  for (let y = area.minY + stepY / 2; y <= area.maxY; y += stepY) {
    for (let x = area.minX + stepX / 2; x <= area.maxX; x += stepX) {
      const cell = {
        minX: x - stepX / 2,
        minY: y - stepY / 2,
        maxX: x + stepX / 2,
        maxY: y + stepY / 2,
      };
      if (taken.some((other) => overlaps(cell, other))) continue;
      return { x, y };
    }
  }
  return null;
}
