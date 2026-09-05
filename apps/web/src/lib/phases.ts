import type { ItemId } from '@factory-board/planner';
import type { PhaseProgress } from '@factory-board/save-reader';

/**
 * Space Elevator delivery quotas.
 *
 * These are in neither data source. `Docs.json` describes the elevator as a
 * building and says nothing about what it asks for; the save records what has
 * been *paid* towards the current phase, never the total. So they are
 * transcribed from the wiki, at the default cost multiplier, and checked
 * against the save before they are shown
 * ([ADR 35](../../../../docs/adr/0035-the-quotas-are-transcribed-then-checked.md)).
 *
 * Every id below was looked up by display name in a real extracted database
 * rather than guessed from the pattern: the numbering is not in phase order
 * (Magnetic Field Generator is part 6 and Assembly Director System part 7;
 * Ballistic Warp Drive is 11 and AI Expansion Server 12).
 */
export interface PhaseDefinition {
  readonly label: string;
  /** At a cost multiplier of 1. */
  readonly requires: Readonly<Record<ItemId, number>>;
}

const SMART_PLATING = 'Desc_SpaceElevatorPart_1_C';
const VERSATILE_FRAMEWORK = 'Desc_SpaceElevatorPart_2_C';
const AUTOMATED_WIRING = 'Desc_SpaceElevatorPart_3_C';
const MODULAR_ENGINE = 'Desc_SpaceElevatorPart_4_C';
const ADAPTIVE_CONTROL_UNIT = 'Desc_SpaceElevatorPart_5_C';
const MAGNETIC_FIELD_GENERATOR = 'Desc_SpaceElevatorPart_6_C';
const ASSEMBLY_DIRECTOR_SYSTEM = 'Desc_SpaceElevatorPart_7_C';
const THERMAL_PROPULSION_ROCKET = 'Desc_SpaceElevatorPart_8_C';
const NUCLEAR_PASTA = 'Desc_SpaceElevatorPart_9_C';
const BIOCHEMICAL_SCULPTOR = 'Desc_SpaceElevatorPart_10_C';
const BALLISTIC_WARP_DRIVE = 'Desc_SpaceElevatorPart_11_C';
const AI_EXPANSION_SERVER = 'Desc_SpaceElevatorPart_12_C';

export const PHASES: Readonly<Record<string, PhaseDefinition>> = {
  GP_Project_Assembly_Phase_1: {
    label: 'Phase 1',
    requires: { [SMART_PLATING]: 50 },
  },
  GP_Project_Assembly_Phase_2: {
    label: 'Phase 2',
    requires: { [SMART_PLATING]: 1000, [VERSATILE_FRAMEWORK]: 1000, [AUTOMATED_WIRING]: 100 },
  },
  GP_Project_Assembly_Phase_3: {
    label: 'Phase 3',
    requires: { [VERSATILE_FRAMEWORK]: 2500, [MODULAR_ENGINE]: 500, [ADAPTIVE_CONTROL_UNIT]: 100 },
  },
  GP_Project_Assembly_Phase_4: {
    label: 'Phase 4',
    requires: {
      [ASSEMBLY_DIRECTOR_SYSTEM]: 500,
      [MAGNETIC_FIELD_GENERATOR]: 500,
      [THERMAL_PROPULSION_ROCKET]: 250,
      [NUCLEAR_PASTA]: 100,
    },
  },
  GP_Project_Assembly_Phase_5: {
    label: 'Phase 5',
    requires: {
      [NUCLEAR_PASTA]: 1000,
      [BIOCHEMICAL_SCULPTOR]: 1000,
      [AI_EXPANSION_SERVER]: 256,
      [BALLISTIC_WARP_DRIVE]: 200,
    },
  },
};

/** "Phase 3", or the raw id with its prefix taken off for one not transcribed. */
export function phaseLabel(target: string | null | undefined): string | undefined {
  if (!target) return undefined;
  return PHASES[target]?.label ?? target.replace(/^GP_Project_Assembly_/, '').replace(/_/g, ' ');
}

/**
 * What a phase asks for in *this* world: the transcribed quota, scaled by the
 * multiplier the save was started with. Rounded to whole parts, floor of one.
 */
export function requiredFor(
  target: string,
  multiplier = 1,
): Readonly<Record<ItemId, number>> | undefined {
  const definition = PHASES[target];
  if (!definition) return undefined;
  const scale = multiplier > 0 ? multiplier : 1;
  const out: Record<ItemId, number> = {};
  for (const [item, amount] of Object.entries(definition.requires)) {
    out[item] = Math.max(1, Math.round(amount * scale));
  }
  return out;
}

export interface PhaseQuota {
  readonly label: string;
  readonly requires: Readonly<Record<ItemId, number>>;
}

/**
 * The quota to show for a save's current target, or nothing.
 *
 * Nothing when there is no target, when the phase has not been transcribed —
 * and when the save has already delivered *more* of a part than the quota
 * says. A transcription the world has exceeded is wrong for that world,
 * whatever the cause (a multiplier the reader could not see, a game update, a
 * mistake in the table), and a progress bar past 100% is a lie about the
 * elevator. Delivered amounts without a denominator are the honest fallback,
 * and every caller already has one.
 */
export function quotaFor(phase: PhaseProgress | null | undefined): PhaseQuota | null {
  const target = phase?.target;
  if (!target) return null;
  const requires = requiredFor(target, phase.costMultiplier);
  const label = PHASES[target]?.label;
  if (!requires || !label) return null;
  for (const [item, amount] of Object.entries(requires)) {
    if ((phase.delivered[item] ?? 0) > amount) return null;
  }
  return { label, requires };
}

/**
 * A worked example, for a Planner with nothing in it.
 *
 * There used to be a "Phase 1" and a "Phase 2" here, and they were wrong the
 * moment you delivered anything: a fixed list cannot know what is left. The
 * save does, so the proposal above the editor is built from it instead
 * ([ADR 26](../../../../docs/adr/0026-the-plan-writes-itself.md)) and these two
 * are gone rather than left to disagree with it.
 */
export const PRESETS: ReadonlyArray<{
  readonly id: string;
  readonly label: string;
  readonly targets: ReadonlyArray<{ item: ItemId; ratePerMinute: number }>;
}> = [
  {
    id: 'rip',
    label: 'Reinforced Plate 10/min',
    targets: [{ item: 'Desc_IronPlateReinforced_C', ratePerMinute: 10 }],
  },
];
