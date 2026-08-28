'use client';

import { Box, Flex, Grid, Text } from '@chakra-ui/react';
import { solve } from '@factory-board/planner';
import Link from 'next/link';
import { useMemo } from 'react';
import {
  BarRow,
  ChartFrame,
  LegendKey,
  MeterRow,
  StatRow,
  StatTile,
  uptimeTone,
} from '@/components/charts';
import { SaveDropzone } from '@/components/panels';
import { Label, SectionHeading } from '@/components/primitives';
import { diagnose, explain } from '@/lib/diagnose';
import { itemName, machineName, machineRank, playTime, rate } from '@/lib/format';
import { PHASES } from '@/lib/phases';
import { gameDatabase as db } from '@/lib/game-database';
import { useBoard } from '@/state/board';

/**
 * What each verdict is called on screen.
 *
 * "Starving" used to be printed against every line between 60% and 95%, which
 * was a guess: on the reference save the two largest lines were the opposite,
 * and building what the label implied would have made them worse.
 */
const VERDICT: Record<string, string> = {
  blocked: 'Backed up',
  starving: 'Starving',
  unexplained: 'No reason found',
};

export default function OverviewPage() {
  const { snapshot, targets, recipeChoices } = useBoard();

  const plan = useMemo(() => solve(db, targets, { recipeChoices }), [targets, recipeChoices]);

  const view = useMemo(() => {
    if (!snapshot) return null;
    const lines = Object.values(snapshot.lines);

    let machines = 0;
    let powerMW = 0;
    let uptimeWeighted = 0;
    let uptimeWeight = 0;
    const powerByMachine = new Map<string, number>();
    const countByMachine = new Map<string, number>();

    for (const line of lines) {
      const draw = (db.machines[line.machine]?.powerMW ?? 0) * line.count;
      machines += line.count;
      powerMW += draw;
      powerByMachine.set(line.machine, (powerByMachine.get(line.machine) ?? 0) + draw);
      countByMachine.set(line.machine, (countByMachine.get(line.machine) ?? 0) + line.count);
      if (line.uptime !== null) {
        uptimeWeighted += line.uptime * line.count;
        uptimeWeight += line.count;
      }
    }

    const named = (recipeId: string) => {
      const recipe = db.recipes[recipeId];
      const product = recipe?.outputs[0]?.item;
      return product ? itemName(db, product) : (recipe?.name ?? recipeId);
    };

    /*
     * Uptime says how much; the machine's own buffers say why. A line at 67%
     * with a full output buffer is backed up, not starving, and the two want
     * opposite fixes — see `lib/diagnose`.
     */
    const verdicts = new Map(diagnose(db, snapshot).map((line) => [line.recipe, line]));
    const bottlenecks = lines
      .filter((line) => line.uptime !== null)
      .sort((a, b) => (a.uptime ?? 1) - (b.uptime ?? 1))
      .map((line) => {
        const verdict = verdicts.get(line.recipe);
        return {
          ...line,
          name: named(line.recipe),
          verdict: verdict?.verdict ?? 'unmeasured',
          why: verdict ? explain(verdict) : null,
        };
      });

    const starved = bottlenecks.filter((line) => (line.uptime ?? 1) < 0.95).length;
    const blocked = bottlenecks.filter((line) => line.verdict === 'blocked').length;

    // Only count machines the plan and the world both know about.
    const plannedByMachine = new Map<string, number>();
    for (const line of plan.lines) {
      plannedByMachine.set(
        line.machine,
        (plannedByMachine.get(line.machine) ?? 0) + line.machinesToBuild,
      );
    }
    const progress = [...new Set([...plannedByMachine.keys(), ...countByMachine.keys()])]
      .map((machine) => ({
        machine,
        built: countByMachine.get(machine) ?? 0,
        planned: plannedByMachine.get(machine) ?? 0,
      }))
      .filter((row) => row.planned > 0)
      .sort((a, b) => machineRank(a.machine) - machineRank(b.machine));

    const infrastructure = Object.entries(snapshot.buildings)
      .filter(([id]) => !db.machines[id])
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);

    const phaseDef = snapshot.phase?.target ? PHASES[snapshot.phase.target] : undefined;

    /*
     * Parts the elevator wants that are sitting in a container instead. The
     * board had every number for this and never put them side by side: on the
     * reference save 34 Smart Plating were built and 0 delivered, which reads
     * as "nothing made yet" until you see the stock.
     */
    const undelivered = Object.entries(phaseDef?.requires ?? {})
      .map(([item]) => ({ item, held: snapshot.stored[item] ?? 0 }))
      .filter((row) => row.held > 0);

    /*
     * A burner with nothing left to burn. The map already shows the coal plant
     * amber; this says which generator and how empty, which is the difference
     * between "fuel problem somewhere" and a place to walk to.
     */
    const dryGenerators = snapshot.placements
      .map((placement, index) => ({ placement, index }))
      .filter(({ placement }) => placement.role === 'power' && (placement.fuel ?? 0) === 0);

    return {
      machines,
      powerMW,
      avgUptime: uptimeWeight > 0 ? uptimeWeighted / uptimeWeight : null,
      bottlenecks,
      starved,
      blocked,
      powerByMachine: [...powerByMachine.entries()].sort((a, b) => b[1] - a[1]),
      countByMachine: [...countByMachine.entries()].sort((a, b) => b[1] - a[1]),
      progress,
      infrastructure,
      phaseDef,
      undelivered,
      dryGenerators,
      lineCount: lines.length,
    };
  }, [snapshot, plan]);

  if (!snapshot || !view) {
    return (
      <>
        <SectionHeading title="Overview" note="no save loaded" />
        <SaveDropzone />
        <Text color="fg.muted" fontSize="14px" mt={4} maxW="68ch">
          Point <Box as="code">SATISFACTORY_SAVE</Box> at a file in{' '}
          <Box as="code">apps/web/.env.local</Box> and it opens here automatically — and stays
          current, because <Box as="code">npm run dev</Box> re-reads it every time the game
          autosaves.
        </Text>
      </>
    );
  }

  const maxPower = Math.max(...view.powerByMachine.map(([, mw]) => mw), 1);
  const maxCount = Math.max(...view.countByMachine.map(([, n]) => n), 1);
  const maxInfra = Math.max(...view.infrastructure.map(([, n]) => n), 1);

  return (
    <>
      <SectionHeading
        title="Overview"
        note={`${snapshot.sessionName} · ${playTime(snapshot.playDurationSeconds)} played`}
      />

      <StatRow>
        <StatTile
          label="Machines running"
          value={view.machines}
          sub={`${view.lineCount} production lines`}
        />
        <StatTile label="Power draw" value={`${Math.round(view.powerMW)} MW`} sub="at 100% clock" />
        <StatTile
          label="Average uptime"
          value={view.avgUptime === null ? '—' : `${Math.round(view.avgUptime * 100)}%`}
          sub={
            view.starved > 0
              ? `${view.starved} line${view.starved === 1 ? '' : 's'} below 95%`
              : 'all lines healthy'
          }
          {...(view.avgUptime !== null ? { tone: uptimeTone(view.avgUptime) } : {})}
        />
        <StatTile
          label="Milestones"
          value={`${snapshot.milestones.filter((id) => db.milestones[id]).length}`}
          sub={`of ${Object.keys(db.milestones).length} researched`}
        />
        <StatTile
          label="Buildings placed"
          value={snapshot.objectCount}
          sub="every object in the save"
        />
      </StatRow>

      <Box mt={9}>
        <SectionHeading
          title="Bottlenecks"
          note={
            view.blocked > 0
              ? `worst first · ${view.blocked} backed up, not starving`
              : "worst first · why, read from each machine's own buffers"
          }
        />
        <ChartFrame
          title="Uptime by production line"
          note={`${view.bottlenecks.length} measured`}
          empty={
            view.bottlenecks.length === 0
              ? 'No line has been measured yet. Uptime appears once machines have run for a few minutes.'
              : undefined
          }
        >
          {view.bottlenecks.map((line) => (
            <Box key={line.recipe}>
              <BarRow
                name={line.name}
                value={line.uptime ?? 0}
                max={1}
                tone={uptimeTone(line.uptime ?? 0)}
                display={`${Math.round((line.uptime ?? 0) * 100)}% · ${line.count}×`}
                title={`${line.name}: ${Math.round((line.uptime ?? 0) * 100)}% uptime across ${line.count} ${machineName(db, line.machine)}`}
              />
              {line.why ? (
                /*
                 * The verdict is type, never colour: the warning step is 4.04:1
                 * on the light surface and text needs 4.5:1. The bar above
                 * carries the state; this says what it means.
                 */
                <Flex gap={2} mt={1} mb={1.5} ml="192px" align="baseline" wrap="wrap">
                  <Label flex="none" color="fg">
                    {VERDICT[line.verdict] ?? line.verdict}
                  </Label>
                  <Text fontSize="12.5px" lineHeight="1.45" color="fg.muted">
                    {line.why}
                  </Text>
                </Flex>
              ) : null}
            </Box>
          ))}
        </ChartFrame>
        <Flex gap={4} mt={2.5} wrap="wrap">
          <LegendKey tone="ok">95% and above</LegendKey>
          <LegendKey tone="warn">60–95%</LegendKey>
          <LegendKey tone="crit">below 60%</LegendKey>
        </Flex>
      </Box>

      <Grid mt={9} gap={4} alignItems="start" templateColumns={{ base: '1fr', lg: '1fr 1fr' }}>
        <ChartFrame
          title="Power draw"
          note={
            view.dryGenerators.length > 0
              ? `MW by machine type · ${view.dryGenerators.length} generator${view.dryGenerators.length === 1 ? '' : 's'} out of fuel`
              : 'MW by machine type'
          }
        >
          {view.powerByMachine.map(([machine, mw]) => (
            <BarRow
              key={machine}
              name={machineName(db, machine)}
              value={mw}
              max={maxPower}
              display={`${Math.round(mw)} MW`}
              nameWidth="150px"
            />
          ))}
        </ChartFrame>

        <ChartFrame title="Machines built" note="by type">
          {view.countByMachine.map(([machine, count]) => (
            <BarRow
              key={machine}
              name={machineName(db, machine)}
              value={count}
              max={maxCount}
              tone="steel"
              display={`${count}`}
              nameWidth="150px"
            />
          ))}
        </ChartFrame>
      </Grid>

      <Grid mt={4} gap={4} alignItems="start" templateColumns={{ base: '1fr', lg: '1fr 1fr' }}>
        <ChartFrame
          title="Against the plan"
          note="built / planned"
          empty={
            view.progress.length === 0
              ? 'No plan yet — set production targets in the Planner and this fills in.'
              : undefined
          }
        >
          {view.progress.map((row) => (
            <MeterRow
              key={row.machine}
              name={machineName(db, row.machine)}
              value={row.built}
              target={row.planned}
              nameWidth="150px"
            />
          ))}
        </ChartFrame>

        <ChartFrame title="Infrastructure" note="belts, poles, storage">
          {view.infrastructure.map(([id, count]) => (
            <BarRow
              key={id}
              name={id.replace(/([a-z])([A-Z])/g, '$1 $2')}
              value={count}
              max={maxInfra}
              tone="muted"
              display={`${count}`}
              nameWidth="150px"
            />
          ))}
        </ChartFrame>
      </Grid>

      {snapshot.phase?.target ? (
        <Box mt={9}>
          <SectionHeading
            title="Space Elevator"
            note={view.phaseDef?.label ?? snapshot.phase.target.replace(/GP_Project_Assembly_/, '')}
          />
          <ChartFrame title="Delivery" note="parts sent to the elevator">
            {(view.phaseDef
              ? Object.entries(view.phaseDef.requires)
              : Object.entries(snapshot.phase.delivered)
            ).map(([item, required]) => (
              <MeterRow
                key={item}
                name={itemName(db, item)}
                value={snapshot.phase?.delivered[item] ?? 0}
                target={view.phaseDef ? required : (snapshot.phase?.delivered[item] ?? 0)}
              />
            ))}
          </ChartFrame>
          {view.undelivered.length > 0 ? (
            <Flex gap={2} mt={2.5} align="baseline" wrap="wrap">
              <Label flex="none" color="fg">
                In storage
              </Label>
              <Text fontSize="12.5px" lineHeight="1.45" color="fg.muted">
                {view.undelivered
                  .map((row) => `${row.held.toLocaleString()} ${itemName(db, row.item)}`)
                  .join(', ')}{' '}
                built and sitting in a container. The elevator only counts what is delivered to it.
              </Text>
            </Flex>
          ) : null}
        </Box>
      ) : null}

      <Flex mt={9} gap={3} wrap="wrap" align="center">
        <Label>Next</Label>
        <Box asChild color="steel.500" textDecoration="underline" fontSize="14px">
          <Link href="/plan">Set production targets →</Link>
        </Box>
        <Box asChild color="steel.500" textDecoration="underline" fontSize="14px">
          <Link href="/progress">See the milestone tree →</Link>
        </Box>
      </Flex>

      {plan.totalMachines > 0 ? (
        <Text mt={4} fontSize="14px" color="fg.muted">
          Your plan calls for {plan.totalMachines} machines drawing {Math.round(plan.totalPowerMW)}{' '}
          MW. You have {view.machines} built, needing{' '}
          {rate(Math.max(0, plan.totalMachines - view.machines), 0)} more.
        </Text>
      ) : null}
    </>
  );
}
