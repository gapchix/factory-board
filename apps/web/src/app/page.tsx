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
import { buildingName, itemName, machineName, machineRank, playTime, rate } from '@/lib/format';
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
    /*
     * What the base really draws, and what it can supply, from the save rather
     * than from the database. Totalling nominal draw per production line misses
     * everything without a recipe — miners, pumps, the radar tower — and on the
     * reference save that understated the real figure by a third: 125 MW
     * against 188.
     */
    const grids = snapshot.circuits.map((circuit) => ({
      ...circuit,
      load: circuit.capacityMW > 0 ? circuit.demandMW / circuit.capacityMW : Infinity,
    }));
    const demandMW = grids.reduce((total, grid) => total + grid.demandMW, 0);
    const capacityMW = grids.reduce((total, grid) => total + grid.capacityMW, 0);
    const overloaded = grids.filter((grid) => grid.demandMW > grid.capacityMW).length;

    /*
     * What is standing in containers, biggest first.
     *
     * A stock level is neither production nor consumption, and it is the only
     * figure that says which of the two is out of step: five thousand iron rods
     * in a box is what "backed up" looks like from the other side, and a line
     * starving on something the base holds a thousand of is a belt problem
     * wearing a supply problem's clothes.
     */
    const waitingFor = new Map(
      [...verdicts.values()]
        .filter((line) => line.verdict === 'starving' && line.shortage)
        .map((line) => [line.shortage!.item, named(line.recipe)]),
    );
    const backedUp = new Map(
      [...verdicts.values()]
        .filter((line) => line.verdict === 'blocked' && line.backlog)
        .map((line) => [line.backlog!.item, named(line.recipe)]),
    );
    const stored = Object.entries(snapshot.stored)
      .filter(([, count]) => count > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([item, count]) => ({
        item,
        count,
        wantedBy: waitingFor.get(item),
        pilingFrom: backedUp.get(item),
      }));
    const storedTotal = Object.values(snapshot.stored).reduce((sum, count) => sum + count, 0);
    const misrouted = stored.filter((row) => row.wantedBy).length;

    const dryGenerators = snapshot.placements
      .map((placement, index) => ({ placement, index }))
      .filter(({ placement }) => placement.role === 'power' && (placement.fuel ?? 0) === 0);

    /*
     * And what standing empty costs. The count alone says a burner needs
     * feeding; the megawatts say whether that is a walk across the base or the
     * reason a grid is browning out — one dry Coal-Powered Generator is 75 MW
     * built and not received.
     */
    const idleMW = dryGenerators.reduce(
      (total, { placement }) => total + (db.generators[placement.machine]?.powerMW ?? 0),
      0,
    );

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
      grids,
      stored,
      storedTotal,
      misrouted,
      demandMW,
      capacityMW,
      overloaded,
      undelivered,
      dryGenerators,
      idleMW,
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
        <StatTile
          label="Power drawn"
          value={`${Math.round(view.grids.length > 0 ? view.demandMW : view.powerMW)} MW`}
          sub={
            view.grids.length === 0
              ? 'at 100% clock'
              : view.overloaded > 0
                ? `${view.overloaded} grid${view.overloaded === 1 ? '' : 's'} over capacity`
                : `of ${Math.round(view.capacityMW)} MW built`
          }
        />
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
              ? `MW by machine type · ${view.dryGenerators.length} generator${view.dryGenerators.length === 1 ? '' : 's'} out of fuel${view.idleMW > 0 ? `, ${Math.round(view.idleMW)} MW idle` : ''}`
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

        {view.grids.length > 0 ? (
          <ChartFrame title="Power grids" note={`${view.grids.length} · drawn against built`}>
            {view.grids.map((grid) => (
              <MeterRow
                key={grid.id}
                name={`Grid ${grid.id} · ${grid.members.length} buildings`}
                value={Math.round(grid.demandMW)}
                target={Math.round(grid.capacityMW)}
                unit=" MW"
                nameWidth="190px"
              />
            ))}
          </ChartFrame>
        ) : null}

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

        <ChartFrame title="Infrastructure" note="belts, poles, storage">
          {view.infrastructure.map(([id, count]) => (
            <BarRow
              key={id}
              /*
               * `buildingName` for the same reason the map uses it: the database
               * knows these are called "Biomass Burner" and "The HUB", and splitting
               * the class name here printed "Generator Biomass_Automated" at the
               * reader instead. It falls back to the same humanising for anything
               * the game ships without a display name.
               */
              name={buildingName(db, id)}
              value={count}
              max={maxInfra}
              tone="muted"
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

        {view.stored.length > 0 ? (
          <ChartFrame
            title="In storage"
            note={
              view.misrouted > 0
                ? `${view.storedTotal.toLocaleString()} items · ${view.misrouted} wanted by a starving line`
                : `${view.storedTotal.toLocaleString()} items across every container`
            }
          >
            {view.stored.map((row) => (
              <Box key={row.item}>
                <BarRow
                  name={itemName(db, row.item)}
                  value={row.count}
                  max={view.stored[0]?.count ?? 1}
                  tone={row.wantedBy ? 'warn' : 'accent'}
                  display={row.count.toLocaleString()}
                  nameWidth="150px"
                />
                {row.wantedBy || row.pilingFrom ? (
                  <Text fontSize="12px" lineHeight="1.4" color="fg.muted" ml="162px" mb={1}>
                    {row.wantedBy
                      ? `${row.wantedBy} is starving for these.`
                      : `${row.pilingFrom} cannot shift any more.`}{' '}
                    {/*
                     * And where they are. "2,029 Wire sitting in a container"
                     * has been the board's most actionable sentence since the
                     * diagnosis learned to look in the warehouse, and until
                     * the map could name a box it did not say which container.
                     */}
                    <Box
                      asChild
                      color="accent.solid"
                      textDecoration="underline"
                      textUnderlineOffset="2px"
                    >
                      <Link href={`/base?holding=${row.item}`}>find the box</Link>
                    </Box>
                  </Text>
                ) : null}
              </Box>
            ))}
          </ChartFrame>
        ) : null}
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
