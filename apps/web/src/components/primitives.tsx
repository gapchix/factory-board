'use client';

import { Box, Flex, Heading, Text, chakra, type BoxProps } from '@chakra-ui/react';
import type { ReactNode } from 'react';

/** Small uppercase monospace label. Used for every field and column heading. */
export function Label({ children, ...rest }: BoxProps & { children: ReactNode }) {
  return (
    <Box
      as="span"
      fontFamily="mono"
      fontSize="10px"
      letterSpacing="0.14em"
      textTransform="uppercase"
      color="fg.subtle"
      {...rest}
    >
      {children}
    </Box>
  );
}

/**
 * Section heading with a rule that runs to the end of the row, and room beside
 * the title for whatever switches what the section is showing.
 */
export function SectionHeading({
  title,
  note,
  controls,
}: {
  title: string;
  note?: string;
  controls?: ReactNode;
}) {
  return (
    <Flex align="baseline" gap={4} mb={3} wrap="wrap">
      <Heading
        as="h2"
        fontFamily="heading"
        fontWeight="600"
        fontSize="25px"
        lineHeight="1"
        textTransform="uppercase"
        letterSpacing="0.02em"
      >
        {title}
      </Heading>
      {controls}
      <Box flex="1" h="1px" bg="border.default" />
      {note ? <Label textAlign="right">{note}</Label> : null}
    </Flex>
  );
}

export function Panel({ children, ...rest }: BoxProps & { children: ReactNode }) {
  return (
    <Box bg="bg.surface" borderWidth="1px" borderColor="border.default" {...rest}>
      {children}
    </Box>
  );
}

export function Mono({ children, ...rest }: BoxProps & { children: ReactNode }) {
  return (
    <Text as="span" fontFamily="mono" fontVariantNumeric="tabular-nums" {...rest}>
      {children}
    </Text>
  );
}

/** A horizontal meter. `tone` carries meaning; the accent hue never does. */
export function Meter({ value, tone }: { value: number; tone: 'ok' | 'warn' | 'crit' }) {
  const color = tone === 'ok' ? 'status.ok' : tone === 'warn' ? 'status.warn' : 'status.crit';
  return (
    <Box flex="1" minW="40px" h="6px" bg="bg.muted" position="relative">
      <Box
        position="absolute"
        top="0"
        bottom="0"
        left="0"
        bg={color}
        width={`${Math.max(2, Math.min(100, value * 100))}%`}
      />
    </Box>
  );
}

export const Field = chakra('input', {
  base: {
    bg: 'bg.muted',
    borderWidth: '1px',
    borderColor: 'border.default',
    px: 3,
    py: 2,
    fontSize: '14px',
    _focusVisible: { outline: '2px solid', outlineColor: 'accent.solid', outlineOffset: '1px' },
  },
});

export const Select = chakra('select', {
  base: {
    width: '100%',
    bg: 'bg.muted',
    borderWidth: '1px',
    borderColor: 'border.default',
    px: 2,
    py: 1,
    fontFamily: 'mono',
    fontSize: '11.5px',
    _focusVisible: { outline: '2px solid', outlineColor: 'accent.solid', outlineOffset: '1px' },
  },
});

export const Th = chakra('th', {
  base: {
    fontFamily: 'mono',
    fontSize: '10px',
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: 'fg.subtle',
    fontWeight: '500',
    textAlign: 'start',
    px: 4,
    py: 2.5,
    borderBottomWidth: '1px',
    borderColor: 'border.default',
    bg: 'bg.muted',
    whiteSpace: 'nowrap',
  },
});

export const Td = chakra('td', {
  base: {
    px: 4,
    py: 2,
    borderBottomWidth: '1px',
    borderColor: 'border.subtle',
    fontSize: '14px',
  },
});

export const NumTd = chakra('td', {
  base: {
    px: 4,
    py: 2,
    borderBottomWidth: '1px',
    borderColor: 'border.subtle',
    fontSize: '14px',
    textAlign: 'end',
    fontFamily: 'mono',
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
  },
});

/** Tables scroll inside their own box so the page never scrolls sideways. */
export function TableFrame({ children }: { children: ReactNode }) {
  return (
    <Box
      overflowX="auto"
      borderWidth="1px"
      borderColor="border.default"
      bg="bg.surface"
      maxW="100%"
    >
      <chakra.table style={{ borderCollapse: 'collapse', width: '100%' }}>{children}</chakra.table>
    </Box>
  );
}
