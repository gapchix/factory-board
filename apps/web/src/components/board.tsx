'use client';

import { Box, Flex, Grid, Heading, Text } from '@chakra-ui/react';
import type { GameDatabase, PlannedLine, SolveResult } from '@factory-board/planner';
import { recipesProducing } from '@factory-board/planner';
import type { ActualLine } from '@factory-board/save-reader';
import { useMemo } from 'react';
import { explain, type LineDiagnosis } from '@/lib/diagnose';
import { itemName, machineName, machineRank, rate } from '@/lib/format';
import { useBoard } from '@/state/board';
import { Label, Meter, Mono, Select } from './primitives';

interface Row {
  readonly recipe: string;
  readonly machine: string;
  readonly planned: PlannedLine | undefined;
  readonly actual: ActualLine | undefined;
}

function statusOf(planned: number, actual: number, hasSave: boolean) {
  if (planned === 0) return { tone: 'neutral', text: 'unplanned' } as const;
  if (!hasSave) return { tone: 'plan', text: `${planned} needed` } as const;
  if (actual === 0) return { tone: 'crit', text: `build ${planned}` } as const;
  if (actual < planned) return { tone: 'crit', text: `+${planned - actual} more` } as const;
  if (actual > planned) return { tone: 'neutral', text: `${actual - planned} spare` } as const;
  return { tone: 'ok', text: 'complete' } as const;
}

const TONE_COLOR = {
  ok: { fg: 'status.ok', bg: 'status.okSubtle' },
  crit: { fg: 'status.crit', bg: 'status.critSubtle' },
  plan: { fg: 'steel.500', bg: 'steel.100' },
  neutral: { fg: 'fg.subtle', bg: 'bg.muted' },
} as const;

function LineCard({
  row,
  db,
  zones,
  verdict,
}: {
  row: Row;
  db: GameDatabase;
  /** Where the plan says these machines go, if it says. */
  zones: readonly string[] | undefined;
  /** Why this line is slow in the world, if it is. */
  verdict: LineDiagnosis | undefined;
}) {
  const { dispatch, recipeChoices } = useBoard();
  const recipe = db.recipes[row.recipe];
  const planned = row.planned?.machinesToBuild ?? 0;
  const actual = row.actual?.count ?? 0;
  const hasSave = row.actual !== undefined;
  const status = statusOf(planned, actual, hasSave);
  const colors = TONE_COLOR[status.tone];

  const product = recipe?.outputs[0]?.item;
  const alternatives = useMemo(() => (product ? recipesProducing(db, product) : []), [db, product]);

  /*
   * The plan's instruction, checked against the world.
   *
   * "Build three more" is wrong advice for a line whose output is already full:
   * the machines are not the constraint and three more of them make the pile
   * bigger. The solver cannot know that — it works from rates — so the card
   * says it instead of quietly contradicting the bottleneck list.
   */
  const contradiction =
    planned > actual && (verdict?.verdict === 'blocked' || verdict?.verdict === 'unpowered')
      ? (explain(verdict) ?? null)
      : null;

  const uptime = row.actual?.uptime ?? null;
  const uptimeTone =
    uptime === null ? 'ok' : uptime >= 0.95 ? 'ok' : uptime >= 0.6 ? 'warn' : 'crit';

  const topColor =
    planned === 0
      ? 'fg.subtle'
      : !hasSave
        ? 'steel.500'
        : actual >= planned
          ? 'status.ok'
          : actual === 0
            ? 'status.crit'
            : 'status.warn';

  return (
    <Box
      bg="bg.surface"
      borderWidth="1px"
      borderColor="border.default"
      borderTopWidth="3px"
      borderTopColor={topColor}
      px={4}
      pt={3}
      pb={3.5}
      display="flex"
      flexDirection="column"
      gap={2.5}
    >
      <Box>
        <Heading
          as="h3"
          fontFamily="heading"
          fontWeight="600"
          fontSize="19px"
          textTransform="uppercase"
          letterSpacing="0.02em"
          lineHeight="1.1"
        >
          {product ? itemName(db, product) : row.recipe}
        </Heading>
        {recipe && product && recipe.name !== itemName(db, product) ? (
          <Text fontFamily="mono" fontSize="11px" color="fg.subtle">
            {recipe.name}
          </Text>
        ) : null}
        {zones && zones.length > 0 ? (
          <Text fontFamily="mono" fontSize="11px" color="accent.solid" mt={0.5} truncate>
            → {zones.length > 2 ? `${zones.length} zones` : zones.join(' · ')}
          </Text>
        ) : null}
      </Box>

      <Flex align="flex-end" gap={5} wrap="wrap">
        <Box>
          <Label display="block">plan</Label>
          <Mono fontSize="23px" fontWeight="600" lineHeight="1.1">
            {planned || '—'}
          </Mono>
          {row.planned ? (
            <Text fontFamily="mono" fontSize="10.5px" color="fg.subtle">
              {rate(row.planned.machinesExact, 2)} exact
            </Text>
          ) : null}
        </Box>
        {hasSave ? (
          <Box>
            <Label display="block">built</Label>
            <Mono fontSize="23px" fontWeight="600" lineHeight="1.1">
              {actual}
            </Mono>
            {row.actual && Math.abs(row.actual.clock - 1) > 0.01 ? (
              <Text fontFamily="mono" fontSize="10.5px" color="fg.subtle">
                {Math.round(row.actual.clock * 100)}% clock
              </Text>
            ) : null}
          </Box>
        ) : null}
        <Box
          ml="auto"
          alignSelf="center"
          bg={colors.bg}
          color={colors.fg}
          px={2}
          py={1}
          fontFamily="mono"
          fontSize="11px"
          whiteSpace="nowrap"
        >
          {status.text}
        </Box>
      </Flex>

      {contradiction ? (
        <Flex
          gap={2}
          align="baseline"
          borderLeftWidth="2px"
          borderColor="fg.muted"
          pl={2}
          wrap="wrap"
        >
          <Label flex="none" color="fg">
            {verdict?.verdict === 'blocked' ? 'Not the constraint' : 'No power'}
          </Label>
          <Text fontSize="12px" lineHeight="1.45" color="fg.muted">
            {contradiction}{' '}
            {verdict?.verdict === 'blocked' ? 'More machines here would make the pile bigger.' : ''}
          </Text>
        </Flex>
      ) : null}

      {uptime !== null ? (
        <Flex align="center" gap={2.5}>
          <Label>uptime</Label>
          <Meter value={uptime} tone={uptimeTone} />
          {/* The bar carries the state; the number stays in text ink so it
              clears contrast in both themes. */}
          <Mono fontSize="11.5px" w="36px" textAlign="end" color="fg.muted">
            {Math.round(uptime * 100)}%
          </Mono>
        </Flex>
      ) : null}

      {product && alternatives.length > 1 ? (
        <Select
          value={recipeChoices[product] ?? row.recipe}
          aria-label={`Recipe for ${itemName(db, product)}`}
          onChange={(event) =>
            dispatch({ type: 'chooseRecipe', item: product, recipe: event.target.value })
          }
        >
          {alternatives.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
              {option.isAlternate ? ' (alt)' : ''}
            </option>
          ))}
        </Select>
      ) : null}

      <Flex
        gap={3}
        borderTopWidth="1px"
        borderColor="border.subtle"
        pt={2}
        fontFamily="mono"
        fontSize="11px"
        color="fg.subtle"
        wrap="wrap"
      >
        {row.planned ? <span>{rate(row.planned.outputPerMinute)}/min</span> : null}
        {row.planned ? <span>{Math.round(row.planned.powerMW)} MW</span> : null}
        <span>{machineName(db, row.machine)}</span>
      </Flex>
    </Box>
  );
}

export function BoardGrid({
  db,
  result,
  actual,
  zonesFor,
  verdicts,
}: {
  db: GameDatabase;
  result: SolveResult;
  actual: Readonly<Record<string, ActualLine>>;
  /** Recipe → the zones its machines are meant to be built in. */
  zonesFor?: ReadonlyMap<string, readonly string[]> | undefined;
  /**
   * Recipe → why that line is slow in the world, from `lib/diagnose`.
   *
   * Without it the board and the Overview describe the same factory and
   * disagree: this card said "+3 more Iron Rod" while the bottleneck list said
   * the rod line was backed up with five thousand of them in a container. Both
   * numbers were right and the instruction was wrong.
   */
  verdicts?: ReadonlyMap<string, LineDiagnosis> | undefined;
}) {
  const groups = useMemo(() => {
    const rows = new Map<string, Row>();
    for (const line of result.lines) {
      rows.set(line.recipe, {
        recipe: line.recipe,
        machine: line.machine,
        planned: line,
        actual: actual[line.recipe],
      });
    }
    // Lines that exist in the world but not in the plan still belong on the board.
    for (const [recipeId, line] of Object.entries(actual)) {
      if (rows.has(recipeId)) continue;
      const recipe = db.recipes[recipeId];
      if (!recipe) continue;
      rows.set(recipeId, {
        recipe: recipeId,
        machine: recipe.machine,
        planned: undefined,
        actual: line,
      });
    }

    const byMachine = new Map<string, Row[]>();
    for (const row of rows.values()) {
      const list = byMachine.get(row.machine) ?? [];
      list.push(row);
      byMachine.set(row.machine, list);
    }
    return [...byMachine.entries()]
      .map(([machine, list]) => ({
        machine,
        rows: list.sort(
          (a, b) =>
            (b.planned?.machinesToBuild ?? 0) - (a.planned?.machinesToBuild ?? 0) ||
            (a.planned?.recipeName ?? a.recipe).localeCompare(b.planned?.recipeName ?? b.recipe),
        ),
        total: list.reduce((sum, r) => sum + (r.planned?.machinesToBuild ?? 0), 0),
      }))
      .sort((a, b) => machineRank(a.machine) - machineRank(b.machine));
  }, [db, result.lines, actual]);

  if (groups.length === 0) {
    return (
      <Text color="fg.subtle" fontSize="14px" py={5}>
        Nothing on the board yet. Add a production target above, pick a preset, or load a save to
        see what you already run.
      </Text>
    );
  }

  return (
    <>
      {groups.map((group) => (
        <Box key={group.machine} mt={5}>
          <Flex align="center" gap={3} mb={2.5}>
            <Label color="accent.solid">{machineName(db, group.machine)}</Label>
            <Label>{group.total} planned</Label>
            <Box flex="1" h="1px" bg="border.default" />
          </Flex>
          <Grid gap={3} templateColumns="repeat(auto-fill, minmax(268px, 1fr))">
            {group.rows.map((row) => (
              <LineCard
                key={row.recipe}
                row={row}
                db={db}
                zones={zonesFor?.get(row.recipe)}
                verdict={verdicts?.get(row.recipe)}
              />
            ))}
          </Grid>
        </Box>
      ))}
    </>
  );
}
