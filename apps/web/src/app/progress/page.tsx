'use client';

import { Box, Text } from '@chakra-ui/react';
import { useMemo } from 'react';
import { ChartFrame, MeterRow } from '@/components/charts';
import { Progress, SaveDropzone } from '@/components/panels';
import { SectionHeading } from '@/components/primitives';
import { useBoard } from '@/state/board';
import { useGameData } from '@/state/game-data';

export default function ProgressPage() {
  const { snapshot } = useBoard();
  const { db } = useGameData();

  const tiers = useMemo(() => {
    if (!snapshot) return [];
    const researched = new Set(snapshot.milestones);
    const byTier = new Map<number, { done: number; total: number }>();
    for (const milestone of Object.values(db.milestones)) {
      const row = byTier.get(milestone.tier) ?? { done: 0, total: 0 };
      row.total += 1;
      if (researched.has(milestone.id)) row.done += 1;
      byTier.set(milestone.tier, row);
    }
    return [...byTier.entries()].sort((a, b) => a[0] - b[0]);
  }, [db, snapshot]);

  if (!snapshot) {
    return (
      <>
        <SectionHeading title="Progression" note="no save loaded" />
        <SaveDropzone />
        <Text color="fg.muted" fontSize="14px" mt={4} maxW="68ch">
          Milestone research and Space Elevator delivery are read straight out of the save.
        </Text>
      </>
    );
  }

  return (
    <>
      <SectionHeading title="Research by tier" note="milestones unlocked" />
      <ChartFrame title="Tier completion" note="researched / available">
        {tiers.map(([tier, row]) => (
          <MeterRow
            key={tier}
            name={`Tier ${tier}`}
            value={row.done}
            target={row.total}
            nameWidth="90px"
          />
        ))}
      </ChartFrame>

      <Box mt={9}>
        <SectionHeading title="Every milestone" note="costs from your installed game files" />
        <Progress db={db} snapshot={snapshot} />
      </Box>
    </>
  );
}
