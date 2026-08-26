'use client';

import { Box, Button, Flex, Grid, Text } from '@chakra-ui/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { MeterRow, StatRow, StatTile, TimeChart, uptimeTone } from '@/components/charts';
import { SaveDropzone } from '@/components/panels';
import { Label, Mono, SectionHeading } from '@/components/primitives';
import { playTime, rate } from '@/lib/format';
import { gameDatabase as db } from '@/lib/game-database';
import { changesBetween, digestOf, phaseProgress, type HistoryPoint } from '@/lib/history';
import { forgetSession, isAvailable, pointsFor, sessions } from '@/lib/history-store';
import { useBoard } from '@/state/board';

/** How a change reads, and how loudly. */
const CHANGE = {
  stopped: {
    mark: '!',
    tone: 'status.crit',
    say: (from: number, to: number) => `${pct(from)} → ${pct(to)}`,
  },
  gone: { mark: '−', tone: 'status.crit', say: (from: number) => `${from} machines removed` },
  removed: {
    mark: '−',
    tone: 'fg.muted',
    say: (from: number, to: number) => `${from} → ${to} machines`,
  },
  added: {
    mark: '+',
    tone: 'accent.solid',
    say: (_from: number, to: number) => `${to} machine${to === 1 ? '' : 's'}`,
  },
  built: {
    mark: '↑',
    tone: 'accent.solid',
    say: (from: number, to: number) => `${from} → ${to} machines`,
  },
  recovered: {
    mark: '✓',
    tone: 'status.ok',
    say: (from: number, to: number) => `${pct(from)} → ${pct(to)}`,
  },
} as const;

const pct = (value: number) => `${Math.round(value * 100)}%`;
const signed = (value: number, unit = '') => `${value > 0 ? '+' : ''}${Math.round(value)}${unit}`;

export default function HistoryPage() {
  const { snapshot, source } = useBoard();
  const [stored, setStored] = useState<HistoryPoint[] | null>(null);
  const [known, setKnown] = useState<{ session: string; points: number }[]>([]);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [session, setSession] = useState<string | null>(null);
  const [confirmForget, setConfirmForget] = useState(false);

  const current = useMemo(
    () => (snapshot && source ? digestOf(db, snapshot, source.name) : null),
    [snapshot, source],
  );
  const showing = session ?? current?.session ?? known[0]?.session ?? null;

  const reload = useCallback(async () => {
    setAvailable(await isAvailable());
    setKnown(await sessions());
    setStored(showing ? await pointsFor(showing) : []);
  }, [showing]);

  // Re-read when the save changes: the board records the new one as it arrives,
  // and this is the page that is watching for it.
  useEffect(() => {
    void reload();
  }, [reload, snapshot]);

  /*
   * The save on screen belongs in its own chart whether or not the write has
   * landed yet — it is the same data, and waiting on a database round trip to
   * draw what is already in memory would be a strange thing to do.
   */
  const points = useMemo(() => {
    const kept = stored ?? [];
    if (!current || current.session !== showing) return kept;
    const merged = kept.filter((point) => point.playSeconds !== current.playSeconds);
    merged.push(current);
    return merged.sort((a, b) => a.playSeconds - b.playSeconds);
  }, [stored, current, showing]);

  const latest = points[points.length - 1];
  const previous = points[points.length - 2];
  const changes = useMemo(
    () => (previous && latest ? changesBetween(db, previous, latest) : null),
    [previous, latest],
  );
  const phase = useMemo(() => phaseProgress(db, points), [points]);

  const series = (pick: (point: HistoryPoint) => number | null) =>
    points
      .filter((point) => pick(point) !== null)
      .map((point) => ({ x: point.playSeconds, y: pick(point) ?? 0 }));

  if (!snapshot && points.length === 0) {
    return (
      <>
        <SectionHeading title="History" note="no save loaded" />
        <SaveDropzone />
        <Text color="fg.muted" fontSize="14px" mt={4} maxW="68ch">
          The game keeps three rotating autosave slots, so what happened an hour ago is already
          gone. Load a save and every one after it is kept here — leave the tab open while you play
          and the session draws itself.
        </Text>
      </>
    );
  }

  const span = latest && points[0] ? latest.playSeconds - points[0].playSeconds : 0;

  return (
    <>
      <SectionHeading
        title="History"
        note={
          showing
            ? `${showing} · ${points.length} save${points.length === 1 ? '' : 's'} kept`
            : 'nothing recorded yet'
        }
      />

      {known.length > 1 ? (
        <Flex gap={2} mb={4} wrap="wrap" align="center">
          <Label>Session</Label>
          {known.map((entry) => (
            <Button
              key={entry.session}
              size="xs"
              borderRadius="0"
              variant="outline"
              fontFamily="mono"
              fontSize="11.5px"
              borderColor={entry.session === showing ? 'accent.solid' : 'border.default'}
              color={entry.session === showing ? 'accent.solid' : 'fg.muted'}
              onClick={() => setSession(entry.session)}
            >
              {entry.session} · {entry.points}
            </Button>
          ))}
        </Flex>
      ) : null}

      {available === false ? (
        <Box
          borderWidth="1px"
          borderColor="status.crit"
          bg="status.critSubtle"
          px={4}
          py={3}
          mb={5}
        >
          <Text fontSize="14px">
            This browser will not let the page store anything, so nothing is being kept. Private
            windows usually do this; an ordinary window will record.
          </Text>
        </Box>
      ) : null}

      {points.length < 2 ? (
        <Box bg="bg.surface" borderWidth="1px" borderColor="border.default" px={5} py={4} mb={6}>
          <Text fontSize="14px" color="fg.muted" maxW="72ch">
            One save recorded so far. Every autosave from here is kept — <Mono>npm run dev</Mono>{' '}
            watches the save folder, so leaving this open while you play fills the charts on its
            own.
          </Text>
        </Box>
      ) : null}

      <StatRow>
        <StatTile
          label="Saves kept"
          value={points.length}
          sub={span > 0 ? `over ${playTime(span)} of play` : 'the session so far'}
        />
        <StatTile
          label="Machines"
          value={latest?.machines ?? 0}
          sub={
            changes
              ? changes.machines === 0
                ? 'unchanged since the last save'
                : `${signed(changes.machines)} since the last save`
              : 'nothing to compare yet'
          }
        />
        <StatTile
          label="Power drawn"
          value={`${Math.round(latest?.powerMW ?? 0)} MW`}
          sub={
            changes
              ? Math.round(changes.powerMW) === 0
                ? 'unchanged since the last save'
                : `${signed(changes.powerMW, ' MW')} since the last save`
              : '—'
          }
        />
        <StatTile
          label="Uptime"
          value={latest?.uptime === null || latest === undefined ? '—' : pct(latest.uptime)}
          sub="machine-weighted, across every line"
          {...(latest?.uptime == null ? {} : { tone: uptimeTone(latest.uptime) })}
        />
      </StatRow>

      {changes ? (
        <Box mt={9}>
          <SectionHeading
            title="Since the last save"
            note={
              changes.playSeconds > 0
                ? `${playTime(changes.playSeconds)} of play`
                : 'the same moment'
            }
          />
          <Box bg="bg.surface" borderWidth="1px" borderColor="border.default" px={5} py={4}>
            <Flex gap={6} wrap="wrap" mb={changes.lines.length > 0 ? 4 : 0}>
              {[
                ['Buildings', signed(changes.buildings)],
                ['Machines', signed(changes.machines)],
                ['Power', signed(changes.powerMW, ' MW')],
                ['Delivered', signed(changes.delivered)],
                ['Milestones', signed(changes.milestones)],
              ].map(([label, value]) => (
                <Box key={label}>
                  <Label display="block">{label}</Label>
                  <Mono fontSize="19px" fontWeight="600">
                    {value}
                  </Mono>
                </Box>
              ))}
            </Flex>

            {changes.lines.length > 0 ? (
              <Flex direction="column" gap={1.5}>
                {changes.lines.map((change) => {
                  const shape = CHANGE[change.kind];
                  return (
                    <Flex key={`${change.kind}-${change.recipe}`} align="baseline" gap={3}>
                      <Mono fontSize="13px" color={shape.tone} w="12px" flex="none">
                        {shape.mark}
                      </Mono>
                      <Text fontSize="14px" w="190px" flex="none" truncate>
                        {change.name}
                      </Text>
                      <Text fontFamily="mono" fontSize="12px" color="fg.muted">
                        {shape.say(change.from, change.to)}
                      </Text>
                    </Flex>
                  );
                })}
              </Flex>
            ) : (
              <Text fontSize="13.5px" color="fg.subtle">
                No line started, stopped or changed size.
              </Text>
            )}
          </Box>
        </Box>
      ) : null}

      <Box mt={9}>
        <SectionHeading title="Over the session" note="hover a chart to read a moment" />
        <Grid gap={4} templateColumns={{ base: '1fr', lg: '1fr 1fr' }}>
          <TimeChart
            title="Machines"
            points={series((point) => point.machines)}
            format={(value) => String(Math.round(value))}
            formatX={playTime}
            tone="accent"
          />
          <TimeChart
            title="Power drawn"
            points={series((point) => point.powerMW)}
            format={(value) => `${rate(value, 0)} MW`}
            formatX={playTime}
            tone="steel"
          />
          <TimeChart
            title="Uptime"
            note="machine-weighted"
            points={series((point) => point.uptime)}
            format={pct}
            formatX={playTime}
            // The one series the board already has a colour language for: this
            // is machine state, which is exactly what the status tones mean.
            tone={latest?.uptime == null ? 'muted' : uptimeTone(latest.uptime)}
          />
          <TimeChart
            title="Buildings"
            note="everything placed"
            points={series((point) => point.buildings)}
            format={(value) => String(Math.round(value))}
            formatX={playTime}
            tone="steel"
          />
        </Grid>
      </Box>

      {phase ? (
        <Box mt={9}>
          <SectionHeading
            title={`${phase.label} burn-down`}
            note={
              phase.share >= 1
                ? 'delivered'
                : phase.secondsLeft !== null
                  ? `about ${playTime(phase.secondsLeft)} left at this rate`
                  : 'no deliveries yet to judge a rate by'
            }
          />
          <Box bg="bg.surface" borderWidth="1px" borderColor="border.default" px={5} py={4}>
            <Flex direction="column" gap={2.5}>
              {phase.items.map((item) => (
                <MeterRow
                  key={item.item}
                  name={item.name}
                  value={item.delivered}
                  target={item.required}
                />
              ))}
            </Flex>
            <Text fontSize="13px" color="fg.subtle" mt={3.5} maxW="72ch">
              The estimate is a straight line through the saves recorded for this phase, and says
              nothing at all until something has been delivered in that window. Quotas are
              transcribed rather than extracted — the game data has the parts, not the phases.
            </Text>
          </Box>
        </Box>
      ) : null}

      <Flex mt={9} gap={3} align="center" wrap="wrap">
        <Text fontSize="13px" color="fg.subtle" maxW="70ch">
          Kept in this browser only, about a kilobyte a save, and never sent anywhere. The last{' '}
          {points.length === 1 ? 'save' : `${points.length} saves`} of {showing ?? 'this session'}{' '}
          {points.length === 1 ? 'is' : 'are'} yours to throw away.
        </Text>
        <Box flex="1" />
        {showing && points.length > 0 ? (
          <Button
            size="xs"
            borderRadius="0"
            variant="outline"
            fontFamily="mono"
            fontSize="11.5px"
            borderColor={confirmForget ? 'status.crit' : 'border.default'}
            color={confirmForget ? 'status.crit' : 'fg.muted'}
            onClick={() => {
              if (!confirmForget) {
                setConfirmForget(true);
                return;
              }
              void forgetSession(showing).then(() => {
                setConfirmForget(false);
                void reload();
              });
            }}
            onBlur={() => setConfirmForget(false)}
          >
            {confirmForget ? 'Forget it — sure?' : 'Forget this session'}
          </Button>
        ) : null}
      </Flex>
    </>
  );
}
