import type { GameDatabase, ItemId } from '@factory-board/planner';

/** A whole-number change, with the sign kept: `+3`, `-12 MW`. */
export function signed(value: number, unit = ''): string {
  return `${value > 0 ? '+' : ''}${Math.round(value)}${unit}`;
}

/** Trim trailing zeros so 2.50 reads as 2.5 and 3.00 as 3. */
export function rate(value: number, decimals = 1): string {
  if (!Number.isFinite(value)) return '0';
  return value.toFixed(decimals).replace(/\.?0+$/, '');
}

export function itemName(db: GameDatabase, id: ItemId): string {
  return db.items[id]?.name ?? id.replace(/^Desc_|_C$/g, '');
}

/**
 * What a production line is called: the thing it makes.
 *
 * A recipe the book does not know — a real save against the demo book, a mod
 * recipe, a newer game version — used to print its class name, `Recipe_IngotIron_C`,
 * which reads as a fault. It is humanised instead: still visibly not a proper
 * name, no longer a code.
 */
export function recipeName(db: GameDatabase, id: string): string {
  const recipe = db.recipes[id];
  if (recipe) {
    const product = recipe.outputs[0]?.item;
    return product ? itemName(db, product) : recipe.name;
  }
  return humanise(id.replace(/^Recipe_|_C$/g, '')).replace(/\s+/g, ' ');
}

/** Sizes a file the way a person would say it. */
export function megabytes(bytes: number): string {
  return `${(bytes / 1_048_576).toFixed(bytes < 10 * 1_048_576 ? 1 : 0)} MB`;
}

export function unit(db: GameDatabase, id: ItemId): string {
  return db.items[id]?.isFluid ? ' m³/min' : ' /min';
}

export function machineName(db: GameDatabase, id: string): string {
  return db.machines[id]?.name ?? db.buildings[id]?.name ?? id;
}

/**
 * Display name for anything placeable — miners, generators, the HUB.
 *
 * `machines` only holds things recipes are produced in, so a map that used it
 * alone printed raw class names like `GeneratorBiomass_Automated` at the player.
 */
export function buildingName(db: GameDatabase, id: string): string {
  const known = db.buildings[id]?.name ?? db.machines[id]?.name;
  return known ?? humanise(id);
}

/**
 * Last resort for a class the game ships without a display name — the
 * integrated biomass burner inside the HUB is one. Splitting the camel case
 * gives "Generator Integrated Biomass", which is at least readable, rather
 * than printing an internal identifier at the player.
 */
function humanise(id: string): string {
  return id
    .replace(/_/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\bMk ?(\d)/g, 'Mk.$1')
    .trim();
}

export function playTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

/** Machines are laid out in build order, roughly how a factory grows. */
const MACHINE_ORDER = [
  'SmelterMk1',
  'FoundryMk1',
  'ConstructorMk1',
  'AssemblerMk1',
  'ManufacturerMk1',
  'Packager',
  'OilRefinery',
  'Blender',
  'HadronCollider',
  'Converter',
  'QuantumEncoder',
];

export function machineRank(id: string): number {
  const index = MACHINE_ORDER.indexOf(id);
  return index < 0 ? MACHINE_ORDER.length : index;
}
