'use client';

import { Box, Button, Flex, Grid, Heading, Text } from '@chakra-ui/react';
import type { GameDatabase, SolveResult } from '@factory-board/planner';
import type { WorldSnapshot } from '@factory-board/save-reader';
import { useMemo, useState, type DragEvent } from 'react';
import { itemName, rate, unit } from '@/lib/format';
import { duration, planForPhase } from '@/lib/phase-plan';
import type { BuildStep } from '@/lib/build-order';
import type { PlanPower } from '@/lib/power-plan';
import { PHASES, PRESETS } from '@/lib/phases';
import { buildZoneBoard, zoneAt } from '@/lib/zones';
import { useBoard } from '@/state/board';
import { useSaveLoader } from '@/hooks/use-save-loader';
import { Field, Label, Meter, Mono, NumTd, Panel, Select, Td, TableFrame, Th } from './primitives';

/* -------------------------------------------------------------- phase plan */

/**
 * What the elevator is waiting for, and the plan that would feed it.
 *
 * The Planner used to open on an empty box and ask what you wanted the factory
 * to make, which is a blank page, and the presets could not answer it either —
 * they are fixed lists that know nothing about the save. This does: the phase
 * you are on, what is still to make after everything delivered and everything
 * already sitting in a box, and what you produce of it now.
 */
export function PhaseProposal({ db }: { db: GameDatabase }) {
  const { snapshot, dispatch, targets } = useBoard();
  const plan = useMemo(() => (snapshot ? planForPhase(db, snapshot) : null), [db, snapshot]);
  if (!plan || plan.done) return null;

  const short = plan.parts.filter((part) => part.toMake > 0);
  const planned = new Set(targets.map((target) => target.item));
  const already = plan.targets.every((target) => planned.has(target.item));

  return (
    <Panel mt={3.5} px={4} py={3.5}>
      <Flex justify="space-between" align="baseline" gap={3} wrap="wrap">
        <Label color="fg">The elevator is waiting for</Label>
        <Label>{plan.label}</Label>
      </Flex>

      <Box mt={2.5}>
        {short.map((part) => (
          <Flex
            key={part.item}
            gap={3}
            align="baseline"
            wrap="wrap"
            py={1}
            borderTopWidth="1px"
            borderColor="border.subtle"
          >
            <Text fontSize="13.5px" w="170px" flex="none" truncate>
              {part.name}
            </Text>
            <Mono fontSize="12px" w="118px" flex="none" textAlign="end">
              {Math.round(part.toMake).toLocaleString()} to make
            </Mono>
            <Text fontSize="12.5px" color="fg.muted">
              {part.delivered.toLocaleString()} of {part.required.toLocaleString()} delivered
              {part.stored > 0 ? `, ${part.stored.toLocaleString()} built and in a box` : ''} ·
              making {rate(part.ratePerMinute)}/min
            </Text>
          </Flex>
        ))}
      </Box>

      <Flex mt={3} gap={3} align="center" wrap="wrap">
        <Button
          size="sm"
          borderRadius="0"
          bg={already ? 'steel.100' : 'accent.solid'}
          color={already ? 'steel.500' : 'accent.contrast'}
          fontFamily="mono"
          fontSize="11.5px"
          letterSpacing="0.1em"
          textTransform="uppercase"
          _hover={{ filter: 'brightness(1.08)' }}
          onClick={() => dispatch({ type: 'setTargets', targets: [...plan.targets] })}
        >
          {already ? 'Plan it again' : 'Plan this'}
        </Button>
        <Text fontSize="12.5px" color="fg.muted">
          {plan.targets.map((target) => `${target.ratePerMinute}/min`).join(' · ')} — every part
          lands together, in about {duration(plan.minutes)}.
        </Text>
      </Flex>
    </Panel>
  );
}

/** "50 min", "1h 20m" — how long a stock covers what the plan eats. */
function coverage(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/* ----------------------------------------------------------- build order */

/**
 * What to build first, and what is not worth building yet.
 *
 * "21 still to build" is a number, not a plan. A Steel Beam constructor placed
 * before anything makes steel is twenty minutes spent on a machine that will
 * sit idle, and the board knew that and never said it.
 */
export function BuildOrder({ steps }: { steps: readonly BuildStep[] }) {
  const ready = steps.filter((step) => step.ready);
  const blocked = steps.filter((step) => !step.ready);

  const rows = (list: readonly BuildStep[], from: number) =>
    list.map((step, index) => (
      <Flex
        key={step.recipe}
        gap={3}
        align="baseline"
        wrap="wrap"
        py={1.5}
        borderTopWidth={index === 0 ? '0' : '1px'}
        borderColor="border.subtle"
      >
        <Mono fontSize="11px" color="fg.subtle" w="18px" flex="none" textAlign="end">
          {from + index + 1}
        </Mono>
        <Text fontSize="14px" fontWeight="600" w="180px" flex="none" truncate>
          {step.name}
        </Text>
        <Mono fontSize="12px" color="fg.muted" w="150px" flex="none">
          {step.count}× {step.machine}
        </Mono>
        <Text fontSize="12.5px" lineHeight="1.45" color="fg.muted">
          {step.ready
            ? step.unlocks.length > 0
              ? `Unblocks ${step.unlocks.join(', ')}.`
              : 'Nothing is waiting on it.'
            : `Waiting on ${step.blockedBy.join(' and ')}.`}
        </Text>
      </Flex>
    ));

  return (
    <Panel px={5} py={4}>
      <Flex gap={2} align="baseline" wrap="wrap" mb={2}>
        <Label color="fg">Build now</Label>
        <Text fontSize="12.5px" color="fg.muted">
          everything these eat already arrives from somewhere
        </Text>
      </Flex>
      {ready.length > 0 ? (
        rows(ready, 0)
      ) : (
        <Text fontSize="13.5px" color="fg.subtle">
          Nothing can be built yet — every step is waiting on another.
        </Text>
      )}

      {blocked.length > 0 ? (
        <Box mt={5} pt={3} borderTopWidth="1px" borderColor="border.default">
          <Flex gap={2} align="baseline" wrap="wrap" mb={2}>
            <Label color="fg">Not yet</Label>
            <Text fontSize="12.5px" color="fg.muted">
              nothing makes what these eat, so they would stand idle
            </Text>
          </Flex>
          {rows(blocked, ready.length)}
        </Box>
      ) : null}
    </Panel>
  );
}

/* ----------------------------------------------------------------- power */

/**
 * Whether the lights stay on once the plan is built, what to build if they
 * would not, and what keeping them on costs a minute.
 *
 * The board had the first half and never added it up: the Planner knew its plan
 * draws 344 MW, the Overview knew the base draws 188 MW of the 550 MW standing,
 * and the one question a plan of that size raises had no answer anywhere on the
 * page. It then told anyone who went over to *"build generators"* without
 * knowing what a generator is, and charged nothing at all for the coal they eat
 * — which on the reference save is another 69/min on top of the plan's own 124.
 */
export function PlanPowerPanel({ db, power }: { db: GameDatabase; power: PlanPower }) {
  const share = power.capacityMW > 0 ? power.afterMW / power.capacityMW : 0;
  const tone = power.over.length > 0 ? 'crit' : share > 0.9 ? 'warn' : 'ok';

  return (
    <Panel px={5} py={4}>
      <Flex gap={7} wrap="wrap" align="flex-end">
        {[
          ['Drawn now', `${Math.round(power.nowMW)} MW`],
          [
            `This plan adds`,
            `+${Math.round(power.addedMW)} MW`,
            `${power.machines} machine${power.machines === 1 ? '' : 's'} left to build`,
          ],
          [
            'Then',
            `${Math.round(power.afterMW)} MW`,
            `of ${Math.round(power.capacityMW)} MW built`,
          ],
        ].map(([label, value, note]) => (
          <Box key={label}>
            <Label display="block">{label}</Label>
            <Mono fontSize="23px" fontWeight="600" lineHeight="1.15">
              {value}
            </Mono>
            {note ? (
              <Text fontFamily="mono" fontSize="10.5px" color="fg.subtle">
                {note}
              </Text>
            ) : null}
          </Box>
        ))}
        <Box flex="1" minW="180px" alignSelf="center">
          {/* The bar carries the state; every number here stays in text ink. */}
          <Meter value={Math.min(1, share)} tone={tone} />
        </Box>
      </Flex>

      <Box mt={3.5} borderTopWidth="1px" borderColor="border.subtle" pt={3}>
        {power.grids.map((grid) => (
          <Flex key={grid.id} gap={3} align="center" py={0.5} wrap="wrap">
            <Text fontSize="13px" w="70px" flex="none">
              Grid {grid.id}
            </Text>
            <Box flex="1" minW="120px">
              <Meter
                value={grid.capacityMW > 0 ? Math.min(1, grid.afterMW / grid.capacityMW) : 1}
                tone={
                  grid.over
                    ? 'crit'
                    : grid.afterMW / Math.max(1, grid.capacityMW) > 0.9
                      ? 'warn'
                      : 'ok'
                }
              />
            </Box>
            <Mono fontSize="11.5px" color="fg.muted" w="132px" textAlign="end" flex="none">
              {Math.round(grid.afterMW)} / {Math.round(grid.capacityMW)} MW
            </Mono>
            <Mono fontSize="11px" color="fg.subtle" w="78px" flex="none">
              {grid.addedMW > 0 ? `+${Math.round(grid.addedMW)} MW` : '—'}
            </Mono>
          </Flex>
        ))}
      </Box>

      {power.over.map((grid) => (
        <Box key={grid.id} mt={3.5} pt={3} borderTopWidth="1px" borderColor="border.default">
          <Flex gap={2} align="baseline" wrap="wrap" mb={1.5}>
            <Label color="fg">
              Grid {grid.id} is {Math.round(grid.afterMW - grid.capacityMW)} MW short
            </Label>
            <Text fontSize="12.5px" color="fg.muted">
              {grid.cover.length > 0
                ? 'build one of these there · the fuel is what carrying the gap costs'
                : 'and nothing in the database says what would cover it'}
            </Text>
          </Flex>
          {grid.cover.slice(0, 3).map((cover) => (
            <Flex key={cover.generator} gap={3} align="baseline" wrap="wrap" py={0.5}>
              <Mono fontSize="12px" w="34px" flex="none" textAlign="end">
                {cover.count} ×
              </Mono>
              <Text fontSize="13px" w="190px" flex="none" truncate>
                {cover.generatorName}
              </Text>
              <Mono fontSize="11.5px" color="fg.muted" w="72px" flex="none" textAlign="end">
                {cover.capacityMW} MW
              </Mono>
              <Mono fontSize="11.5px" color="fg.subtle">
                {rate(cover.fuelPerMinute)}
                {unit(db, cover.fuel)} {itemName(db, cover.fuel)}
                {cover.supplemental
                  ? ` · ${rate(cover.supplemental.ratePerMinute)}${unit(db, cover.supplemental.item)} ${itemName(db, cover.supplemental.item)}`
                  : ''}
                {cover.byproduct
                  ? ` · ${rate(cover.byproduct.ratePerMinute)}${unit(db, cover.byproduct.item)} ${itemName(db, cover.byproduct.item)} back`
                  : ''}
              </Mono>
            </Flex>
          ))}
        </Box>
      ))}

      {power.fuel.length > 0 ? (
        <Box mt={3.5} pt={3} borderTopWidth="1px" borderColor="border.default">
          <Flex gap={2} align="baseline" wrap="wrap" mb={1.5}>
            <Label color="fg">And feeding it</Label>
            <Text fontSize="12.5px" color="fg.muted">
              what the generators burn to hold that draw
            </Text>
          </Flex>
          {[...power.fuel, ...power.byproducts].map((line) => {
            const back = power.byproducts.includes(line);
            return (
              <Flex key={line.item} gap={3} align="baseline" wrap="wrap" py={0.5}>
                <Text fontSize="13px" w="150px" flex="none" truncate>
                  {itemName(db, line.item)}
                  {back ? ' back' : ''}
                </Text>
                <Mono fontSize="11.5px" color="fg.muted" w="96px" flex="none" textAlign="end">
                  {rate(line.nowPerMinute)}
                  {unit(db, line.item)}
                </Mono>
                <Mono fontSize="11.5px" color="fg.subtle" w="14px" flex="none" textAlign="center">
                  →
                </Mono>
                <Mono fontSize="11.5px" w="96px" flex="none" textAlign="end">
                  {rate(line.afterPerMinute)}
                  {unit(db, line.item)}
                </Mono>
              </Flex>
            );
          })}
        </Box>
      ) : null}

      <Text fontSize="12.5px" lineHeight="1.5" color="fg.muted" mt={3}>
        {power.over.length > 0
          ? `Grid ${power.over.map((grid) => grid.id).join(' and ')} would be asked for more than ${power.over.length === 1 ? 'it can' : 'they can'} supply, and the whole circuit stops when that happens — not the machines you added last. `
          : `New machines are charged to the grid their recipe already runs on, and to the largest grid where nothing runs it yet. Satisfactory does not blend circuits, so a base can sit at 70% overall with one grid over its own limit. `}
        {power.fuel.length > 0
          ? `Generators throttle to what is drawn from them and burn fuel in proportion, so the fuel above is the running cost of the megawatts, not of the generators — and none of it appears in the plan's own inputs.`
          : ''}
        {power.unpricedMW > 0
          ? ` About ${Math.round(power.unpricedMW)} MW of what is drawn today comes from generators the database cannot price, so the fuel is a floor rather than the whole bill.`
          : ''}
      </Text>
    </Panel>
  );
}

/* ------------------------------------------------------------------ dropzone */

export function SaveDropzone() {
  const { status } = useBoard();
  const loadSave = useSaveLoader();
  const [hot, setHot] = useState(false);

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setHot(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void loadSave(file);
  };

  const failed = status.kind === 'failed';

  return (
    <Box
      borderWidth="2px"
      borderStyle="dashed"
      borderColor={hot ? 'accent.solid' : 'border.default'}
      bg={hot ? 'accent.subtle' : 'bg.surface'}
      px={6}
      py={8}
      textAlign="center"
      onDragOver={(event) => {
        event.preventDefault();
        setHot(true);
      }}
      onDragLeave={() => setHot(false)}
      onDrop={onDrop}
    >
      <Heading
        as="h3"
        fontFamily="heading"
        fontWeight="600"
        fontSize="21px"
        textTransform="uppercase"
        letterSpacing="0.03em"
        mb={1.5}
        color={failed ? 'status.crit' : undefined}
      >
        {status.kind === 'parsing'
          ? `Parsing ${status.fileName}…`
          : failed
            ? "That file couldn't be read"
            : 'Drop a .sav here'}
      </Heading>
      <Text maxW="56ch" mx="auto" color="fg.muted" fontSize="14px">
        {failed
          ? `${status.message} Saves from Update 5 and older aren't supported — otherwise try a different autosave slot.`
          : 'Parsed entirely in this browser tab; nothing is uploaded anywhere. Look in %LOCALAPPDATA%\\FactoryGame\\Saved\\SaveGames\\ — autosaves are usually freshest.'}
      </Text>
    </Box>
  );
}

/* -------------------------------------------------------------- target editor */

export function TargetEditor({ db }: { db: GameDatabase }) {
  const { targets, dispatch, addTarget, snapshot, zoneNames, zoneAssignments } = useBoard();
  const [query, setQuery] = useState('');
  const [amount, setAmount] = useState('5');

  /*
   * A target can be pointed at a zone, which is what turns "six more smelters"
   * into an instruction. The zones come from the loaded save, so without one
   * there is nowhere to point at and the control does not appear.
   */
  const zones = useMemo(
    () => (snapshot ? buildZoneBoard(db, snapshot, zoneNames).zones : []),
    [db, snapshot, zoneNames],
  );

  const options = Object.values(db.items)
    .filter((item) => !item.isRaw)
    .filter((item) =>
      Object.values(db.recipes).some((r) => r.outputs.some((o) => o.item === item.id)),
    )
    .sort((a, b) => a.name.localeCompare(b.name));

  const submit = () => {
    const wanted = query.trim().toLowerCase();
    const match =
      options.find((item) => item.name.toLowerCase() === wanted) ??
      options.find((item) => item.name.toLowerCase().startsWith(wanted));
    const value = Number.parseFloat(amount);
    if (!match || !Number.isFinite(value) || value <= 0) return;
    addTarget(match.id, value);
    setQuery('');
  };

  return (
    <>
      <Panel px={4} py={3.5}>
        <Flex gap={2.5} wrap="wrap" align="flex-end">
          <Box>
            <Label display="block" mb={1}>
              Item
            </Label>
            <Field
              list="fb-items"
              minW="250px"
              placeholder="Start typing… e.g. Smart Plating"
              autoComplete="off"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  submit();
                }
              }}
            />
            <datalist id="fb-items">
              {options.map((item) => (
                <option key={item.id} value={item.name} />
              ))}
            </datalist>
          </Box>
          <Box>
            <Label display="block" mb={1}>
              Rate / min
            </Label>
            <Field
              type="number"
              min="0.1"
              step="0.5"
              w="104px"
              textAlign="end"
              fontFamily="mono"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </Box>
          <Button
            size="sm"
            borderRadius="0"
            bg="accent.solid"
            color="accent.contrast"
            fontFamily="mono"
            fontSize="11.5px"
            letterSpacing="0.1em"
            textTransform="uppercase"
            _hover={{ filter: 'brightness(1.08)' }}
            onClick={submit}
          >
            Add target
          </Button>
        </Flex>
      </Panel>

      <Flex gap={2} mt={3} wrap="wrap" align="center">
        <Label>Presets</Label>
        {PRESETS.map((preset) => (
          <Button
            key={preset.id}
            size="xs"
            borderRadius="0"
            variant="outline"
            bg="steel.100"
            borderColor="steel.100"
            color="steel.500"
            fontFamily="mono"
            fontSize="11.5px"
            _hover={{ borderColor: 'steel.500' }}
            onClick={() => dispatch({ type: 'setTargets', targets: [...preset.targets] })}
          >
            {preset.label}
          </Button>
        ))}
        <Button
          size="xs"
          borderRadius="0"
          variant="outline"
          borderColor="border.default"
          color="fg.muted"
          fontFamily="mono"
          fontSize="11.5px"
          onClick={() => dispatch({ type: 'clearPlan' })}
        >
          Clear all
        </Button>
      </Flex>

      <Box mt={3.5} borderWidth="1px" borderColor="border.default">
        {targets.length === 0 ? (
          <Box bg="bg.surface" px={4} py={2.5}>
            <Text color="fg.subtle" fontSize="14px">
              Nothing targeted yet.
            </Text>
          </Box>
        ) : (
          targets.map((target, index) => (
            <Flex
              key={target.item}
              bg="bg.surface"
              align="center"
              gap={3.5}
              px={4}
              py={2.5}
              borderBottomWidth={index < targets.length - 1 ? '1px' : '0'}
              borderColor="border.subtle"
              wrap="wrap"
            >
              <Text flex="1" minW="150px" fontWeight="600">
                {itemName(db, target.item)}
              </Text>
              <Field
                type="number"
                min="0.1"
                step="0.5"
                w="92px"
                textAlign="end"
                fontFamily="mono"
                py={1}
                value={target.ratePerMinute}
                aria-label={`Rate for ${itemName(db, target.item)}`}
                onChange={(event) => {
                  const value = Number.parseFloat(event.target.value);
                  if (Number.isFinite(value) && value > 0) {
                    dispatch({ type: 'setRate', index, ratePerMinute: value });
                  }
                }}
              />
              <Label>/ min</Label>
              {zones.length > 0 ? (
                <Flex align="center" gap={2}>
                  <Label>built in</Label>
                  <Select
                    w="176px"
                    py={1.5}
                    aria-label={`Zone for ${itemName(db, target.item)}`}
                    value={zoneAt(zones, zoneAssignments[target.item])?.slug ?? ''}
                    onChange={(event) => {
                      const zone = zones.find((candidate) => candidate.slug === event.target.value);
                      dispatch({ type: 'assignZone', item: target.item, at: zone?.at ?? null });
                    }}
                  >
                    <option value="">anywhere</option>
                    {zones.map((zone) => (
                      <option key={zone.id} value={zone.slug}>
                        {zone.name}
                      </option>
                    ))}
                  </Select>
                </Flex>
              ) : null}
              <Button
                size="xs"
                variant="ghost"
                color="fg.subtle"
                _hover={{ color: 'status.crit' }}
                aria-label={`Remove ${itemName(db, target.item)}`}
                onClick={() => dispatch({ type: 'removeTarget', index })}
              >
                ×
              </Button>
            </Flex>
          ))
        )}
      </Box>
    </>
  );
}

/* -------------------------------------------------------------------- summary */

export function Summary({
  result,
  snapshot,
  actualPowerMW,
  actualMachines,
  targetCount,
}: {
  result: SolveResult;
  snapshot: WorldSnapshot | null;
  actualPowerMW: number;
  actualMachines: number;
  targetCount: number;
}) {
  const stats: Array<[string, string]> = [
    ['Planned machines', String(result.totalMachines)],
    ['Planned power', `${Math.round(result.totalPowerMW)} MW`],
    ['Production lines', String(result.lines.length)],
    ['Targets', String(targetCount)],
  ];
  if (snapshot) {
    /*
     * Counted per line, not as one total minus another.
     *
     * `totalMachines - actualMachines` credits every machine standing in the
     * world, including the ones the plan never asked for — a Solid Biofuel
     * constructor and a Concrete constructor made the reference save's plan look
     * two machines closer to done than it was, and disagreed with the power
     * panel below it about how much was left.
     */
    const toBuild = result.lines.reduce(
      (total, line) =>
        total + Math.max(0, line.machinesToBuild - (snapshot.lines[line.recipe]?.count ?? 0)),
      0,
    );
    stats.push(['Built machines', String(actualMachines)]);
    stats.push(['Built power', `${Math.round(actualPowerMW)} MW`]);
    stats.push(['Still to build', String(toBuild)]);
  }

  return (
    <Grid
      templateColumns="repeat(auto-fit, minmax(146px, 1fr))"
      gap="1px"
      bg="border.default"
      borderWidth="1px"
      borderColor="border.default"
    >
      {stats.map(([label, value]) => (
        <Box key={label} bg="bg.surface" px={4} py={3}>
          <Label display="block">{label}</Label>
          <Text
            fontFamily="heading"
            fontWeight="700"
            fontSize="31px"
            lineHeight="1.05"
            fontVariantNumeric="tabular-nums"
            mt={0.5}
          >
            {value}
          </Text>
        </Box>
      ))}
    </Grid>
  );
}

/* -------------------------------------------------------------------- balance */

export function Balance({
  db,
  result,
  stored,
}: {
  db: GameDatabase;
  result: SolveResult;
  /** What is standing in containers, so the plan can credit it. */
  stored?: Readonly<Record<string, number>> | undefined;
}) {
  const raw = Object.entries(result.rawInputs).sort((a, b) => b[1] - a[1]);
  const surplus = Object.entries(result.surplus).sort((a, b) => b[1] - a[1]);

  /*
   * What the warehouse already covers.
   *
   * A plan is a rate and a stock is a quantity, so the two cannot simply be
   * subtracted — but dividing one by the other gives the honest answer, which
   * is *time*: five thousand iron rods against a plan that eats a hundred a
   * minute is fifty minutes the plan does not have to make. That is the
   * difference between "build all this" and "build all this, but you have an
   * hour of it already".
   */
  const covered = Object.entries(stored ?? {})
    .map(([item, held]) => {
      const perMinute = result.consumed[item] ?? 0;
      return { item, held, perMinute, minutes: perMinute > 0 ? held / perMinute : 0 };
    })
    .filter((row) => row.minutes >= 1)
    .sort((a, b) => b.minutes - a.minutes);

  if (raw.length === 0 && surplus.length === 0) {
    return (
      <Text color="fg.subtle" fontSize="14px" py={4}>
        Nothing to balance yet.
      </Text>
    );
  }

  return (
    <>
      {covered.length > 0 ? (
        <TableFrame>
          <thead>
            <tr>
              <Th>Already in a container</Th>
              <Th style={{ textAlign: 'end' }}>Held</Th>
              <Th style={{ textAlign: 'end' }}>The plan eats</Th>
              <Th style={{ textAlign: 'end' }}>Covers</Th>
            </tr>
          </thead>
          <tbody>
            {covered.map((row) => (
              <tr key={row.item}>
                <Td>{itemName(db, row.item)}</Td>
                <NumTd>{Math.round(row.held).toLocaleString()}</NumTd>
                <NumTd>
                  {rate(row.perMinute)} {unit(db, row.item)}
                </NumTd>
                <NumTd>{coverage(row.minutes)}</NumTd>
              </tr>
            ))}
          </tbody>
        </TableFrame>
      ) : null}

      {raw.length > 0 ? (
        <TableFrame>
          <thead>
            <tr>
              <Th>Raw input required</Th>
              <Th style={{ textAlign: 'end' }}>Rate</Th>
              <Th style={{ textAlign: 'end' }}>Mk.1 miners</Th>
            </tr>
          </thead>
          <tbody>
            {raw.map(([item, value]) => (
              <tr key={item}>
                <Td>{itemName(db, item)}</Td>
                <NumTd>
                  {rate(value)}
                  {unit(db, item)}
                </NumTd>
                <NumTd color="fg.subtle">
                  {db.items[item]?.isFluid ? '—' : `${rate(value / 60, 2)} nodes`}
                </NumTd>
              </tr>
            ))}
          </tbody>
        </TableFrame>
      ) : null}

      {surplus.length > 0 ? (
        <Box mt={3.5}>
          <TableFrame>
            <thead>
              <tr>
                <Th>Surplus / byproduct</Th>
                <Th style={{ textAlign: 'end' }}>Net</Th>
              </tr>
            </thead>
            <tbody>
              {surplus.map(([item, value]) => (
                <tr key={item}>
                  <Td>{itemName(db, item)}</Td>
                  <NumTd>
                    {rate(value)}
                    {unit(db, item)}
                  </NumTd>
                </tr>
              ))}
            </tbody>
          </TableFrame>
        </Box>
      ) : null}

      <Text fontSize="13px" color="fg.subtle" mt={2.5}>
        Node counts assume a Mk.1 miner on a normal node (60/min). Byproducts are listed as surplus
        but not credited back into the plan — feed them somewhere or sink them.
      </Text>
    </>
  );
}

/* ------------------------------------------------------------------- progress */

export function Progress({ db, snapshot }: { db: GameDatabase; snapshot: WorldSnapshot }) {
  const researched = new Set(snapshot.milestones);
  const milestones = Object.values(db.milestones).sort(
    (a, b) => a.tier - b.tier || a.name.localeCompare(b.name),
  );
  const phase = snapshot.phase;
  const definition = phase?.target ? PHASES[phase.target] : undefined;
  const quotaItems = definition
    ? Object.keys(definition.requires)
    : Object.keys(phase?.delivered ?? {});

  return (
    <>
      {phase?.target ? (
        <Panel px={4.5} py={4} mb={3.5}>
          <Heading
            as="h3"
            fontFamily="heading"
            fontWeight="600"
            fontSize="20px"
            textTransform="uppercase"
            letterSpacing="0.02em"
            mb={2.5}
          >
            Space Elevator · {definition?.label ?? phase.target.replace(/GP_Project_Assembly_/, '')}
          </Heading>
          {quotaItems.length === 0 ? (
            <Text color="fg.subtle" fontSize="14px">
              Nothing delivered yet.
            </Text>
          ) : (
            quotaItems.map((item) => {
              const have = phase.delivered[item] ?? 0;
              const need = definition?.requires[item];
              return (
                <Flex key={item} align="center" gap={3} mb={2}>
                  <Text w="170px" fontSize="14px">
                    {itemName(db, item)}
                  </Text>
                  <Box flex="1" minW="80px" h="14px" bg="bg.muted" position="relative">
                    <Box
                      position="absolute"
                      top="0"
                      bottom="0"
                      left="0"
                      bg="accent.solid"
                      width={`${need ? Math.min(100, (have / need) * 100) : 0}%`}
                    />
                  </Box>
                  <Mono fontSize="12.5px" w="88px" textAlign="end">
                    {have}
                    {need ? ` / ${need}` : ''}
                  </Mono>
                </Flex>
              );
            })
          )}
          {!definition ? (
            <Text fontSize="13px" color="fg.subtle" mt={1}>
              The quota for this phase isn&apos;t bundled — showing delivered amounts only.
            </Text>
          ) : null}
        </Panel>
      ) : null}

      <Grid
        templateColumns="repeat(auto-fill, minmax(230px, 1fr))"
        gap="1px"
        bg="border.default"
        borderWidth="1px"
        borderColor="border.default"
      >
        {milestones.map((milestone) => {
          const done = researched.has(milestone.id);
          return (
            <Flex key={milestone.id} bg="bg.surface" px={3.5} py={2.5} gap={3} align="flex-start">
              <Flex
                w="15px"
                h="15px"
                flex="none"
                mt="3px"
                borderWidth="1.5px"
                borderColor={done ? 'status.ok' : 'border.default'}
                bg={done ? 'status.ok' : 'transparent'}
                color="bg.surface"
                align="center"
                justify="center"
                fontSize="11px"
                lineHeight="1"
              >
                {done ? '✓' : ''}
              </Flex>
              <Box>
                <Text
                  fontWeight="500"
                  fontSize="14px"
                  lineHeight="1.3"
                  color={done ? 'fg.subtle' : undefined}
                >
                  T{milestone.tier} · {milestone.name}
                </Text>
                <Text fontFamily="mono" fontSize="10.5px" color="fg.subtle" mt={0.5}>
                  {milestone.cost.map((c) => `${c.amount}× ${itemName(db, c.item)}`).join(' · ') ||
                    '—'}
                </Text>
              </Box>
            </Flex>
          );
        })}
      </Grid>

      <Text fontSize="13px" color="fg.subtle" mt={2.5}>
        {/* Count the intersection, not the raw set: a save's purchased
            schematics also include tutorials and customiser unlocks, which are
            not milestones and would inflate this past the denominator. */}
        {milestones.filter((milestone) => researched.has(milestone.id)).length} of{' '}
        {milestones.length} milestones researched. Costs come straight from your installed game
        files.
      </Text>
    </>
  );
}
