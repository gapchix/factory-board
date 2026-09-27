'use client';

import { Box, chakra, Flex, Grid, Text } from '@chakra-ui/react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Label, Mono } from './primitives';

/**
 * Chart primitives, hand-built rather than pulled from a charting library.
 *
 * Everything the dashboard shows is a magnitude or a ratio against a limit —
 * bars and meters — so a library would be weight without benefit, and these
 * inherit the theme tokens directly so light and dark stay in step.
 *
 * Conventions, applied consistently: bars are thin with a rounded data-end and
 * a square baseline; adjacent bars are separated by surface, never a stroke;
 * text always wears text tokens, never the data colour — the coloured bar
 * beside a value is what carries state.
 */

/** The three machine-state colours. Reserved: never used to tell series apart. */
export type StatusTone = 'ok' | 'warn' | 'crit';

export type Tone = StatusTone | 'accent' | 'steel' | 'muted';

const FILL: Record<Tone, string> = {
  accent: 'accent.solid',
  ok: 'status.ok',
  warn: 'status.warn',
  crit: 'status.crit',
  steel: 'steel.500',
  muted: 'fg.subtle',
};

/** Uptime bands. Named once so the dashboard and the board cannot disagree. */
export function uptimeTone(uptime: number): StatusTone {
  if (uptime >= 0.95) return 'ok';
  if (uptime >= 0.6) return 'warn';
  return 'crit';
}

/* ------------------------------------------------------------------ stat tile */

export function StatTile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode | undefined;
  tone?: Tone | undefined;
}) {
  return (
    <Box bg="bg.surface" px={4} py={3.5}>
      <Label display="block">{label}</Label>
      <Flex align="baseline" gap={2} mt={1}>
        {tone ? <Box w="8px" h="8px" bg={FILL[tone]} flex="none" alignSelf="center" /> : null}
        <Text
          fontFamily="heading"
          fontWeight="700"
          fontSize="34px"
          lineHeight="1"
          fontVariantNumeric="tabular-nums"
        >
          {value}
        </Text>
      </Flex>
      {sub ? (
        <Text fontFamily="mono" fontSize="11px" color="fg.subtle" mt={1.5}>
          {sub}
        </Text>
      ) : null}
    </Box>
  );
}

export function StatRow({ children }: { children: ReactNode }) {
  return (
    <Grid
      templateColumns="repeat(auto-fit, minmax(168px, 1fr))"
      gap="1px"
      bg="border.default"
      borderWidth="1px"
      borderColor="border.default"
    >
      {children}
    </Grid>
  );
}

/* ---------------------------------------------------------------------- bars */

interface BarProps {
  /** 0–1 share of the track. */
  readonly fraction: number;
  readonly tone: Tone;
  readonly height?: string | undefined;
}

function Bar({ fraction, tone, height = '12px' }: BarProps) {
  const width = Math.max(0, Math.min(1, fraction)) * 100;
  return (
    <Box flex="1" minW="60px" h={height} bg="bg.muted" position="relative">
      <Box
        position="absolute"
        top="0"
        bottom="0"
        left="0"
        width={`${width}%`}
        bg={FILL[tone]}
        borderRightRadius={width > 1 ? '4px' : '0'}
      />
    </Box>
  );
}

/**
 * A labelled horizontal bar. `max` sets the shared scale so rows in one chart
 * stay comparable — never scale each row to itself.
 */
export function BarRow({
  name,
  value,
  max,
  tone = 'accent',
  display,
  nameWidth = '180px',
  title,
}: {
  name: string;
  value: number;
  max: number;
  tone?: Tone | undefined;
  display: string;
  nameWidth?: string | undefined;
  title?: string | undefined;
}) {
  return (
    <Flex align="center" gap={3} title={title ?? `${name}: ${display}`}>
      <Text
        w={{ base: '38%', md: nameWidth }}
        flex="none"
        fontSize="13.5px"
        lineHeight="1.3"
        truncate
        title={name}
      >
        {name}
      </Text>
      <Bar fraction={max > 0 ? value / max : 0} tone={tone} />
      <Mono
        fontSize="12px"
        w={{ base: '64px', md: '92px' }}
        textAlign="end"
        color="fg.muted"
        flex="none"
      >
        {display}
      </Mono>
    </Flex>
  );
}

/**
 * Progress against a limit. The track is the target, the fill is reality —
 * so a half-full row reads as "half built" without reading the number.
 */
export function MeterRow({
  name,
  value,
  target,
  unit = '',
  nameWidth = '180px',
}: {
  name: string;
  value: number;
  target: number;
  unit?: string | undefined;
  nameWidth?: string | undefined;
}) {
  const fraction = target > 0 ? value / target : 0;
  const tone: Tone = fraction >= 1 ? 'ok' : fraction > 0 ? 'accent' : 'muted';
  return (
    <Flex align="center" gap={3} title={`${name}: ${value} of ${target}${unit ? ` ${unit}` : ''}`}>
      <Text
        w={{ base: '38%', md: nameWidth }}
        flex="none"
        fontSize="13.5px"
        lineHeight="1.3"
        truncate
        title={name}
      >
        {name}
      </Text>
      <Bar fraction={fraction} tone={tone} />
      <Mono
        fontSize="12px"
        w={{ base: '64px', md: '92px' }}
        textAlign="end"
        color="fg.muted"
        flex="none"
      >
        {value} / {target}
      </Mono>
    </Flex>
  );
}

export function ChartFrame({
  title,
  note,
  children,
  empty,
}: {
  title: string;
  note?: string | undefined;
  children: ReactNode;
  empty?: string | undefined;
}) {
  return (
    <Box bg="bg.surface" borderWidth="1px" borderColor="border.default" px={5} py={4}>
      <Flex align="baseline" gap={3} mb={4} wrap="wrap">
        <Text
          fontFamily="heading"
          fontWeight="600"
          fontSize="17px"
          textTransform="uppercase"
          letterSpacing="0.03em"
        >
          {title}
        </Text>
        {note ? <Label overflowWrap="anywhere">{note}</Label> : null}
      </Flex>
      {empty ? (
        <Text color="fg.subtle" fontSize="14px">
          {empty}
        </Text>
      ) : (
        <Flex direction="column" gap={2.5}>
          {children}
        </Flex>
      )}
    </Box>
  );
}

/** Swatch + name. Only shown where two or more encodings share a chart. */
export function LegendKey({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <Flex align="center" gap={1.5}>
      <Box w="9px" h="9px" bg={FILL[tone]} flex="none" />
      <Label>{children}</Label>
    </Flex>
  );
}

/* -------------------------------------------------------------- time chart */

/*
 * SVG takes theme tokens through the chakra factory, never as raw CSS
 * variables — see ARCHITECTURE.md. `transform` is the exception that must not
 * go through it, so nothing here uses one.
 */
const SvgPath = chakra('path');
const SvgLine = chakra('line');
const SvgCircle = chakra('circle');
const SvgText = chakra('text');

export interface TimePoint {
  readonly x: number;
  readonly y: number;
}

const CHART_H = 96;
const CHART_TOP = 22;
const CHART_BOTTOM = 15;
const FALLBACK_W = 640;

/**
 * A series over the session.
 *
 * Hand-built like the bars, and for the same reason: this is the third shape
 * the board draws, and a charting library would arrive with its own opinions
 * about type, axes and colour that would then have to be argued out of it. The
 * whole component is a path, a baseline and a readout.
 *
 * Drawn at the width it is given rather than scaled into it, so 10 px type is
 * 10 px — the lesson the map paid for.
 */
export function TimeChart({
  title,
  points,
  format,
  formatX,
  tone = 'accent',
  note,
}: {
  title: string;
  points: readonly TimePoint[];
  format: (value: number) => string;
  formatX: (value: number) => string;
  tone?: Tone | undefined;
  note?: string | undefined;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(FALLBACK_W);
  const [at, setAt] = useState<number | null>(null);

  useEffect(() => {
    const element = box.current;
    if (!element || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(([entry]) => {
      const measured = entry?.contentRect.width ?? 0;
      if (measured > 0) setWidth(measured);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const model = useMemo(() => {
    if (points.length === 0) return null;
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    // A flat series should read as flat, so the scale never zooms in on noise:
    // the floor is zero and the ceiling has a tenth of headroom.
    const maxY = Math.max(...ys, 0) * 1.1 || 1;
    const spanX = maxX - minX || 1;
    const px = (x: number) => ((x - minX) / spanX) * (width - 2) + 1;
    const py = (y: number) => CHART_TOP + (1 - y / maxY) * (CHART_H - CHART_TOP - CHART_BOTTOM);
    return { minX, maxX, maxY, px, py };
  }, [points, width]);

  const shown = at !== null ? points[at] : points[points.length - 1];

  return (
    <Box bg="bg.surface" borderWidth="1px" borderColor="border.default" px={4} pt={3} pb={2}>
      <Flex align="baseline" gap={3} mb={1} wrap="wrap">
        <Label>{title}</Label>
        {note ? <Label color="fg.subtle">{note}</Label> : null}
        <Box flex="1" />
        {shown ? (
          <>
            <Mono fontSize="17px" fontWeight="600">
              {format(shown.y)}
            </Mono>
            <Label color="fg.subtle" minW="62px" textAlign="right">
              {formatX(shown.x)}
            </Label>
          </>
        ) : null}
      </Flex>

      <Box ref={box} position="relative">
        {model === null || points.length < 2 ? (
          <Flex h={`${CHART_H - CHART_TOP}px`} align="center">
            <Text fontSize="13px" color="fg.subtle">
              {points.length === 1 ? 'One save so far — the line starts at two.' : 'Nothing yet.'}
            </Text>
          </Flex>
        ) : (
          <svg
            width={width}
            height={CHART_H - CHART_TOP + CHART_BOTTOM}
            viewBox={`0 ${CHART_TOP} ${width} ${CHART_H - CHART_TOP + CHART_BOTTOM}`}
            style={{ display: 'block', maxWidth: '100%' }}
            role="img"
            aria-label={`${title}: ${format(points[0]?.y ?? 0)} at ${formatX(
              points[0]?.x ?? 0,
            )}, ${format(points[points.length - 1]?.y ?? 0)} at ${formatX(
              points[points.length - 1]?.x ?? 0,
            )}`}
            onPointerMove={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              if (rect.width === 0) return;
              const x = ((event.clientX - rect.left) / rect.width) * width;
              let nearest = 0;
              let best = Infinity;
              points.forEach((point, index) => {
                const distance = Math.abs(model.px(point.x) - x);
                if (distance < best) {
                  best = distance;
                  nearest = index;
                }
              });
              setAt(nearest);
            }}
            onPointerLeave={() => setAt(null)}
          >
            {/*
             * A line, not an area. History starts the day the board is first
             * opened, so a series almost always begins part-way up — and an
             * area under a line that starts at 90% fills the chart with a slab
             * of colour that says nothing.
             */}
            <SvgPath
              d={points
                .map(
                  (point, index) =>
                    `${index === 0 ? 'M' : 'L'} ${model.px(point.x).toFixed(1)} ${model
                      .py(point.y)
                      .toFixed(1)}`,
                )
                .join(' ')}
              fill="none"
              stroke={FILL[tone]}
              strokeWidth={1.6}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            <SvgLine
              x1={0}
              y1={model.py(0)}
              x2={width}
              y2={model.py(0)}
              stroke="border.default"
              strokeWidth={1}
            />
            {shown ? (
              <>
                <SvgLine
                  x1={model.px(shown.x)}
                  y1={CHART_TOP}
                  x2={model.px(shown.x)}
                  y2={model.py(0)}
                  stroke="border.default"
                  strokeWidth={1}
                />
                <SvgCircle cx={model.px(shown.x)} cy={model.py(shown.y)} r={3} fill={FILL[tone]} />
              </>
            ) : null}
            {/* The span, at its own ends, so the width means something. */}
            <SvgText x={0} y={model.py(0) + 13} fontSize="9.5px" fontFamily="mono" fill="fg.subtle">
              {formatX(model.minX)}
            </SvgText>
            <SvgText
              x={width}
              y={model.py(0) + 13}
              textAnchor="end"
              fontSize="9.5px"
              fontFamily="mono"
              fill="fg.subtle"
            >
              {formatX(model.maxX)}
            </SvgText>
          </svg>
        )}
      </Box>
    </Box>
  );
}
