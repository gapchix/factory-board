'use client';

import { Box, chakra, Flex, Grid, Text } from '@chakra-ui/react';
import dynamic from 'next/dynamic';
import { useCallback, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { BarRow, ChartFrame, MeterRow, StatRow, StatTile, uptimeTone } from '@/components/charts';
import { SaveDropzone } from '@/components/panels';
import { Field, Label, Mono, SectionHeading } from '@/components/primitives';
import { rate, itemName } from '@/lib/format';
import { placeGhosts, type GhostSite } from '@/lib/ghosts';
import { gameDatabase as db } from '@/lib/game-database';
import { solve } from '@factory-board/planner';
import { planByZone, type ZonePlanEntry } from '@/lib/zone-plan';
import { buildZoneBoard, slugify, withZoneName, zoneBySlug, type ZoneView } from '@/lib/zones';
import { useBoard } from '@/state/board';

/*
 * The map brings a WebGL renderer with it, which has no business in the bundle
 * of the four pages that never draw one — and none at all on the server, where
 * there is no canvas to draw on.
 */
const FactoryMap = dynamic(() => import('@/components/factory-map'), {
  ssr: false,
  loading: () => (
    <Box
      h={{ base: '420px', md: '620px' }}
      bg="bg.surface"
      borderWidth="1px"
      borderColor="border.default"
    />
  ),
});

/** A control small enough to sit in a card heading without shouting. */
const CardButton = chakra('button', {
  base: {
    fontFamily: 'mono',
    fontSize: '10px',
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: 'fg.subtle',
    px: 1.5,
    py: 0.5,
    borderWidth: '1px',
    borderColor: 'transparent',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    _hover: { color: 'fg.default', borderColor: 'border.default' },
    _focusVisible: { outline: '2px solid', outlineColor: 'accent.solid', outlineOffset: '1px' },
  },
});

/** What a zone is for, when it is not a factory cell. */
const KIND_NOTE = {
  production: '',
  extraction: 'extraction',
  power: 'power',
} as const;

function ZoneCard({
  zone,
  plan,
  selected,
  editing,
  onSelect,
  onEdit,
  onRename,
  onCopyLink,
  copied,
}: {
  zone: ZoneView;
  plan: ZonePlanEntry | undefined;
  selected: boolean;
  editing: boolean;
  onSelect: () => void;
  onEdit: (editing: boolean) => void;
  onRename: (name: string) => void;
  onCopyLink: () => void;
  copied: boolean;
}) {
  const [draft, setDraft] = useState(zone.renamed ? zone.name : '');

  const commit = () => {
    onRename(draft);
    onEdit(false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commit();
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      setDraft(zone.renamed ? zone.name : '');
      onEdit(false);
    }
  };

  const uptime = zone.uptime === null ? '-' : `${Math.round(zone.uptime * 100)}%`;
  const stats: [string, string][] =
    zone.kind === 'production'
      ? [
          ['Machines', String(zone.machines)],
          ['Power', `${Math.round(zone.powerMW)} MW`],
          ['Uptime', uptime],
          ['Belts etc.', String(zone.attached)],
        ]
      : [
          ...(zone.extractors > 0
            ? ([['Extractors', String(zone.extractors)]] as [string, string][])
            : []),
          ...(zone.generators > 0
            ? ([['Generators', String(zone.generators)]] as [string, string][])
            : []),
          ['Uptime', uptime],
          ['Belts etc.', String(zone.attached)],
        ];

  // A zone standing on one building has no footprint worth printing.
  const footprint = zone.machines + zone.support === 1 ? 'one building' : zone.size;

  const bars =
    zone.kind === 'production' ? zone.products : zone.kind === 'power' ? zone.burns : zone.extracts;
  const barsLabel =
    zone.kind === 'production' ? 'Makes' : zone.kind === 'power' ? 'Burns' : 'Pulls';

  // In a factory cell the miners and burners are supporting cast, so they get a
  // line rather than a chart.
  const alsoHere: string[] = [];
  if (zone.kind === 'production') {
    for (const pulled of zone.extracts) alsoHere.push(`${pulled.count} on ${pulled.name}`);
    for (const burnt of zone.burns) alsoHere.push(`${burnt.count} burning ${burnt.name}`);
  }

  return (
    <Box
      bg="bg.surface"
      borderWidth="1px"
      borderTopWidth="3px"
      px={5}
      py={4}
      borderColor={selected ? 'accent.solid' : 'border.default'}
      borderTopColor={zone.uptime === null ? 'border.default' : `status.${uptimeTone(zone.uptime)}`}
    >
      <Flex align="baseline" gap={3} wrap="wrap" mb={3}>
        {editing ? (
          <Field
            autoFocus
            maxLength={40}
            w="200px"
            py={0.5}
            fontSize="17px"
            placeholder={zone.derived}
            aria-label={`Name for ${zone.name}`}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
            onBlur={commit}
          />
        ) : (
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
        )}
        <Label>{footprint}</Label>
        {KIND_NOTE[zone.kind] ? (
          <Label color="fg.subtle" borderWidth="1px" borderColor="border.default" px={1.5}>
            {KIND_NOTE[zone.kind]}
          </Label>
        ) : null}

        <Box flex="1" />

        <CardButton
          type="button"
          onClick={() => onEdit(!editing)}
          aria-label={editing ? `Stop renaming ${zone.name}` : `Rename ${zone.name}`}
        >
          {editing ? 'done' : zone.renamed ? 'rename ✎' : 'rename'}
        </CardButton>
        {selected ? (
          <CardButton type="button" onClick={onCopyLink}>
            {copied ? 'copied' : 'copy link'}
          </CardButton>
        ) : null}
        <CardButton
          type="button"
          aria-pressed={selected}
          onClick={onSelect}
          color={selected ? 'accent.solid' : undefined}
        >
          {selected ? 'on the map ✕' : 'show on map'}
        </CardButton>
      </Flex>

      <Flex gap={6} wrap="wrap" mb={4}>
        {stats.map(([label, value]) => (
          <Box key={label}>
            <Label display="block">{label}</Label>
            <Mono fontSize="19px" fontWeight="600">
              {value}
            </Mono>
          </Box>
        ))}
      </Flex>

      {bars.length > 0 ? (
        <>
          <Label display="block" mb={2}>
            {barsLabel}
          </Label>
          <Flex direction="column" gap={2}>
            {bars.map((entry) => (
              <BarRow
                key={entry.id}
                name={entry.name}
                value={entry.count}
                max={Math.max(...bars.map((other) => other.count), 1)}
                tone="steel"
                display={`${entry.count}x`}
                nameWidth="150px"
              />
            ))}
          </Flex>
        </>
      ) : null}

      {alsoHere.length > 0 ? (
        <Text fontSize="12.5px" color="fg.subtle" mt={3}>
          <Label>Also here</Label> {alsoHere.join(' · ')}
        </Text>
      ) : null}

      {plan ? (
        <Box mt={4} pt={3.5} borderTopWidth="1px" borderColor="border.subtle">
          <Flex align="baseline" gap={3} mb={2.5}>
            <Label>Planned here</Label>
            <Box flex="1" />
            <Label color={plan.toBuild > 0 ? 'fg.default' : 'fg.subtle'}>
              {plan.toBuild > 0 ? `${plan.toBuild} still to build` : 'all built'}
            </Label>
          </Flex>
          <Flex direction="column" gap={2}>
            {plan.work.map((work) => (
              <MeterRow
                key={work.recipe}
                name={work.name}
                value={work.built}
                target={work.needed}
                nameWidth="150px"
                unit={work.machine}
              />
            ))}
          </Flex>
        </Box>
      ) : null}
    </Box>
  );
}

export default function BasePage() {
  const { snapshot, targets, recipeChoices, zoneAssignments, zoneNames, dispatch } = useBoard();

  /*
   * The URL holds the focused zone, by name rather than by number: zone ids are
   * positional, so the next autosave hands "zone-3" to somewhere else, whereas
   * "coal-power" is the place you were looking at. That makes the link both
   * shareable and reloadable, and it survives the dev watcher swapping the save
   * out from under the page.
   *
   * Read once on mount and written with `replaceState`. `useSearchParams` would
   * push a static export into a client-side bailout, and focusing a zone is a
   * view change, not somewhere to go back from.
   */
  const [zoneSlug, setZoneSlug] = useState<string | null>(() =>
    typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('zone'),
  );
  const [editingZoneId, setEditingZoneId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const mapRef = useRef<HTMLDivElement>(null);

  const board = useMemo(
    () => (snapshot ? buildZoneBoard(db, snapshot, zoneNames) : null),
    [snapshot, zoneNames],
  );

  /*
   * The plan, standing on the ground it would stand on.
   *
   * What the solver calls for, less what is already built, placed by
   * `lib/ghosts` on free ground in the cell that already makes the thing —
   * which turns "build six more constructors" from a count into somewhere to
   * walk. Nothing at all until there are targets, so the map stays the base.
   */
  const ghosts = useMemo((): readonly GhostSite[] => {
    if (!snapshot || targets.length === 0 || !board) return [];
    const solved = solve(db, targets, { recipeChoices });
    const assigned = planByZone(db, targets, recipeChoices, zoneAssignments, board.zones);
    const missing = solved.lines
      .map((line) => ({
        recipe: line.recipe,
        machine: line.machine,
        name: itemName(db, line.primaryOutput),
        count: Math.max(0, line.machinesToBuild - (snapshot.lines[line.recipe]?.count ?? 0)),
        zoneId: assigned.byRecipe.get(line.recipe)?.[0],
      }))
      .filter((line) => line.count > 0);
    return placeGhosts(
      db,
      snapshot.placements,
      board.zones.map((zone) => ({ id: zone.id, name: zone.name, bounds: zone.bounds })),
      missing,
    ).sites;
  }, [snapshot, targets, recipeChoices, zoneAssignments, board]);

  const plan = useMemo(
    () =>
      board ? planByZone(db, targets, recipeChoices, zoneAssignments, board.zones) : undefined,
    [board, targets, recipeChoices, zoneAssignments],
  );

  const selectedZone = zoneBySlug(board?.zones ?? [], zoneSlug);
  const selectedZoneId = selectedZone?.id ?? null;

  const focusSlug = useCallback((slug: string | null) => {
    setZoneSlug(slug);
    setCopied(false);
    const url = new URL(window.location.href);
    if (slug) url.searchParams.set('zone', slug);
    else url.searchParams.delete('zone');
    window.history.replaceState(null, '', url);
  }, []);

  const selectZone = useCallback(
    (id: string | null) => {
      const zone = id ? board?.zones.find((candidate) => candidate.id === id) : undefined;
      focusSlug(zone && zone.slug !== zoneSlug ? zone.slug : null);
    },
    [board, focusSlug, zoneSlug],
  );

  if (!snapshot || !board) {
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

  const { zones, cluster } = board;
  const maxZoneMachines = Math.max(...zones.map((zone) => zone.machines + zone.support), 1);
  const supportZones = zones.filter((zone) => zone.kind !== 'production').length;

  /** Selecting from a card only means anything if the map is on screen. */
  const focusZone = (id: string) => {
    selectZone(id);
    mapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const renameZone = (zone: ZoneView, name: string) => {
    dispatch({ type: 'setZoneNames', names: withZoneName(zoneNames, zone, name) });
    // The link carries the name, so renaming the zone you are looking at moves
    // the link with it rather than dropping the selection on the floor.
    if (zone.id === selectedZoneId) setZoneSlug(slugify(name.trim() || zone.derived));
  };

  const copyLink = () => {
    navigator.clipboard
      ?.writeText(window.location.href)
      .then(() => setCopied(true))
      .catch(() => undefined);
  };

  return (
    <>
      <SectionHeading title="Base" note={`${snapshot.sessionName} · ${board.spread} of ground`} />

      <StatRow>
        <StatTile
          label="Zones"
          value={zones.length}
          sub={`${zones.length - supportZones} making things, ${supportZones} feeding them`}
        />
        <StatTile
          label="Buildings"
          value={snapshot.placements.length}
          sub={`${cluster.unassignedCount} outside any zone`}
        />
        <StatTile label="Footprint" value={board.spread} sub="bounding box of everything" />
        <StatTile
          label="Strays"
          value={cluster.strays.length}
          sub="lone machines, off on their own"
        />
      </StatRow>

      <Box mt={9} ref={mapRef}>
        <SectionHeading
          title="The map"
          note="every building at its real size and angle · coloured by uptime"
        />

        <FactoryMap
          db={db}
          snapshot={snapshot}
          zones={zones}
          selectedZoneId={selectedZoneId}
          onSelectZone={selectZone}
          ghosts={ghosts}
        />
      </Box>

      <Box mt={9}>
        <SectionHeading title="Zones" note="what each part of the base is for · click to find it" />
        <Grid gap={4} templateColumns={{ base: '1fr', lg: '1fr 1fr' }} alignItems="start">
          {zones.map((zone) => (
            <ZoneCard
              key={zone.slug}
              zone={zone}
              plan={plan?.byZone.get(zone.id)}
              selected={zone.id === selectedZoneId}
              editing={zone.id === editingZoneId}
              copied={copied}
              onSelect={() => focusZone(zone.id)}
              onEdit={(editing) => setEditingZoneId(editing ? zone.id : null)}
              onRename={(name) => renameZone(zone, name)}
              onCopyLink={copyLink}
            />
          ))}
        </Grid>
      </Box>

      <Box mt={9}>
        <ChartFrame title="Zone size" note="buildings that anchor each zone">
          {zones.map((zone) => (
            <BarRow
              key={zone.id}
              name={zone.name}
              value={zone.machines + zone.support}
              max={maxZoneMachines}
              tone={zone.uptime === null ? 'muted' : uptimeTone(zone.uptime)}
              display={
                zone.kind === 'production'
                  ? `${zone.machines} · ${rate(zone.powerMW, 0)} MW`
                  : `${zone.support} bldg`
              }
            />
          ))}
        </ChartFrame>
        <Text fontSize="13px" color="fg.subtle" mt={2.5} maxW="88ch">
          Zones are buildings within 32 m of one another, clustered in two passes: machines define a
          zone, and the miners and generators around them describe one. Doing it in a single pass
          lets a line of burners weld two factory cells into one blob. Belts and poles are attached
          to whichever zone they sit in.{' '}
          {cluster.strays.length > 0
            ? `${cluster.strays.length} lone machine${
                cluster.strays.length === 1 ? '' : 's'
              } sit too far from anything else to belong anywhere.`
            : ''}
        </Text>
      </Box>
    </>
  );
}
