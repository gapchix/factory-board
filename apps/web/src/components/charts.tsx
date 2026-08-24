'use client';

import { Box, Flex, Grid, Text } from '@chakra-ui/react';
import type { ReactNode } from 'react';
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

export type Tone = 'accent' | 'ok' | 'warn' | 'crit' | 'steel' | 'muted';

const FILL: Record<Tone, string> = {
  accent: 'accent.solid',
  ok: 'status.ok',
  warn: 'status.warn',
  crit: 'status.crit',
  steel: 'steel.500',
  muted: 'fg.subtle',
};

/** Uptime bands. Named once so the dashboard and the board cannot disagree. */
export function uptimeTone(uptime: number): Tone {
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
      <Text w={nameWidth} flex="none" fontSize="13.5px" lineHeight="1.3" truncate title={name}>
        {name}
      </Text>
      <Bar fraction={max > 0 ? value / max : 0} tone={tone} />
      <Mono fontSize="12px" w="92px" textAlign="end" color="fg.muted" flex="none">
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
      <Text w={nameWidth} flex="none" fontSize="13.5px" lineHeight="1.3" truncate title={name}>
        {name}
      </Text>
      <Bar fraction={fraction} tone={tone} />
      <Mono fontSize="12px" w="92px" textAlign="end" color="fg.muted" flex="none">
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
        {note ? <Label>{note}</Label> : null}
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
