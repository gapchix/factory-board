'use client';

import { Box } from '@chakra-ui/react';
import { solve } from '@factory-board/planner';
import { useMemo } from 'react';
import { BoardGrid } from '@/components/board';
import { FlowDiagram } from '@/components/flow-diagram';
import { Balance, PhaseProposal, Summary, TargetEditor } from '@/components/panels';
import { SectionHeading } from '@/components/primitives';
import { diagnose } from '@/lib/diagnose';
import { gameDatabase as db } from '@/lib/game-database';
import { planByZone } from '@/lib/zone-plan';
import { buildZoneBoard } from '@/lib/zones';
import { useBoard } from '@/state/board';

export default function PlanPage() {
  const { targets, recipeChoices, snapshot, zoneNames, zoneAssignments } = useBoard();

  const result = useMemo(() => solve(db, targets, { recipeChoices }), [targets, recipeChoices]);

  /** Where the plan says each line goes, for the cards to say so. */
  const zonesFor = useMemo(() => {
    if (!snapshot) return undefined;
    const { zones } = buildZoneBoard(db, snapshot, zoneNames);
    const { byRecipe } = planByZone(db, targets, recipeChoices, zoneAssignments, zones);
    const named = new Map<string, string[]>();
    for (const [recipe, ids] of byRecipe) {
      named.set(
        recipe,
        ids.map((id) => zones.find((zone) => zone.id === id)?.name ?? id),
      );
    }
    return named;
  }, [snapshot, zoneNames, targets, recipeChoices, zoneAssignments]);

  /*
   * Why each line is slow in the world, so the board's instruction can be
   * checked against it. Without this the plan says "+3 more Iron Rod" while
   * the Overview says the rod line is backed up with five thousand of them in
   * a container — the same factory, described twice, disagreeing.
   */
  const verdicts = useMemo(() => {
    if (!snapshot) return undefined;
    return new Map(diagnose(db, snapshot).map((line) => [line.recipe, line]));
  }, [snapshot]);

  const built = useMemo(() => {
    if (!snapshot) return { machines: 0, powerMW: 0 };
    let machines = 0;
    let powerMW = 0;
    for (const line of Object.values(snapshot.lines)) {
      machines += line.count;
      powerMW += line.count * (db.machines[line.machine]?.powerMW ?? 0);
    }
    return { machines, powerMW };
  }, [snapshot]);

  return (
    <>
      <Box as="section" mb={9}>
        <SectionHeading title="Production targets" note="what you want the factory to make" />
        <PhaseProposal db={db} />
        <TargetEditor db={db} />
      </Box>

      <Box as="section" mb={9}>
        <SectionHeading
          title="Summary"
          note={snapshot ? `compared against ${snapshot.sessionName}` : 'load a save to compare'}
        />
        <Summary
          result={result}
          snapshot={snapshot}
          actualMachines={built.machines}
          actualPowerMW={built.powerMW}
          targetCount={targets.length}
        />
      </Box>

      <Box as="section" mb={9}>
        <SectionHeading title="The flow" note="ore on the left, your targets on the right" />
        <FlowDiagram db={db} result={result} targets={targets} />
      </Box>

      <Box as="section" mb={9}>
        <SectionHeading title="The board" note="one cell per line · grouped by machine" />
        <BoardGrid
          db={db}
          result={result}
          actual={snapshot?.lines ?? {}}
          zonesFor={zonesFor}
          verdicts={verdicts}
        />
      </Box>

      <Box as="section" mb={9}>
        <SectionHeading title="Inputs & surplus" note="what the plan eats, and what it leaves" />
        <Balance db={db} result={result} stored={snapshot?.stored} />
      </Box>
    </>
  );
}
