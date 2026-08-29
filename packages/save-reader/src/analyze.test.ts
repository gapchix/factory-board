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
    expect(snapshot.paths[0]?.kind).toBe('belt');
    expect(snapshot.paths[0]?.points).toEqual([
      [10, 20],
      [12, 20],
      [14, 20],
    ]);
    // And it knows which belt drew it, so a chain can light up that exact run.
    expect(snapshot.paths[0]?.building).toBe(0);
    expect(snapshot.placements[0]?.machine).toBe('ConveyorBeltMk1');
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

describe('analyzeSave · when the save was written', () => {
  it('reads the save time from the header', () => {
    const snapshot = analyzeSave(save([], { saveDateTime: '1787730343646' }));
    expect(snapshot.savedAt).toBe(1787730343646);
    expect(new Date(snapshot.savedAt ?? 0).toISOString()).toBe('2026-08-26T07:45:43.646Z');
  });

  it('takes a number as readily as a string', () => {
    expect(analyzeSave(save([], { saveDateTime: 1787730343646 })).savedAt).toBe(1787730343646);
  });

  // The field has been a string, a number and Unreal's own tick count across
  // versions. A misread would file a save under the year 58000 and stretch a
  // chart of the session to nothing.
  it('refuses a value outside living memory rather than guessing', () => {
    expect(analyzeSave(save([], { saveDateTime: '638000000000000000' })).savedAt).toBeNull();
    expect(analyzeSave(save([], { saveDateTime: '0' })).savedAt).toBeNull();
    expect(analyzeSave(save([], { saveDateTime: 'yesterday' })).savedAt).toBeNull();
    expect(analyzeSave(save([])).savedAt).toBeNull();
  });
});

describe('analyzeSave · which way a building faces', () => {
  const placed = (rotation: Record<string, number>): RawSaveObject => ({
    typePath: '/Game/FactoryGame/Buildable/Factory/SmelterMk1/Build_SmelterMk1.Build_SmelterMk1_C',
    transform: { translation: { x: 0, y: 0, z: 0 }, rotation },
    properties: {},
  });

  // A quaternion about the vertical axis: (0, 0, sin(θ/2), cos(θ/2)).
  const yaw = (degrees: number) => {
    const half = ((degrees / 2) * Math.PI) / 180;
    return { x: 0, y: 0, z: Math.sin(half), w: Math.cos(half) };
  };

  it('takes the yaw out of the quaternion, in degrees', () => {
    expect(analyzeSave(save([placed(yaw(0))])).placements[0]?.facing).toBe(0);
    expect(analyzeSave(save([placed(yaw(90))])).placements[0]?.facing).toBe(90);
    expect(analyzeSave(save([placed(yaw(180))])).placements[0]?.facing).toBe(180);
  });

  it('reports a quarter turn the other way as 270, not as minus 90', () => {
    expect(analyzeSave(save([placed(yaw(-90))])).placements[0]?.facing).toBe(270);
  });

  // Only the rotation about the vertical axis means anything to a drawing seen
  // from above: a machine tilted on a ramp stands on the same ground.
  it('ignores a tilt, keeping the heading', () => {
    const tilted = { x: 0.2588, y: 0, z: 0, w: 0.9659 }; // 30° about X
    expect(analyzeSave(save([placed(tilted)])).placements[0]?.facing).toBe(0);
  });

  it('says nothing where the transform does not', () => {
    const noRotation: RawSaveObject = {
      typePath:
        '/Game/FactoryGame/Buildable/Factory/SmelterMk1/Build_SmelterMk1.Build_SmelterMk1_C',
      transform: { translation: { x: 0, y: 0, z: 0 } },
      properties: {},
    };
    expect(analyzeSave(save([noRotation])).placements[0]?.facing).toBeUndefined();
  });
});

/* ------------------------------------------------------------------- links */

const building = (name: string, buildClass = 'ConstructorMk1'): RawSaveObject => ({
  instanceName: instance(name),
  typePath: `/Game/FactoryGame/Buildable/Factory/${buildClass}/Build_${buildClass}.Build_${buildClass}_C`,
  transform: { translation: { x: 0, y: 0, z: 0 } },
  properties: {},
});

/** A connection component, naming the one it is plugged into. */
const port = (owner: string, part: string, into: string): RawSaveObject => ({
  instanceName: instance(`${owner}.${part}`),
  typePath: '/Script/FactoryGame.FGFactoryConnectionComponent',
  properties: { mConnectedComponent: objectProp(instance(into)) },
});

/** The same link as the game writes it: declared from both ends. */
const wire = (a: string, aPart: string, b: string, bPart: string): RawSaveObject[] => [
  port(a, aPart, `${b}.${bPart}`),
  port(b, bPart, `${a}.${aPart}`),
];

const named = (snapshot: ReturnType<typeof analyzeSave>) =>
  snapshot.links.map(
    (link) =>
      `${snapshot.placements[link.from]?.machine} → ${snapshot.placements[link.to]?.machine} (${link.kind})`,
  );

describe('analyzeSave · what feeds what', () => {
  it('reads a machine feeding a belt feeding a machine', () => {
    const snapshot = analyzeSave(
      save([
        building('Build_MinerMk1_C_1', 'MinerMk1'),
        building('Build_ConveyorBeltMk1_C_1', 'ConveyorBeltMk1'),
        building('Build_SmelterMk1_C_1', 'SmelterMk1'),
        ...wire('Build_MinerMk1_C_1', 'Output0', 'Build_ConveyorBeltMk1_C_1', 'ConveyorAny0'),
        ...wire('Build_ConveyorBeltMk1_C_1', 'ConveyorAny1', 'Build_SmelterMk1_C_1', 'Input0'),
      ]),
    );
    expect(named(snapshot)).toEqual([
      'MinerMk1 → ConveyorBeltMk1 (belt)',
      'ConveyorBeltMk1 → SmelterMk1 (belt)',
    ]);
  });

  // Both ends declare the same connection, so every link is seen twice.
  it('writes a link down once, however many ends declare it', () => {
    const snapshot = analyzeSave(
      save([
        building('Build_ConveyorBeltMk1_C_1', 'ConveyorBeltMk1'),
        building('Build_ConveyorBeltMk1_C_2', 'ConveyorBeltMk1'),
        ...wire(
          'Build_ConveyorBeltMk1_C_1',
          'ConveyorAny1',
          'Build_ConveyorBeltMk1_C_2',
          'ConveyorAny0',
        ),
      ]),
    );
    expect(snapshot.links).toHaveLength(1);
    expect(snapshot.links[0]).toEqual({ from: 0, to: 1, kind: 'belt' });
  });

  /*
   * A splitter calls its ports Connection0..3 and says nothing about which way
   * anything moves. The belt on the other side of the link always does, and
   * that is what settles it.
   */
  it("takes a splitter's direction from the belt it is plugged into", () => {
    const snapshot = analyzeSave(
      save([
        building('Build_ConveyorBeltMk1_C_1', 'ConveyorBeltMk1'),
        building('Build_ConveyorAttachmentSplitter_C_1', 'ConveyorAttachmentSplitter'),
        building('Build_ConveyorBeltMk1_C_2', 'ConveyorBeltMk1'),
        // Belt one ends at the splitter; belt two starts there.
        ...wire(
          'Build_ConveyorBeltMk1_C_1',
          'ConveyorAny1',
          'Build_ConveyorAttachmentSplitter_C_1',
          'Connection0',
        ),
        ...wire(
          'Build_ConveyorAttachmentSplitter_C_1',
          'Connection1',
          'Build_ConveyorBeltMk1_C_2',
          'ConveyorAny0',
        ),
      ]),
    );
    expect(named(snapshot)).toEqual([
      'ConveyorBeltMk1 → ConveyorAttachmentSplitter (belt)',
      'ConveyorAttachmentSplitter → ConveyorBeltMk1 (belt)',
    ]);
  });

  it('keeps a pipe as one link, because fluid has no build order', () => {
    const snapshot = analyzeSave(
      save([
        building('Build_WaterPump_C_1', 'WaterPump'),
        building('Build_Pipeline_C_1', 'Pipeline'),
        ...wire(
          'Build_WaterPump_C_1',
          'FGPipeConnectionFactory',
          'Build_Pipeline_C_1',
          'PipelineConnection0',
        ),
      ]),
    );
    expect(snapshot.links).toHaveLength(1);
    expect(snapshot.links[0]?.kind).toBe('pipe');
  });

  it('ignores a connection to something that was never placed', () => {
    const snapshot = analyzeSave(
      save([
        building('Build_MinerMk1_C_1', 'MinerMk1'),
        port('Build_MinerMk1_C_1', 'Output0', 'Build_Ghost_C_9.ConveyorAny0'),
      ]),
    );
    expect(snapshot.links).toEqual([]);
  });
});

/* --------------------------------------------------------------- power grids */

const powered = (
  name: string,
  buildClass: string,
  extra: Record<string, unknown> = {},
): RawSaveObject => ({
  instanceName: instance(name),
  typePath: `/Game/FactoryGame/Buildable/Factory/${buildClass}/Build_${buildClass}.Build_${buildClass}_C`,
  transform: { translation: { x: 0, y: 0, z: 0 } },
  properties: {
    mPowerInfo: objectProp(instance(`${name}.PowerInfo`)),
    ...extra,
  },
});

/** The component that carries the numbers, stored beside its building. */
const powerInfo = (
  name: string,
  { demand, capacity }: { demand?: number; capacity?: number },
): RawSaveObject => ({
  instanceName: instance(`${name}.PowerInfo`),
  typePath: '/Script/FactoryGame.FGPowerInfoComponent',
  properties: {
    ...(demand === undefined ? {} : { mTargetConsumption: floatProp(demand) }),
    ...(capacity === undefined ? {} : { mDynamicProductionCapacity: floatProp(capacity) }),
  },
});

/** A grid, which names the *connection components* wired to it, not the buildings. */
const circuit = (id: number, owners: string[]): RawSaveObject => ({
  instanceName: instance(`CircuitSubsystem.FGPowerCircuit_${id}`),
  typePath: '/Script/FactoryGame.FGPowerCircuit',
  properties: {
    mCircuitID: { value: id },
    mComponents: {
      values: owners.map((owner) => ({ pathName: instance(`${owner}.PowerConnection`) })),
    },
  },
});

describe('analyzeSave · power grids', () => {
  it('totals what a grid draws and what it can supply', () => {
    const snapshot = analyzeSave(
      save([
        powered('Build_SmelterMk1_C_1', 'SmelterMk1'),
        powerInfo('Build_SmelterMk1_C_1', { demand: 4 }),
        powered('Build_GeneratorCoal_C_1', 'GeneratorCoal'),
        powerInfo('Build_GeneratorCoal_C_1', { capacity: 75 }),
        circuit(0, ['Build_SmelterMk1_C_1', 'Build_GeneratorCoal_C_1']),
      ]),
    );

    expect(snapshot.circuits).toHaveLength(1);
    expect(snapshot.circuits[0]).toMatchObject({ id: 0, demandMW: 4, capacityMW: 75 });
    expect(snapshot.circuits[0]?.members).toHaveLength(2);
  });

  it('keeps grids apart, because the game does', () => {
    // A generator only feeds what it is physically joined to, so a base with
    // two grids can have one browning out while the other idles.
    const snapshot = analyzeSave(
      save([
        powered('Build_SmelterMk1_C_1', 'SmelterMk1'),
        powerInfo('Build_SmelterMk1_C_1', { demand: 4 }),
        powered('Build_SmelterMk1_C_2', 'SmelterMk1'),
        powerInfo('Build_SmelterMk1_C_2', { demand: 4 }),
        powered('Build_GeneratorCoal_C_1', 'GeneratorCoal'),
        powerInfo('Build_GeneratorCoal_C_1', { capacity: 75 }),
        circuit(0, ['Build_SmelterMk1_C_1', 'Build_GeneratorCoal_C_1']),
        circuit(1, ['Build_SmelterMk1_C_2']),
      ]),
    );

    const [big, small] = snapshot.circuits;
    expect(big).toMatchObject({ id: 0, capacityMW: 75 });
    expect(small).toMatchObject({ id: 1, demandMW: 4, capacityMW: 0 });
  });

  it('tells each building which grid it is on', () => {
    const snapshot = analyzeSave(
      save([
        powered('Build_SmelterMk1_C_1', 'SmelterMk1'),
        powerInfo('Build_SmelterMk1_C_1', { demand: 4 }),
        circuit(7, ['Build_SmelterMk1_C_1']),
      ]),
    );

    expect(snapshot.placements[0]?.circuit).toBe(7);
  });

  it('counts a building once however many wires reach it', () => {
    // A power pole carries several connections. Counting its draw per wire
    // would invent a load that is not there.
    const snapshot = analyzeSave(
      save([
        powered('Build_SmelterMk1_C_1', 'SmelterMk1'),
        powerInfo('Build_SmelterMk1_C_1', { demand: 4 }),
        circuit(0, ['Build_SmelterMk1_C_1', 'Build_SmelterMk1_C_1']),
      ]),
    );

    expect(snapshot.circuits[0]?.demandMW).toBe(4);
    expect(snapshot.circuits[0]?.members).toHaveLength(1);
  });
});

/** A box, and what is in it. */
const storage = (name: string, held: Record<string, number>): RawSaveObject => ({
  instanceName: instance(`${name}.StorageInventory`),
  typePath: '/Script/FactoryGame.FGInventoryComponent',
  properties: {
    mInventoryStacks: {
      values: Object.entries(held).map(([item, count]) => ({
        properties: {
          Item: { value: { itemReference: { pathName: classPath(item) } } },
          NumItems: { value: count },
        },
      })),
    },
  },
});

describe('analyzeSave · what each box holds', () => {
  /*
   * Only the base-wide total was kept, on the grounds that which box the five
   * thousand rods are in is not a question anyone asks. The diagnosis made it
   * one: three of the reference save's five starving lines wait for something
   * the base already holds thousands of, and the advice that follows is only
   * half an answer without somewhere to walk to.
   */
  it('keeps a container’s own contents as well as the total', () => {
    const snapshot = analyzeSave(
      save([
        building('Build_StorageContainerMk1_C_1', 'StorageContainerMk1'),
        storage('Build_StorageContainerMk1_C_1', { Desc_IronRod: 4800 }),
        building('Build_StorageContainerMk1_C_2', 'StorageContainerMk1'),
        storage('Build_StorageContainerMk1_C_2', { Desc_IronRod: 374, Desc_Wire: 2029 }),
      ]),
    );

    expect(snapshot.stored).toEqual({ Desc_IronRod_C: 5174, Desc_Wire_C: 2029 });
    expect(snapshot.placements[0]?.holding).toEqual({ Desc_IronRod_C: 4800 });
    expect(snapshot.placements[1]?.holding).toEqual({
      Desc_IronRod_C: 374,
      Desc_Wire_C: 2029,
    });
  });

  /*
   * An empty record, not a missing one — the same rule the input buffers
   * follow. "This box is empty" is a fact, and it is what tells a map that the
   * grey rectangle is a box at all rather than a building with nothing to say.
   */
  it('says an empty box is empty rather than saying nothing', () => {
    const snapshot = analyzeSave(
      save([
        building('Build_StorageContainerMk1_C_1', 'StorageContainerMk1'),
        storage('Build_StorageContainerMk1_C_1', {}),
        building('Build_ConstructorMk1_C_9'),
      ]),
    );

    expect(snapshot.placements[0]?.holding).toEqual({});
    expect(snapshot.placements[1]?.holding).toBeUndefined();
  });
});
