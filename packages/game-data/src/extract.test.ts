import { describe, expect, it } from 'vitest';
import {
  parseAmounts,
  parseClearance,
  parseProducedIn,
  parseUnlockedRecipes,
  type DocsGroup,
} from './docs.js';
import { extractDatabase } from './extract.js';
import { parseGameDatabase } from './schema.js';

const itemRef = (name: string, amount: number) =>
  `(ItemClass="/Script/Engine.BlueprintGeneratedClass'/Game/FactoryGame/Resource/Parts/${name}/${name}.${name}_C'",Amount=${amount})`;

describe('parseAmounts', () => {
  it('reads a single ingredient out of an escaped struct string', () => {
    expect(parseAmounts(`(${itemRef('Desc_IronIngot', 1)})`)).toEqual([
      { className: 'Desc_IronIngot_C', amount: 1 },
    ]);
  });

  it('reads several ingredients in order', () => {
    const raw = `(${itemRef('Desc_IronPlate', 6)},${itemRef('Desc_IronScrew', 12)})`;
    expect(parseAmounts(raw)).toEqual([
      { className: 'Desc_IronPlate_C', amount: 6 },
      { className: 'Desc_IronScrew_C', amount: 12 },
    ]);
  });

  it('is reusable — the global regex does not leak state between calls', () => {
    const raw = `(${itemRef('Desc_IronIngot', 1)})`;
    expect(parseAmounts(raw)).toHaveLength(1);
    expect(parseAmounts(raw)).toHaveLength(1);
    expect(parseAmounts(raw)).toHaveLength(1);
  });

  it('returns nothing for empty or unexpected input', () => {
    expect(parseAmounts('')).toEqual([]);
    expect(parseAmounts(undefined)).toEqual([]);
    expect(parseAmounts(42)).toEqual([]);
    expect(parseAmounts('total nonsense')).toEqual([]);
  });
});

describe('parseProducedIn', () => {
  it('picks out machine class names', () => {
    const raw =
      '("/Game/FactoryGame/Buildable/Factory/ConstructorMk1/Build_ConstructorMk1.Build_ConstructorMk1_C","/Script/FactoryGame.FGBuildableAutomatedWorkBench")';
    expect(parseProducedIn(raw)).toEqual(['ConstructorMk1']);
  });

  it('returns nothing when a recipe is hand-crafted only', () => {
    expect(parseProducedIn('("/Script/FactoryGame.FGBuildableAutomatedWorkBench")')).toEqual([]);
  });
});

describe('parseUnlockedRecipes', () => {
  it('de-duplicates recipe references', () => {
    expect(parseUnlockedRecipes('Recipe_Rotor_C Recipe_Rotor_C Recipe_Screw_C').sort()).toEqual([
      'Recipe_Rotor_C',
      'Recipe_Screw_C',
    ]);
  });
});

const docs: DocsGroup[] = [
  {
    NativeClass: "Class'/Script/FactoryGame.FGResourceDescriptor'",
    Classes: [{ ClassName: 'Desc_OreIron_C', mDisplayName: 'Iron Ore', mForm: 'RF_SOLID' }],
  },
  {
    NativeClass: "Class'/Script/FactoryGame.FGItemDescriptor'",
    Classes: [
      { ClassName: 'Desc_IronIngot_C', mDisplayName: 'Iron Ingot', mForm: 'RF_SOLID' },
      { ClassName: 'Desc_Water_C', mDisplayName: 'Water', mForm: 'RF_LIQUID' },
      { ClassName: 'Desc_Unused_C', mDisplayName: 'Unused Thing', mForm: 'RF_SOLID' },
    ],
  },
  {
    NativeClass: "Class'/Script/FactoryGame.FGBuildableManufacturer'",
    Classes: [
      { ClassName: 'Build_SmelterMk1_C', mDisplayName: 'Smelter', mPowerConsumption: '4.000000' },
      { ClassName: 'Build_Wall_C', mDisplayName: 'Wall' },
    ],
  },
  {
    NativeClass: "Class'/Script/FactoryGame.FGRecipe'",
    Classes: [
      {
        ClassName: 'Recipe_IngotIron_C',
        mDisplayName: 'Iron Ingot',
        mManufactoringDuration: '2.000000',
        mIngredients: `(${itemRef('Desc_OreIron', 1)})`,
        mProduct: `(${itemRef('Desc_IronIngot', 1)})`,
        mProducedIn:
          '("/Game/FactoryGame/Buildable/Factory/SmelterMk1/Build_SmelterMk1.Build_SmelterMk1_C")',
      },
      {
        ClassName: 'Recipe_WaterThing_C',
        mDisplayName: 'Water Thing',
        mManufactoringDuration: '4.000000',
        mIngredients: `(${itemRef('Desc_Water', 2000)})`,
        mProduct: `(${itemRef('Desc_IronIngot', 1)})`,
        mProducedIn:
          '("/Game/FactoryGame/Buildable/Factory/SmelterMk1/Build_SmelterMk1.Build_SmelterMk1_C")',
      },
      {
        ClassName: 'Recipe_HandOnly_C',
        mDisplayName: 'Hand Only',
        mManufactoringDuration: '1.000000',
        mIngredients: `(${itemRef('Desc_OreIron', 1)})`,
        mProduct: `(${itemRef('Desc_IronIngot', 1)})`,
        mProducedIn: '("/Script/FactoryGame.FGBuildableAutomatedWorkBench")',
      },
    ],
  },
  {
    NativeClass: "Class'/Script/FactoryGame.FGSchematic'",
    Classes: [
      {
        ClassName: 'Schematic_3-1_C',
        mDisplayName: 'Coal Power',
        mTechTier: 3,
        mCost: `(${itemRef('Desc_IronIngot', 150)})`,
        mUnlocks: 'Recipe_IngotIron_C',
      },
      { ClassName: 'Schematic_Tutorial1_C', mDisplayName: 'Tutorial', mTechTier: 0 },
    ],
  },
];

describe('extractDatabase', () => {
  const report = extractDatabase(docs, { sourceBuildId: 24656030 });

  it('produces a database that passes its own schema', () => {
    expect(() => parseGameDatabase(report.database)).not.toThrow();
  });

  it('marks resource descriptors as raw', () => {
    expect(report.database.items['Desc_OreIron_C']?.isRaw).toBe(true);
    expect(report.database.items['Desc_IronIngot_C']?.isRaw).toBe(false);
  });

  it('normalises fluid amounts from litres to cubic metres', () => {
    expect(report.database.items['Desc_Water_C']?.isFluid).toBe(true);
    expect(report.database.recipes['Recipe_WaterThing_C']?.inputs[0]?.amount).toBe(2);
  });

  it('drops recipes that no machine can produce', () => {
    expect(report.database.recipes).not.toHaveProperty('Recipe_HandOnly_C');
    expect(report.database.recipes).toHaveProperty('Recipe_IngotIron_C');
  });

  it('keeps only machines that some recipe uses', () => {
    expect(Object.keys(report.database.machines)).toEqual(['SmelterMk1']);
  });

  it('prunes items nothing references', () => {
    expect(report.database.items).not.toHaveProperty('Desc_Unused_C');
  });

  it('keeps numbered milestones and skips tutorials', () => {
    expect(Object.keys(report.database.milestones)).toEqual(['Schematic_3-1_C']);
    expect(report.database.milestones['Schematic_3-1_C']?.tier).toBe(3);
    expect(report.database.milestones['Schematic_3-1_C']?.cost).toEqual([
      { item: 'Desc_IronIngot_C', amount: 150 },
    ]);
  });

  it('reports what it counted', () => {
    expect(report.counts.recipes).toBe(2);
    expect(report.counts.machines).toBe(1);
  });
});

describe('parseGameDatabase', () => {
  it('rejects a database with a zero-length recipe output', () => {
    expect(() =>
      parseGameDatabase({
        sourceBuildId: 1,
        items: {},
        recipes: {
          bad: {
            id: 'bad',
            name: 'Bad',
            durationSeconds: 1,
            machine: 'm',
            inputs: [],
            outputs: [],
            isAlternate: false,
          },
        },
        machines: {},
        buildings: {},
        milestones: {},
      }),
    ).toThrow(/failed validation/);
  });
});

describe('parseClearance', () => {
  const constructor_ =
    '((ClearanceBox=(Min=(X=-400.000000,Y=-500.000000,Z=0.000000),Max=(X=400.000000,Y=500.000000,Z=600.000000),IsValid=True)),(Type=CT_Soft,ClearanceBox=(Min=(X=-400.000000,Y=-900.000000,Z=0.000000),Max=(X=400.000000,Y=900.000000,Z=600.000000),IsValid=True)))';

  it('reads the ground a building stands on, in centimetres', () => {
    expect(parseClearance(constructor_)).toEqual({ widthCm: 800, lengthCm: 1000 });
  });

  // The soft box is the room a player needs to stand and use the machine. Taking
  // it would draw a Constructor half again as long as it is.
  it('takes the hard box over the soft one, wherever it comes in the list', () => {
    const softFirst =
      '((Type=CT_Soft,ClearanceBox=(Min=(X=-400.000000,Y=-900.000000,Z=0.000000),Max=(X=400.000000,Y=900.000000,Z=600.000000),IsValid=True)),(ClearanceBox=(Min=(X=-250.000000,Y=-500.000000,Z=0.000000),Max=(X=250.000000,Y=500.000000,Z=450.000000),IsValid=True)))';
    expect(parseClearance(softFirst)).toEqual({ widthCm: 500, lengthCm: 1000 });
  });

  it('falls back to a soft box rather than to nothing', () => {
    const onlySoft =
      '((Type=CT_Soft,ClearanceBox=(Min=(X=-100.000000,Y=-200.000000,Z=0.000000),Max=(X=100.000000,Y=200.000000,Z=300.000000),IsValid=True)))';
    expect(parseClearance(onlySoft)).toEqual({ widthCm: 200, lengthCm: 400 });
  });

  it('has nothing to say about a building that declares none', () => {
    expect(parseClearance(undefined)).toBeUndefined();
    expect(parseClearance('')).toBeUndefined();
    expect(parseClearance('()')).toBeUndefined();
    expect(parseClearance(42)).toBeUndefined();
  });

  it('ignores a box with no size to it', () => {
    const empty =
      '((ClearanceBox=(Min=(X=0.000000,Y=0.000000,Z=0.000000),Max=(X=0.000000,Y=0.000000,Z=0.000000),IsValid=False)),(ClearanceBox=(Min=(X=-300.000000,Y=-700.000000,Z=0.000000),Max=(X=300.000000,Y=700.000000,Z=400.000000),IsValid=True)))';
    expect(parseClearance(empty)).toEqual({ widthCm: 600, lengthCm: 1400 });
  });
});
