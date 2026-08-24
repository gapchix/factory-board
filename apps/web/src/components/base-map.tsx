'use client';

import { Box, chakra, Flex, Text } from '@chakra-ui/react';
import type { GameDatabase } from '@factory-board/planner';
import type { ClusterResult } from '@factory-board/layout';
import type { WorldSnapshot } from '@factory-board/save-reader';
import { useMemo } from 'react';
import { itemName, machineName } from '@/lib/format';
import { uptimeTone, type StatusTone } from './charts';
import { Label } from './primitives';

/**
 * A top-down plan of the base, drawn from the coordinates in the save.
 *
 * Machines are coloured by the uptime of the line they run, so a starving cell
 * shows up as a red patch in the corner of the map you actually built it in.
 * That spatial link is the point: a ranked list tells you *what* is starving, the
 * map tells you *where*, which is what you need to go and fix it.
 *
 * Game axes map to screen without a flip: +X is east, +Y is south.
 */

const SvgRect = chakra('rect');
const SvgCircle = chakra('circle');
const SvgText = chakra('text');

/**
 * The drawing is a fixed-size canvas that the world is letterboxed into, rather
 * than a viewBox shaped like the world.
 *
 * Shaping the viewBox to the world means the SVG is upscaled to the container
 * width by whatever factor the aspect ratio demands — and a 12-unit label on a
 * narrow, tall base then renders at 45px, colliding with everything. With a
 * fixed canvas, one unit is about one pixel and type stays the size it says.
 */
const CANVAS_W = 1000;
const MIN_CANVAS_H = 380;
const MAX_CANVAS_H = 900;
const PAD = 30;
/** Below this width a zone caption has nowhere to sit; hover carries it. */
const MIN_LABEL_WIDTH = 58;

const TONE_FILL: Record<StatusTone, string> = {
  ok: 'status.ok',
  warn: 'status.warn',
  crit: 'status.crit',
} as const;

export function BaseMap({
  db,
  snapshot,
  cluster,
  zoneNames,
}: {
  db: GameDatabase;
  snapshot: WorldSnapshot;
  cluster: ClusterResult;
  zoneNames: Readonly<Record<string, string>>;
}) {
  const model = useMemo(() => {
    if (!cluster.bounds) return null;

    /*
     * Frame the zones, not the whole world.
     *
     * A single power line out to a remote miner stretches the bounding box across
     * hundreds of metres, and fitting to that squashes the actual factory into a
     * corner while most of the drawing sits empty. The zones are the factory, so
     * they set the frame; anything outside it is counted and reported instead.
     * The true extent is still on the stat row above.
     */
    const framed = cluster.zones.length > 0 ? cluster.zones.map((z) => z.bounds) : [cluster.bounds];
    const raw = {
      minX: Math.min(...framed.map((b) => b.minX)),
      minY: Math.min(...framed.map((b) => b.minY)),
      maxX: Math.max(...framed.map((b) => b.maxX)),
      maxY: Math.max(...framed.map((b) => b.maxY)),
    };
    const marginX = Math.max(30, (raw.maxX - raw.minX) * 0.18);
    const marginY = Math.max(30, (raw.maxY - raw.minY) * 0.18);
    const bounds = {
      minX: raw.minX - marginX,
      minY: raw.minY - marginY,
      maxX: raw.maxX + marginX,
      maxY: raw.maxY + marginY,
    };
    const inFrame = (x: number, y: number) =>
      x >= bounds.minX && x <= bounds.maxX && y >= bounds.minY && y <= bounds.maxY;

    const worldW = Math.max(1, bounds.maxX - bounds.minX);
    const worldH = Math.max(1, bounds.maxY - bounds.minY);

    // A tall base gets a tall canvas, within limits, so it is not squeezed into
    // a letterbox with empty space either side.
    const canvasH = Math.round(
      Math.min(MAX_CANVAS_H, Math.max(MIN_CANVAS_H, (CANVAS_W * worldH) / worldW)),
    );
    const scale = Math.min((CANVAS_W - PAD * 2) / worldW, (canvasH - PAD * 2) / worldH);
    const offsetX = (CANVAS_W - worldW * scale) / 2;
    const offsetY = (canvasH - worldH * scale) / 2;
    const project = (x: number, y: number) => ({
      x: offsetX + (x - bounds.minX) * scale,
      y: offsetY + (y - bounds.minY) * scale,
    });

    const uptimeOf = (recipe: string | undefined) =>
      recipe ? (snapshot.lines[recipe]?.uptime ?? null) : null;

    const anchors = [];
    const others = [];
    let outside = 0;
    for (const placement of snapshot.placements) {
      if (!inFrame(placement.x, placement.y)) {
        outside += 1;
        continue;
      }
      const at = project(placement.x, placement.y);
      if (placement.recipe) {
        const uptime = uptimeOf(placement.recipe);
        anchors.push({
          ...at,
          key: `${placement.x}:${placement.y}:${placement.machine}:${anchors.length}`,
          tone: uptime === null ? null : uptimeTone(uptime),
          title:
            `${machineName(db, placement.machine)} — ` +
            `${itemName(db, db.recipes[placement.recipe]?.outputs[0]?.item ?? placement.recipe)}` +
            (uptime === null ? ' (not yet measured)' : ` at ${Math.round(uptime * 100)}% uptime`),
        });
      } else {
        others.push({ ...at, key: `o${others.length}` });
      }
    }

    const zones = cluster.zones.map((zone) => {
      const topLeft = project(zone.bounds.minX, zone.bounds.minY);
      const bottomRight = project(zone.bounds.maxX, zone.bounds.maxY);
      const width = Math.max(24, bottomRight.x - topLeft.x + 20);
      return {
        id: zone.id,
        label: zoneNames[zone.id] ?? zone.label,
        x: topLeft.x - 10,
        y: topLeft.y - 10,
        width,
        height: Math.max(24, bottomRight.y - topLeft.y + 20),
        showLabel: width >= MIN_LABEL_WIDTH,
        machines: zone.anchors.length,
      };
    });

    return {
      zones,
      anchors,
      others,
      width: CANVAS_W,
      height: canvasH,
      outside,
      scaleLabel: `${Math.round(worldW)} × ${Math.round(worldH)} m shown`,
    };
  }, [cluster, db, snapshot, zoneNames]);

  if (!model) {
    return (
      <Text color="fg.subtle" fontSize="14px" py={5}>
        No building positions in this save.
      </Text>
    );
  }

  return (
    <Box>
      <Box
        overflowX="auto"
        bg="bg.surface"
        borderWidth="1px"
        borderColor="border.default"
        px={2}
        py={2}
      >
        <svg
          viewBox={`0 0 ${model.width} ${model.height}`}
          role="img"
          aria-label={`Map of the base, ${model.scaleLabel}, with ${model.anchors.length} machines in ${model.zones.length} zones`}
          style={{ maxWidth: '100%', height: 'auto', display: 'block' }}
        >
          {model.zones.map((zone) => (
            <g key={zone.id}>
              <SvgRect
                x={zone.x}
                y={zone.y}
                width={zone.width}
                height={zone.height}
                rx={2}
                fill="bg.muted"
                stroke="border.default"
                strokeWidth={1}
                strokeDasharray="5 4"
                opacity={0.85}
              >
                <title>
                  {zone.label} — {zone.machines} machines
                </title>
              </SvgRect>
              {zone.showLabel ? (
                <SvgText
                  x={zone.x + 3}
                  y={zone.y - 5}
                  fill="fg.muted"
                  fontSize="11px"
                  fontFamily="mono"
                >
                  {zone.label}
                </SvgText>
              ) : null}
            </g>
          ))}

          {/* Belts, poles and foundations: present, but never the subject. */}
          <g>
            {model.others.map((point) => (
              <SvgCircle
                key={point.key}
                cx={point.x}
                cy={point.y}
                r={1.6}
                fill="fg.subtle"
                opacity={0.4}
              />
            ))}
          </g>

          <g>
            {model.anchors.map((point) => (
              <SvgRect
                key={point.key}
                x={point.x - 4}
                y={point.y - 4}
                width={8}
                height={8}
                rx={1}
                fill={point.tone ? TONE_FILL[point.tone] : 'fg.subtle'}
                stroke="bg.surface"
                strokeWidth={1.5}
              >
                <title>{point.title}</title>
              </SvgRect>
            ))}
          </g>
        </svg>
      </Box>

      <Flex gap={4} mt={2.5} wrap="wrap" align="center">
        <Flex align="center" gap={1.5}>
          <Box w="9px" h="9px" bg="status.ok" />
          <Label>95%+</Label>
        </Flex>
        <Flex align="center" gap={1.5}>
          <Box w="9px" h="9px" bg="status.warn" />
          <Label>60–95%</Label>
        </Flex>
        <Flex align="center" gap={1.5}>
          <Box w="9px" h="9px" bg="status.crit" />
          <Label>below 60%</Label>
        </Flex>
        <Flex align="center" gap={1.5}>
          <Box w="6px" h="6px" borderRadius="full" bg="fg.subtle" opacity={0.5} />
          <Label>belts, poles, foundations</Label>
        </Flex>
        <Label>
          {model.scaleLabel} · north is up
          {model.outside > 0 ? ` · ${model.outside} buildings outside the frame` : ''}
        </Label>
      </Flex>
    </Box>
  );
}
