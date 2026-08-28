import type { ItemId } from '@factory-board/planner';

/**
 * Space Elevator delivery quotas.
 *
 * These are not in the game's data dump — only the *paid* amounts appear, in the
 * save file — so they are transcribed and cross-checked against the wiki. Only
 * the phases that have been verified are listed; anything else falls back to
 * showing delivered amounts with no denominator, which is honest rather than
 * confidently wrong.
 */
export interface PhaseDefinition {
  readonly label: string;
  readonly requires: Readonly<Record<ItemId, number>>;
}

export const PHASES: Readonly<Record<string, PhaseDefinition>> = {
  GP_Project_Assembly_Phase_1: {
    label: 'Phase 1',
    requires: { Desc_SpaceElevatorPart_1_C: 50 },
  },
  GP_Project_Assembly_Phase_2: {
    label: 'Phase 2',
    requires: {
      Desc_SpaceElevatorPart_1_C: 500,
      Desc_SpaceElevatorPart_2_C: 500,
      Desc_SpaceElevatorPart_3_C: 100,
    },
  },
};

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
