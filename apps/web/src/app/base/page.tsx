'use client';

import { Box, chakra, Flex, Grid, Text } from '@chakra-ui/react';
import { clusterZones } from '@factory-board/layout';
import { useEffect, useMemo, useRef, useState } from 'react';
import { BaseMap } from '@/components/base-map';
import { BarRow, ChartFrame, StatRow, StatTile, uptimeTone } from '@/components/charts';
import { SaveDropzone } from '@/components/panels';
import { Label, SectionHeading } from '@/components/primitives';
import { itemName, rate } from '@/lib/format';
import { gameDatabase as db } from '@/lib/game-database';
import { useBoard } from '@/state/board';

/**
 * A zone card is a button: pressing it finds that zone on the map. It is built
 * from the chakra factory rather than `Box as="button"` because the polymorphic
 * `as` prop keeps the div's attribute set, and a button needs `type`.
 */
const ZoneCard = chakra('button', {
  base: {
    textAlign: 'start',
    width: '100%',
    bg: 'bg.surface',
    borderWidth: '1px',
    borderTopWidth: '3px',
    px: 5,
    py: 4,
    cursor: 'pointer',
    _focusVisible: { outline: '2px solid', outlineColor: 'accent.solid', outlineOffset: '1px' },
  },
});

/** A zone is named after what it mostly makes — far more use than "Zone 2". */
function nameFor(dominantRecipe: string | undefined, fallback: string): string {
  if (!dominantRecipe) return fallback;
  const product = db.recipes[dominantRecipe]?.outputs[0]?.item;
  return product ? itemName(db, product) : fallback;
}

export default function BasePage() {
  const { snapshot } = useBoard();
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);

  const view = useMemo(() => {
    if (!snapshot) return null;
    const cluster = clusterZones(snapshot.placements);

    const zones = cluster.zones.map((zone) => {
      let machines = 0;
      let powerMW = 0;
      let uptimeWeighted = 0;
      let uptimeWeight = 0;
      const products: { name: string; count: number }[] = [];

      for (const [recipe, count] of Object.entries(zone.recipeCounts)) {
        machines += count;
        const line = snapshot.lines[recipe];
        const machineId = db.recipes[recipe]?.machine;
        powerMW += count * (machineId ? (db.machines[machineId]?.powerMW ?? 0) : 0);
        if (line?.uptime != null) {
          uptimeWeighted += line.uptime * count;
          uptimeWeight += count;
        }
        const product = db.recipes[recipe]?.outputs[0]?.item;
        products.push({ name: product ? itemName(db, product) : recipe, count });
      }

      return {
        id: zone.id,
        name: nameFor(zone.dominantRecipe, zone.label),
        machines,
        powerMW,
        uptime: uptimeWeight > 0 ? uptimeWeighted / uptimeWeight : null,
        attached: zone.attachedCount,
        size: `${Math.round(zone.widthM)} x ${Math.round(zone.depthM)} m`,
        products: products.sort((a, b) => b.count - a.count),
      };
    });

    // Two zones making the same thing would collide; number the duplicates.
    const seen = new Map<string, number>();
    for (const zone of zones) {
      const n = (seen.get(zone.name) ?? 0) + 1;
      seen.set(zone.name, n);
      if (n > 1) zone.name = `${zone.name} ${n}`;
    }

    const names: Record<string, string> = {};
    for (const zone of zones) names[zone.id] = zone.name;

    const spread = cluster.bounds
      ? `${Math.round(cluster.bounds.maxX - cluster.bounds.minX)} x ${Math.round(
          cluster.bounds.maxY - cluster.bounds.minY,
        )} m`
      : '-';

    return { cluster, zones, names, spread };
  }, [snapshot]);

  // Zone ids are positional, so a new save's "zone-2" is a different place.
  useEffect(() => setSelectedZoneId(null), [snapshot]);

  if (!snapshot || !view) {
    return (
      <>
        <SectionHeading title="Base" note="no save loaded" />
        <SaveDropzone />
        <Text color="fg.muted" fontSize="14px" mt={4} maxW="68ch">
          Every building in a save carries its position. Load one and the base is drawn from those
          coordinates, grouped into the zones you actually built.
        </Text>
      </>
    );
  }

  const maxZoneMachines = Math.max(...view.zones.map((z) => z.machines), 1);

  /** Selecting from a card only means anything if the map is on screen. */
  const focusZone = (id: string) => {
    setSelectedZoneId((current) => (current === id ? null : id));
    mapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  return (
    <>
      <SectionHeading title="Base" note={`${snapshot.sessionName} · ${view.spread} of ground`} />

      <StatRow>
        <StatTile label="Zones" value={view.zones.length} sub="clustered from machine positions" />
        <StatTile
          label="Buildings"
          value={snapshot.placements.length}
          sub={`${view.cluster.unassignedCount} outside any zone`}
        />
        <StatTile label="Footprint" value={view.spread} sub="bounding box of everything" />
        <StatTile
          label="Strays"
          value={view.cluster.strays.length}
          sub="lone machines, off on their own"
        />
      </StatRow>

      <Box mt={9} ref={mapRef}>
        <SectionHeading title="The map" note="machines coloured by uptime · hover for detail" />
        <BaseMap
          db={db}
          snapshot={snapshot}
          cluster={view.cluster}
          zoneNames={view.names}
          selectedZoneId={selectedZoneId}
          onSelectZone={setSelectedZoneId}
        />
      </Box>

      <Box mt={9}>
        <SectionHeading title="Zones" note="what each part of the base is for · click to find it" />
        <Grid gap={4} templateColumns={{ base: '1fr', lg: '1fr 1fr' }} alignItems="start">
          {view.zones.map((zone) => {
            const selected = zone.id === selectedZoneId;
            return (
              <ZoneCard
                key={zone.id}
                type="button"
                aria-pressed={selected}
                onClick={() => focusZone(zone.id)}
                borderColor={selected ? 'accent.solid' : 'border.default'}
                borderTopColor={
                  zone.uptime === null
                    ? 'border.default'
                    : zone.uptime >= 0.95
                      ? 'status.ok'
                      : zone.uptime >= 0.6
                        ? 'status.warn'
                        : 'status.crit'
                }
                _hover={{ borderColor: selected ? 'accent.solid' : 'fg.subtle' }}
              >
                <Flex align="baseline" gap={3} wrap="wrap" mb={3}>
                  <Text
                    fontFamily="heading"
                    fontWeight="600"
                    fontSize="21px"
                    textTransform="uppercase"
                    letterSpacing="0.02em"
                    color={selected ? 'accent.solid' : 'fg.default'}
                  >
                    {zone.name}
                  </Text>
                  <Label>{zone.size}</Label>
                  <Box flex="1" />
                  <Label color={selected ? 'accent.solid' : 'fg.subtle'}>
                    {selected ? 'on the map ✕' : 'show on map'}
                  </Label>
                </Flex>

                <Flex gap={6} wrap="wrap" mb={4}>
                  {[
                    ['Machines', String(zone.machines)],
                    ['Power', `${Math.round(zone.powerMW)} MW`],
                    ['Uptime', zone.uptime === null ? '-' : `${Math.round(zone.uptime * 100)}%`],
                    ['Belts etc.', String(zone.attached)],
                  ].map(([label, value]) => (
                    <Box key={label}>
                      <Label display="block">{label}</Label>
                      <Text
                        fontFamily="mono"
                        fontSize="19px"
                        fontWeight="600"
                        fontVariantNumeric="tabular-nums"
                      >
                        {value}
                      </Text>
                    </Box>
                  ))}
                </Flex>

                <Label display="block" mb={2}>
                  Makes
                </Label>
                <Flex direction="column" gap={2}>
                  {zone.products.map((product) => (
                    <BarRow
                      key={product.name}
                      name={product.name}
                      value={product.count}
                      max={Math.max(...zone.products.map((p) => p.count), 1)}
                      tone="steel"
                      display={`${product.count}x`}
                      nameWidth="150px"
                    />
                  ))}
                </Flex>
              </ZoneCard>
            );
          })}
        </Grid>
      </Box>

      <Box mt={9}>
        <ChartFrame title="Zone size" note="machines per zone">
          {view.zones.map((zone) => (
            <BarRow
              key={zone.id}
              name={zone.name}
              value={zone.machines}
              max={maxZoneMachines}
              tone={zone.uptime === null ? 'muted' : uptimeTone(zone.uptime)}
              display={`${zone.machines} · ${rate(zone.powerMW, 0)} MW`}
            />
          ))}
        </ChartFrame>
        <Text fontSize="13px" color="fg.subtle" mt={2.5}>
          Zones are machines within 32 m of one another. Belts and poles are attached to whichever
          zone they sit in rather than defining one — a single belt run would otherwise weld the
          whole base into one blob.{' '}
          {view.cluster.strays.length > 0
            ? `${view.cluster.strays.length} lone machine${
                view.cluster.strays.length === 1 ? '' : 's'
              } sit too far from anything else to form a zone.`
            : ''}
        </Text>
      </Box>
    </>
  );
}
