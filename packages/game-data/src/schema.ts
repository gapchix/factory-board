import { z } from 'zod';
import type {
  GameBuilding,
  GameCarrier,
  GameDatabase,
  GameExtractor,
  GameGenerator,
  GameItem,
  GameMachine,
  GameMilestone,
  GameRecipe,
  GameSchematic,
} from '@factory-board/planner';

/**
 * The generated database is a build artefact that crosses a process boundary:
 * written by the extractor CLI, read back by the web app at build time. Zod is
 * the checkpoint, so a database produced by an older extractor (or a hand-edited
 * one) fails loudly here rather than as a mystery NaN in the solver.
 */

const recipePortSchema = z.object({
  item: z.string().min(1),
  amount: z.number().positive(),
});

const gameItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  isRaw: z.boolean(),
  isFluid: z.boolean(),
  energyMJ: z.number().positive().optional(),
});

const generatorInputSchema = z.object({
  item: z.string().min(1),
  ratePerMinute: z.number().positive(),
});

const generatorFuelSchema = z.object({
  item: z.string().min(1),
  ratePerMinute: z.number().positive(),
  supplemental: generatorInputSchema.optional(),
  byproduct: generatorInputSchema.optional(),
});

const gameGeneratorSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  powerMW: z.number().positive(),
  fuels: z.array(generatorFuelSchema).min(1),
});

const gameCarrierSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: z.enum(['belt', 'lift', 'pipe']),
  ratePerMinute: z.number().positive(),
});

const gameExtractorSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  ratePerMinute: z.number().positive(),
  purityVaries: z.boolean(),
  fluid: z.boolean(),
  resources: z.array(z.string()),
});

const gameRecipeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  durationSeconds: z.number().positive(),
  machine: z.string().min(1),
  inputs: z.array(recipePortSchema),
  outputs: z.array(recipePortSchema).min(1),
  isAlternate: z.boolean(),
});

const gameMachineSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  powerMW: z.number().nonnegative(),
  powerRangeMW: z
    .object({ min: z.number().nonnegative(), max: z.number().nonnegative() })
    .optional(),
});

const gameBuildingSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  footprintM: z.object({ width: z.number().positive(), length: z.number().positive() }).optional(),
});

const gameMilestoneSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  tier: z.number().int().nonnegative(),
  cost: z.array(recipePortSchema),
  unlocks: z.array(z.string()),
});

const gameSchematicSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: z.enum(['milestone', 'research', 'hard-drive', 'other']),
  tier: z.number().int().nonnegative(),
  unlocks: z.array(z.string()),
});

export const gameDatabaseSchema = z.object({
  sourceBuildId: z.number().int().nonnegative(),
  items: z.record(z.string(), gameItemSchema),
  recipes: z.record(z.string(), gameRecipeSchema),
  machines: z.record(z.string(), gameMachineSchema),
  /* Defaulted for the same reason as `schematics`: a database generated before
   * generators were extracted still loads, and then says nothing about power
   * rather than claiming the game has none. */
  generators: z.record(z.string(), gameGeneratorSchema).default({}),
  /* Same again: without these the board says nothing about what a rate has to
   * travel down or come out of, rather than claiming every belt is a Mk.1. */
  carriers: z.record(z.string(), gameCarrierSchema).default({}),
  extractors: z.record(z.string(), gameExtractorSchema).default({}),
  buildings: z.record(z.string(), gameBuildingSchema),
  milestones: z.record(z.string(), gameMilestoneSchema),
  /*
   * Defaulted rather than required, so a database generated before unlocks were
   * extracted still loads. It then says nothing about what is locked, which is
   * the correct answer for a database that does not know — see
   * `unlockedRecipes`, which returns null rather than an empty set for exactly
   * this case.
   */
  schematics: z.record(z.string(), gameSchematicSchema).default({}),
});

export type GameDatabaseShape = z.infer<typeof gameDatabaseSchema>;

/**
 * Compile-time proof that the schema and the planner's domain type stay in step.
 *
 * Two separate guarantees, because one alone is not enough:
 *
 *  1. Validated output is usable as the domain type.
 *  2. Every field the domain declares is also declared by the schema.
 *
 * The second is the important one. Zod strips keys the schema does not declare,
 * so a schema missing an optional field still satisfies (1) — the field just
 * quietly disappears during validation. That is exactly how `powerRangeMW` was
 * lost between the extractor and the planner, turning every variable-power
 * machine's draw into `undefined`.
 *
 * The check compares *keys* rather than whole types on purpose: the domain uses
 * `readonly` arrays and Zod infers mutable ones, so a plain `extends` in this
 * direction fails on variance that has nothing to do with completeness.
 */
type AssertNoMissingKeys<Domain, Shape> =
  Exclude<keyof Domain, keyof Shape> extends never
    ? true
    : { error: 'schema is missing keys'; missing: Exclude<keyof Domain, keyof Shape> };

const _shapeSatisfiesDomain: GameDatabaseShape extends GameDatabase ? true : never = true;
const _itemKeys: AssertNoMissingKeys<GameItem, z.infer<typeof gameItemSchema>> = true;
const _recipeKeys: AssertNoMissingKeys<GameRecipe, z.infer<typeof gameRecipeSchema>> = true;
const _machineKeys: AssertNoMissingKeys<GameMachine, z.infer<typeof gameMachineSchema>> = true;
const _generatorKeys: AssertNoMissingKeys<
  GameGenerator,
  z.infer<typeof gameGeneratorSchema>
> = true;
const _carrierKeys: AssertNoMissingKeys<GameCarrier, z.infer<typeof gameCarrierSchema>> = true;
const _extractorKeys: AssertNoMissingKeys<
  GameExtractor,
  z.infer<typeof gameExtractorSchema>
> = true;
const _buildingKeys: AssertNoMissingKeys<GameBuilding, z.infer<typeof gameBuildingSchema>> = true;
const _milestoneKeys: AssertNoMissingKeys<
  GameMilestone,
  z.infer<typeof gameMilestoneSchema>
> = true;
const _schematicKeys: AssertNoMissingKeys<
  GameSchematic,
  z.infer<typeof gameSchematicSchema>
> = true;
const _databaseKeys: AssertNoMissingKeys<GameDatabase, GameDatabaseShape> = true;

void [
  _shapeSatisfiesDomain,
  _itemKeys,
  _recipeKeys,
  _machineKeys,
  _generatorKeys,
  _carrierKeys,
  _extractorKeys,
  _buildingKeys,
  _milestoneKeys,
  _schematicKeys,
  _databaseKeys,
];

export class InvalidGameDatabaseError extends Error {
  constructor(readonly issues: z.ZodIssue[]) {
    const preview = issues
      .slice(0, 5)
      .map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    super(
      `Game database failed validation (${issues.length} issue${issues.length === 1 ? '' : 's'}):\n${preview}` +
        (issues.length > 5 ? `\n  …and ${issues.length - 5} more` : ''),
    );
    this.name = 'InvalidGameDatabaseError';
  }
}

/** Validate an unknown value as a game database, throwing a readable error. */
export function parseGameDatabase(value: unknown): GameDatabase {
  const result = gameDatabaseSchema.safeParse(value);
  if (!result.success) throw new InvalidGameDatabaseError(result.error.issues);
  return result.data;
}
