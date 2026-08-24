'use client';

import { Box, Button, Flex, Grid, Heading, Text } from '@chakra-ui/react';
import type { GameDatabase, SolveResult } from '@factory-board/planner';
import type { WorldSnapshot } from '@factory-board/save-reader';
import { useState, type DragEvent } from 'react';
import { itemName, rate, unit } from '@/lib/format';
import { PHASES, PRESETS } from '@/lib/phases';
import { useBoard } from '@/state/board';
import { useSaveLoader } from '@/hooks/use-save-loader';
import { Field, Label, Mono, NumTd, Panel, Td, TableFrame, Th } from './primitives';

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
  const { targets, dispatch, addTarget } = useBoard();
  const [query, setQuery] = useState('');
  const [amount, setAmount] = useState('5');

  const options = Object.values(db.items)
    .filter((item) => !item.isRaw)
    .filter((item) => Object.values(db.recipes).some((r) => r.outputs.some((o) => o.item === item.id)))
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
    stats.push(['Built machines', String(actualMachines)]);
    stats.push(['Built power', `${Math.round(actualPowerMW)} MW`]);
    stats.push([
      'Still to build',
      String(Math.max(0, result.totalMachines - actualMachines)),
    ]);
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

export function Balance({ db, result }: { db: GameDatabase; result: SolveResult }) {
  const raw = Object.entries(result.rawInputs).sort((a, b) => b[1] - a[1]);
  const surplus = Object.entries(result.surplus).sort((a, b) => b[1] - a[1]);

  if (raw.length === 0 && surplus.length === 0) {
    return (
      <Text color="fg.subtle" fontSize="14px" py={4}>
        Nothing to balance yet.
      </Text>
    );
  }

  return (
    <>
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
        Node counts assume a Mk.1 miner on a normal node (60/min). Byproducts are listed as
        surplus but not credited back into the plan — feed them somewhere or sink them.
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
                <Text fontWeight="500" fontSize="14px" lineHeight="1.3" color={done ? 'fg.subtle' : undefined}>
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
        {researched.size} of {milestones.length} milestones researched. Costs come straight from
        your installed game files.
      </Text>
    </>
  );
}
