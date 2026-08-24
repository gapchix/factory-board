import type { GameDatabase, ItemId } from '@factory-board/planner';

/** Trim trailing zeros so 2.50 reads as 2.5 and 3.00 as 3. */
export function rate(value: number, decimals = 1): string {
  if (!Number.isFinite(value)) return '0';
  return value.toFixed(decimals).replace(/\.?0+$/, '');
}

export function itemName(db: GameDatabase, id: ItemId): string {
  return db.items[id]?.name ?? id.replace(/^Desc_|_C$/g, '');
}

export function unit(db: GameDatabase, id: ItemId): string {
  return db.items[id]?.isFluid ? ' m³/min' : ' /min';
}

export function machineName(db: GameDatabase, id: string): string {
  return db.machines[id]?.name ?? id;
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
