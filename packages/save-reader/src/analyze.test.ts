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

/**
 * Spline points are stored in the belt's own space, in build order — which runs
 * from the belt's input connection to its output, and so is the direction the
 * ore travels. The map draws chevrons along belts on the strength of that, and
 * it holds in the reference save: of the belts touching a miner, the one
 * building in the game that can only be a source, every one *starts* there and
 * none ends there. These tests pin the half of it that is ours to keep — the
 * order the parser hands back.
 */
describe('analyzeSave · routes', () => {
  const splineProp = (points: readonly (readonly [number, number])[]) => ({
    values: points.map(([x, y]) => ({ properties: { Location: { value: { x, y, z: 0 } } } })),
  });

  const conveyor = (
    points: readonly (readonly [number, number])[],
    transform: RawSaveObject['transform'] = { translation: { x: 1000, y: 2000, z: 0 } },
    kind = 'ConveyorBeltMk1',
  ): RawSaveObject => ({
    typePath: `/Game/FactoryGame/Buildable/Factory/${kind}/Build_${kind}.Build_${kind}_C`,
    ...(transform === undefined ? {} : { transform }),
    properties: { mSplineData: splineProp(points) },
  });

  it('returns the spline in build order, so the first point is the input end', () => {
    const snapshot = analyzeSave(
      save([
        conveyor([
          [0, 0],
          [200, 0],
          [400, 0],
        ]),
      ]),
    );
    expect(snapshot.paths).toEqual([
      {
        kind: 'belt',
        points: [
          [10, 20],
          [12, 20],
          [14, 20],
        ],
      },
    ]);
  });

  it('does not normalise direction: a belt built the other way reads the other way', () => {
    const snapshot = analyzeSave(
      save([
        conveyor([
          [400, 0],
          [200, 0],
          [0, 0],
        ]),
      ]),
    );
    expect(snapshot.paths[0]?.points).toEqual([
      [14, 20],
      [12, 20],
      [10, 20],
    ]);
  });

  it('rotates local spline points into world space', () => {
    // A quarter turn about Z: the belt was drawn running east, and is placed
    // facing south.
    const quarterTurn = Math.SQRT1_2;
    const snapshot = analyzeSave(
      save([
        conveyor(
          [
            [0, 0],
            [100, 0],
          ],
          {
            translation: { x: 500, y: 300, z: 0 },
            rotation: { x: 0, y: 0, z: quarterTurn, w: quarterTurn },
          },
        ),
      ]),
    );
    expect(snapshot.paths[0]?.points).toEqual([
      [5, 3],
      [5, 4],
    ]);
  });

  it('collapses spline points that round to the same metre', () => {
    const snapshot = analyzeSave(
      save([
        conveyor([
          [0, 0],
          [10, 0],
          [200, 0],
        ]),
      ]),
    );
    expect(snapshot.paths[0]?.points).toEqual([
      [10, 20],
      [12, 20],
    ]);
  });

  it('drops a run that is a single point once rounded', () => {
    const snapshot = analyzeSave(
      save([
        conveyor([
          [0, 0],
          [10, 0],
        ]),
      ]),
    );
    expect(snapshot.paths).toEqual([]);
  });

  it('tells belts and pipes apart', () => {
    const snapshot = analyzeSave(
      save([
        conveyor(
          [
            [0, 0],
            [200, 0],
          ],
          undefined,
          'PipelineMk1',
        ),
      ]),
    );
    expect(snapshot.paths[0]?.kind).toBe('pipe');
  });
});

/* ------------------------------------------------------------------- roles */

const instance = (name: string) => `Persistent_Level:PersistentLevel.${name}`;
const classPath = (id: string) => `/Game/FactoryGame/Resource/${id}.${id}_C`;

const miner = (
  name: string,
  extra: Record<string, unknown> = {},
  buildClass = 'MinerMk1',
): RawSaveObject => ({
  instanceName: instance(name),
  typePath: `/Game/FactoryGame/Buildable/Factory/${buildClass}/Build_${buildClass}.Build_${buildClass}_C`,
  transform: { translation: { x: 0, y: 0, z: 0 } },
  properties: {
    mExtractableResource: objectProp(instance('BP_ResourceNode551')),
    ...extra,
  },
});

const generator = (
  name: string,
  fuel: string | undefined,
  extra: Record<string, unknown> = {},
): RawSaveObject => ({
  instanceName: instance(name),
  typePath:
    '/Game/FactoryGame/Buildable/Factory/GeneratorCoal/Build_GeneratorCoal.Build_GeneratorCoal_C',
  transform: { translation: { x: 0, y: 0, z: 0 } },
  properties: {
    mFuelInventory: objectProp(instance(`${name}.FuelInventory`)),
    ...(fuel ? { mCurrentFuelClass: objectProp(classPath(fuel)) } : {}),
    ...extra,
  },
});

/** An inventory component, stored as an object of its own next to its owner. */
const inventory = (
  owner: string,
  child: 'OutputInventory' | 'FuelInventory',
  { holding, accepts }: { holding?: string; accepts?: string },
): RawSaveObject => ({
  instanceName: instance(`${owner}.${child}`),
  typePath: '/Script/FactoryGame.FGInventoryComponent',
  properties: {
    ...(holding
      ? {
          mInventoryStacks: {
            values: [
              {
                properties: {
                  Item: { value: { itemReference: { pathName: classPath(holding) } } },
                },
              },
            ],
          },
        }
      : {}),
    ...(accepts ? { mAllowedItemDescriptors: { values: [{ pathName: classPath(accepts) }] } } : {}),
  },
});

describe('analyzeSave · what a building is for', () => {
  it('reads the ore a miner is pulling out of its node', () => {
    const snapshot = analyzeSave(
      save([
        miner('Build_MinerMk1_C_1'),
        inventory('Build_MinerMk1_C_1', 'OutputInventory', { holding: 'Desc_OreIron' }),
      ]),
    );
    expect(snapshot.placements[0]?.role).toBe('extraction');
    expect(snapshot.placements[0]?.resource).toBe('Desc_OreIron_C');
  });

  // A miner whose belt has drained the buffer has no stack left to read, and
  // that is the normal state of a working miner.
  it('names the ore from an empty output buffer too', () => {
    const snapshot = analyzeSave(
      save([
        miner('Build_MinerMk1_C_1'),
        inventory('Build_MinerMk1_C_1', 'OutputInventory', { accepts: 'Desc_Stone' }),
      ]),
    );
    expect(snapshot.placements[0]?.resource).toBe('Desc_Stone_C');
  });

  it('resolves an inventory stored before the building that owns it', () => {
    const snapshot = analyzeSave(
      save([
        inventory('Build_MinerMk1_C_1', 'OutputInventory', { holding: 'Desc_OreCopper' }),
        miner('Build_MinerMk1_C_1'),
      ]),
    );
    expect(snapshot.placements[0]?.resource).toBe('Desc_OreCopper_C');
  });

  it('reads the fuel a generator is burning', () => {
    const snapshot = analyzeSave(save([generator('Build_GeneratorCoal_C_1', 'Desc_Coal')]));
    expect(snapshot.placements[0]?.role).toBe('power');
    expect(snapshot.placements[0]?.resource).toBe('Desc_Coal_C');
  });

  it('falls back to the fuel inventory when the burner is between loads', () => {
    const snapshot = analyzeSave(
      save([
        generator('Build_GeneratorCoal_C_1', undefined),
        inventory('Build_GeneratorCoal_C_1', 'FuelInventory', { holding: 'Desc_Biofuel' }),
      ]),
    );
    expect(snapshot.placements[0]?.resource).toBe('Desc_Biofuel_C');
  });

  it('keeps the uptime of buildings no production line covers', () => {
    const snapshot = analyzeSave(
      save([
        miner('Build_MinerMk1_C_1', withUptime(150, 300)),
        generator('Build_GeneratorCoal_C_1', 'Desc_Coal', withUptime(200, 300)),
      ]),
    );
    expect(snapshot.placements[0]?.uptime).toBeCloseTo(0.5, 6);
    expect(snapshot.placements[1]?.uptime).toBeCloseTo(2 / 3, 6);
  });

  // A machine's productivity is already averaged into its line, and repeating
  // it on every placement would grow the snapshot by a smelter per smelter.
  it('does not repeat a machine uptime that lines already carry', () => {
    const snapshot = analyzeSave(
      save([
        {
          ...machine('SmelterMk1', 'Recipe_IngotIron', withUptime(150, 300)),
          transform: { translation: { x: 0, y: 0, z: 0 } },
        },
      ]),
    );
    expect(snapshot.placements[0]?.role).toBe('production');
    expect(snapshot.placements[0]?.uptime).toBeUndefined();
    expect(snapshot.lines['Recipe_IngotIron_C']?.uptime).toBeCloseTo(0.5, 6);
  });

  it('leaves anything that neither makes, extracts nor burns unclassified', () => {
    const snapshot = analyzeSave(
      save([
        {
          typePath:
            '/Game/FactoryGame/Buildable/Factory/StorageContainerMk1/Build_StorageContainerMk1.Build_StorageContainerMk1_C',
          transform: { translation: { x: 0, y: 0, z: 0 } },
        },
      ]),
    );
    expect(snapshot.placements[0]?.role).toBeUndefined();
  });
});
