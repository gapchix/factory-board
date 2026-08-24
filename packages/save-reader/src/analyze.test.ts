import { describe, expect, it } from 'vitest';
import { analyzeSave, type RawSave, type RawSaveObject } from './analyze.js';

const objectProp = (pathName: string) => ({ value: { pathName } });
const floatProp = (value: number) => ({ value });

const machine = (
  buildClass: string,
  recipe: string,
  extra: Record<string, unknown> = {},
): RawSaveObject => ({
  typePath: `/Game/FactoryGame/Buildable/Factory/${buildClass}/Build_${buildClass}.Build_${buildClass}_C`,
  properties: {
    mCurrentRecipe: objectProp(`/Game/FactoryGame/Recipes/${recipe}.${recipe}_C`),
    ...extra,
  },
});

const withUptime = (produced: number, window: number) => ({
  mLastProductivityMeasurementProduceDuration: floatProp(produced),
  mLastProductivityMeasurementDuration: floatProp(window),
});

const save = (objects: RawSaveObject[], header: Record<string, unknown> = {}): RawSave => ({
  header: {
    sessionName: 'polska',
    playDurationSeconds: 21506,
    buildVersion: 502094,
    ...header,
  },
  levels: { Persistent_Level: { objects } },
});

describe('analyzeSave', () => {
  it('reads the session header', () => {
    const snapshot = analyzeSave(save([]));
    expect(snapshot.sessionName).toBe('polska');
    expect(snapshot.playDurationSeconds).toBe(21506);
    expect(snapshot.saveBuildVersion).toBe(502094);
  });

  it('survives a save with nothing in it', () => {
    const snapshot = analyzeSave({});
    expect(snapshot.sessionName).toBe('Unnamed save');
    expect(snapshot.lines).toEqual({});
    expect(snapshot.phase).toBeNull();
    expect(snapshot.objectCount).toBe(0);
  });

  it('groups machines by the recipe they are set to', () => {
    const snapshot = analyzeSave(
      save([
        machine('ConstructorMk1', 'Recipe_IronRod'),
        machine('ConstructorMk1', 'Recipe_IronRod'),
        machine('ConstructorMk1', 'Recipe_Screw'),
      ]),
    );
    expect(snapshot.lines['Recipe_IronRod_C']?.count).toBe(2);
    expect(snapshot.lines['Recipe_IronRod_C']?.machine).toBe('ConstructorMk1');
    expect(snapshot.lines['Recipe_Screw_C']?.count).toBe(1);
  });

  it('averages uptime across the machines on a line', () => {
    const snapshot = analyzeSave(
      save([
        machine('AssemblerMk1', 'Recipe_Rotor', withUptime(300, 300)),
        machine('AssemblerMk1', 'Recipe_Rotor', withUptime(150, 300)),
      ]),
    );
    expect(snapshot.lines['Recipe_Rotor_C']?.uptime).toBeCloseTo(0.75, 6);
  });

  it('distinguishes "never measured" from "measured at zero"', () => {
    const never = analyzeSave(save([machine('ConstructorMk1', 'Recipe_Cable')]));
    expect(never.lines['Recipe_Cable_C']?.uptime).toBeNull();

    const idle = analyzeSave(save([machine('ConstructorMk1', 'Recipe_Cable', withUptime(0, 300))]));
    expect(idle.lines['Recipe_Cable_C']?.uptime).toBe(0);
  });

  it('clamps a nonsensical productivity ratio into range', () => {
    const snapshot = analyzeSave(
      save([machine('ConstructorMk1', 'Recipe_Wire', withUptime(400, 300))]),
    );
    expect(snapshot.lines['Recipe_Wire_C']?.uptime).toBe(1);
  });

  it('treats a missing clock as 100%', () => {
    const snapshot = analyzeSave(save([machine('ConstructorMk1', 'Recipe_Wire')]));
    expect(snapshot.lines['Recipe_Wire_C']?.clock).toBe(1);
  });

  it('averages overclocks', () => {
    const snapshot = analyzeSave(
      save([
        machine('ConstructorMk1', 'Recipe_Wire', { mCurrentPotential: floatProp(2) }),
        machine('ConstructorMk1', 'Recipe_Wire', { mCurrentPotential: floatProp(1) }),
      ]),
    );
    expect(snapshot.lines['Recipe_Wire_C']?.clock).toBeCloseTo(1.5, 6);
  });

  it('counts every placed building, not just machines', () => {
    const snapshot = analyzeSave(
      save([
        machine('ConstructorMk1', 'Recipe_IronRod'),
        {
          typePath:
            '/Game/FactoryGame/Buildable/Factory/ConveyorBeltMk1/Build_ConveyorBeltMk1.Build_ConveyorBeltMk1_C',
        },
        {
          typePath:
            '/Game/FactoryGame/Buildable/Factory/ConveyorBeltMk1/Build_ConveyorBeltMk1.Build_ConveyorBeltMk1_C',
        },
      ]),
    );
    expect(snapshot.buildings['ConveyorBeltMk1']).toBe(2);
    expect(snapshot.buildings['ConstructorMk1']).toBe(1);
    expect(snapshot.objectCount).toBe(3);
  });

  it('reads purchased milestones and de-duplicates them', () => {
    const snapshot = analyzeSave(
      save([
        {
          typePath: '/Game/FactoryGame/Schematics/BP_SchematicManager.BP_SchematicManager_C',
          properties: {
            mPurchasedSchematics: {
              values: [
                { pathName: '/Game/FactoryGame/Schematics/Schematic_3-1.Schematic_3-1_C' },
                { pathName: '/Game/FactoryGame/Schematics/Schematic_2-1.Schematic_2-1_C' },
                { pathName: '/Game/FactoryGame/Schematics/Schematic_3-1.Schematic_3-1_C' },
              ],
            },
          },
        },
      ]),
    );
    expect(snapshot.milestones).toEqual(['Schematic_2-1_C', 'Schematic_3-1_C']);
  });

  it('reads Space Elevator progress', () => {
    const snapshot = analyzeSave(
      save([
        {
          typePath: '/Game/FactoryGame/GamePhases/BP_GamePhaseManager.BP_GamePhaseManager_C',
          properties: {
            mCurrentGamePhase: objectProp(
              '/Game/FactoryGame/GamePhases/GP_Project_Assembly_Phase_0.GP_Project_Assembly_Phase_0',
            ),
            mTargetGamePhase: objectProp(
              '/Game/FactoryGame/GamePhases/GP_Project_Assembly_Phase_1.GP_Project_Assembly_Phase_1',
            ),
            mTargetGamePhasePaidOffCosts: {
              values: [
                {
                  properties: {
                    ItemClass: objectProp(
                      '/Game/FactoryGame/Resource/Parts/Desc_SpaceElevatorPart_1.Desc_SpaceElevatorPart_1_C',
                    ),
                    Amount: floatProp(24),
                  },
                },
              ],
            },
          },
        },
      ]),
    );
    expect(snapshot.phase?.current).toBe('GP_Project_Assembly_Phase_0');
    expect(snapshot.phase?.target).toBe('GP_Project_Assembly_Phase_1');
    expect(snapshot.phase?.delivered['Desc_SpaceElevatorPart_1_C']).toBe(24);
  });

  it('ignores properties that have gone missing rather than throwing', () => {
    const snapshot = analyzeSave(
      save([
        { typePath: '/Game/x/Build_Thing.Build_Thing_C', properties: { mCurrentRecipe: {} } },
        { typePath: '/Game/x/Build_Thing.Build_Thing_C' },
        {},
      ]),
    );
    expect(snapshot.lines).toEqual({});
    expect(snapshot.buildings['Thing']).toBe(2);
  });

  it('merges objects across several sub-levels', () => {
    const snapshot = analyzeSave({
      header: {},
      levels: {
        a: { objects: [machine('ConstructorMk1', 'Recipe_IronRod')] },
        b: { objects: [machine('ConstructorMk1', 'Recipe_IronRod')] },
      },
    });
    expect(snapshot.lines['Recipe_IronRod_C']?.count).toBe(2);
  });
});
