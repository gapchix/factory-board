'use client';

import { Box, Flex, Text } from '@chakra-ui/react';
import { uptimeTone, type StatusTone } from './charts';
import { Meter } from './primitives';

/**
 * What the pointer is over on the map.
 *
 * Detail used to come from a native `<title>`: a second's wait for a grey box
 * that cannot be styled and carries no bar. This is a card of our own, placed
 * where the pointer arrived and flipped to whichever side has room.
 *
 * It lives outside the map because it once served two of them, and it stays
 * here because it is presentation with no idea how the thing under the pointer
 * was found — which is what makes it safe to reuse the next time something on
 * this board wants to say "here is a machine, and here is how it is doing".
 */

export const CARD_W = 208;
export const CARD_H = 78;
export const CARD_GAP = 14;

const TONE_FILL: Record<StatusTone, string> = {
  ok: 'status.ok',
  warn: 'status.warn',
  crit: 'status.crit',
};

export interface MapCardContent {
  readonly name: string;
  /** What it is made in, or what it handles. Absent where the name says it all. */
  readonly detail?: string | undefined;
  readonly uptime: number | null;
  readonly zone?: string | undefined;
  readonly tone: StatusTone | null;
  /**
   * Why this line is slow, from its machines' own buffers — starving on
   * something, or backed up with nowhere to put what it made.
   *
   * Per line rather than per machine, because a production machine's uptime is
   * itself measured per line: the save records the productivity of the recipe,
   * not of the box.
   */
  readonly why?: string | undefined;
}

export interface MapCardPlacement {
  /** Pointer position, in pixels within the map surface. */
  readonly x: number;
  readonly y: number;
  readonly flipX: boolean;
  readonly flipY: boolean;
}

/** Where the card goes, given where the pointer arrived and how much room is left. */
export function placeCard(x: number, y: number, width: number, height: number): MapCardPlacement {
  return {
    x,
    y,
    flipX: x + CARD_W + CARD_GAP > width,
    flipY: y + CARD_H + CARD_GAP > height,
  };
}

export function MapCard({ content, at }: { content: MapCardContent; at: MapCardPlacement }) {
  return (
    <Box
      position="absolute"
      left={`${at.flipX ? at.x - CARD_W - CARD_GAP : at.x + CARD_GAP}px`}
      top={`${at.flipY ? at.y - CARD_H - CARD_GAP : at.y + CARD_GAP}px`}
      w={`${CARD_W}px`}
      bg="bg.surface"
      borderWidth="1px"
      borderColor="fg.muted"
      borderLeftWidth="3px"
      borderLeftColor={content.tone ? TONE_FILL[content.tone] : 'fg.muted'}
      px={3}
      py={2.5}
      pointerEvents="none"
      zIndex={1}
    >
      <Text fontSize="14px" fontWeight="600" lineHeight="1.25" truncate>
        {content.name}
      </Text>
      {content.detail ? (
        <Text fontFamily="mono" fontSize="10.5px" color="fg.subtle" truncate>
          {content.detail}
        </Text>
      ) : null}
      {content.uptime === null ? (
        <Text fontFamily="mono" fontSize="10.5px" color="fg.subtle" mt={1.5}>
          no measurement yet
        </Text>
      ) : (
        <Flex align="center" gap={2} mt={2}>
          <Meter value={content.uptime} tone={content.tone ?? uptimeTone(content.uptime)} />
          {/* The bar carries the state; the number stays in text ink. */}
          <Text
            fontFamily="mono"
            fontSize="11px"
            color="fg.muted"
            w="34px"
            textAlign="end"
            fontVariantNumeric="tabular-nums"
          >
            {Math.round(content.uptime * 100)}%
          </Text>
        </Flex>
      )}
      {content.why ? (
        <Text fontSize="11.5px" lineHeight="1.4" color="fg.muted" mt={2}>
          {content.why}
        </Text>
      ) : null}
      {content.zone ? (
        <Text fontFamily="mono" fontSize="10.5px" color="fg.subtle" mt={1.5} truncate>
          in {content.zone}
        </Text>
      ) : null}
    </Box>
  );
}
