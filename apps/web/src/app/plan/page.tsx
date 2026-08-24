'use client';

import { Box } from '@chakra-ui/react';
import { solve } from '@factory-board/planner';
import { useMemo } from 'react';
import { BoardGrid } from '@/components/board';
import { FlowDiagram } from '@/components/flow-diagram';
import { Balance, Summary, TargetEditor } from '@/components/panels';
import { SectionHeading } from '@/components/primitives';
import { gameDatabase as db } from '@/lib/game-database';
import { useBoard } from '@/state/board';

export default function PlanPage() {
  const { targets, recipeChoices, snapshot } = useBoard();

  const result = useMemo(() => solve(db, targets, { recipeChoices }), [targets, recipeChoices]);

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
        <BoardGrid db={db} result={result} actual={snapshot?.lines ?? {}} />
      </Box>

      <Box as="section" mb={9}>
        <SectionHeading title="Inputs & surplus" note="what the plan eats, and what it leaves" />
        <Balance db={db} result={result} />
      </Box>
    </>
  );
}
