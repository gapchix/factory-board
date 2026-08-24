'use client';

import { Box, chakra, Flex, Text } from '@chakra-ui/react';
import { groupNearby, type ClusterResult } from '@factory-board/layout';
import type { GameDatabase } from '@factory-board/planner';
import type { WorldSnapshot } from '@factory-board/save-reader';
import { useMemo } from 'react';
import { buildingName, itemName } from '@/lib/format';
import { uptimeTone, type StatusTone } from './charts';
import { Label } from './primitives';

/**
 * A top-down plan of the base, drawn from the save.
 *
 * The first version of this plotted every building as a dot and was unreadable —
 * a star field with no structure. What makes a factory legible is its *wiring*:
 * belts carry real spline geometry and power lines carry their endpoints, so
 * both are drawn as routes. Machines then sit on that skeleton, coloured by the
 * uptime of the line they run, so a starving cell shows up in the corner of the
 * base you actually built it in.
 *
 * Game axes map to screen without a flip: +X is east, +Y is south.
 */

const SvgRect = chakra('rect');
const SvgPath = chakra('path');
const SvgLine = chakra('line');
const SvgText = chakra('text');

/**
 * Fixed canvas, world letterboxed into it.
 *
 * Shaping the viewBox to the world means the SVG is upscaled to the container by
 * whatever the aspect ratio demands, and an 11px label renders at 45px. On a
 * fixed canvas one unit is about one pixel, so type is the size it says.
 */
const CANVAS_W = 1180;
const MIN_CANVAS_H = 420;
const MAX_CANVAS_H = 860;
const PAD = 34;

const LABEL_SIZE = 10.5;
const CHAR_W = 0.58;
const MACHINE_R = 4.5;
/** Uppercase plus 0.08em tracking runs about 25% wider than lower-case body text. */
const ZONE_CAPTION_WIDEN = 1.25;
/**
 * Machines running the same recipe within this distance are drawn as one mark
 * with a count. Four smelters side by side are one thing you built, and four
 * copies of the label "Iron Ingot" is noise, not information.
 */
const MERGE_RADIUS_M = 18;

const TONE_FILL: Record<StatusTone, string> = {
  ok: 'status.ok',
  warn: 'status.warn',
  crit: 'status.crit',
};

/** Endpoints of the routes we already draw as lines; dots would double them up. */
const DRAWN_AS_ROUTE =
  /ConveyorBelt|ConveyorLift|PowerLine|Pipeline|ConveyorPole|PowerPole|PowerConnection/;
/** Worth a mark and a name even though they make nothing. */
const LANDMARK =
  /SpaceElevator|TradingPost|Miner|Generator|WaterPump|Workshop|LookoutTower|ResourceSink|Portal/;

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/** Merged marks grow a little with the machines they stand for, but not linearly. */
function markRadius(count: number): number {
  return MACHINE_R + Math.min(3, Math.sqrt(Math.max(1, count) - 1) * 1.6);
}

/** A round number of metres that lands near a target width on screen. */
function niceScale(metresPerUnit: number, targetUnits: number): number {
  const raw = targetUnits * metresPerUnit;
  const steps = [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];
  return steps.find((s) => s >= raw) ?? steps[steps.length - 1]!;
}

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
     * Frame the zones, not the whole world. A single power line to a distant
     * miner stretches the bounding box across hundreds of metres, and fitting to
     * that squashes the factory into a corner. Anything outside is counted.
     */
    const framed = cluster.zones.length > 0 ? cluster.zones.map((z) => z.bounds) : [cluster.bounds];
    const raw = {
      minX: Math.min(...framed.map((b) => b.minX)),
      minY: Math.min(...framed.map((b) => b.minY)),
      maxX: Math.max(...framed.map((b) => b.maxX)),
      maxY: Math.max(...framed.map((b) => b.maxY)),
    };
    const marginX = Math.max(40, (raw.maxX - raw.minX) * 0.22);
    const marginY = Math.max(40, (raw.maxY - raw.minY) * 0.22);
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
    const canvasH = Math.round(
      Math.min(MAX_CANVAS_H, Math.max(MIN_CANVAS_H, (CANVAS_W * worldH) / worldW)),
    );
    const scale = Math.min((CANVAS_W - PAD * 2) / worldW, (canvasH - PAD * 2) / worldH);
    const offsetX = (CANVAS_W - worldW * scale) / 2;
    const offsetY = (canvasH - worldH * scale) / 2;
    const px = (x: number) => offsetX + (x - bounds.minX) * scale;
    const py = (y: number) => offsetY + (y - bounds.minY) * scale;

    // Routes: the skeleton the factory hangs on.
    const routes = { belt: [] as string[], pipe: [] as string[], power: [] as string[] };
    for (const path of snapshot.paths) {
      const visible = path.points.filter(([x, y]) => inFrame(x, y));
      if (visible.length < 2) continue;
      const d = visible.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${px(x)} ${py(y)}`).join(' ');
      routes[path.kind].push(d);
    }

    const uptimeOf = (recipe: string | undefined) =>
      recipe ? (snapshot.lines[recipe]?.uptime ?? null) : null;

    interface Mark {
      x: number;
      y: number;
      tone: StatusTone | null;
      landmark: boolean;
      name: string;
      count: number;
      title: string;
      priority: number;
    }

    interface Candidate {
      worldX: number;
      worldY: number;
      key: string;
      landmark: boolean;
      name: string;
      machine: string;
      uptime: number | null;
    }

    const candidates: Candidate[] = [];
    let outside = 0;

    for (const placement of snapshot.placements) {
      if (!inFrame(placement.x, placement.y)) {
        outside += 1;
        continue;
      }
      if (DRAWN_AS_ROUTE.test(placement.machine)) continue;

      const isLandmark = LANDMARK.test(placement.machine);
      if (!placement.recipe && !isLandmark) continue;

      const name = placement.recipe
        ? itemName(db, db.recipes[placement.recipe]?.outputs[0]?.item ?? placement.recipe)
        : buildingName(db, placement.machine);

      candidates.push({
        worldX: placement.x,
        worldY: placement.y,
        // Same recipe, or same kind of landmark: those are what may merge.
        key: placement.recipe ?? placement.machine,
        landmark: !placement.recipe,
        name,
        machine: buildingName(db, placement.machine),
        uptime: uptimeOf(placement.recipe),
      });
    }

    // Merge neighbours that are the same thing, so four smelters in a row are
    // one mark reading "Iron Ingot ×4" rather than four identical labels.
    const byKind = new Map<string, Candidate[]>();
    for (const candidate of candidates) {
      const list = byKind.get(candidate.key);
      if (list) list.push(candidate);
      else byKind.set(candidate.key, [candidate]);
    }

    const marks: Mark[] = [];
    for (const list of byKind.values()) {
      for (const group of groupNearby(
        list,
        (c) => ({ x: c.worldX, y: c.worldY }),
        MERGE_RADIUS_M,
      )) {
        const first = group[0]!;
        const cx = group.reduce((sum, c) => sum + c.worldX, 0) / group.length;
        const cy = group.reduce((sum, c) => sum + c.worldY, 0) / group.length;
        const uptime = first.uptime;
        marks.push({
          x: px(cx),
          y: py(cy),
          tone: uptime === null ? null : uptimeTone(uptime),
          landmark: first.landmark,
          name: group.length > 1 ? `${first.name} ×${group.length}` : first.name,
          count: group.length,
          title:
            `${group.length}× ${first.machine}` +
            (first.landmark ? '' : ` — ${first.name}`) +
            (uptime === null ? '' : ` · ${Math.round(uptime * 100)}% uptime`),
          // Landmarks first, then the worst performers: when two labels collide,
          // those are the ones worth keeping.
          priority:
            (first.landmark ? 100 : 0) + (uptime === null ? 50 : 100 - uptime * 100) + group.length,
        });
      }
    }

    const zones = cluster.zones.map((zone) => {
      const x = px(zone.bounds.minX) - 12;
      const y = py(zone.bounds.minY) - 12;
      return {
        id: zone.id,
        label: zoneNames[zone.id] ?? zone.label,
        x,
        y,
        width: Math.max(28, px(zone.bounds.maxX) - x + 12),
        height: Math.max(28, py(zone.bounds.maxY) - y + 12),
        machines: zone.anchors.length,
      };
    });

    /*
     * Label placement: try four positions per mark, take the first that is
     * clear, and drop the label entirely rather than stack it. Hover still
     * carries the name.
     *
     * The occupied set is seeded with the zone captions *and every mark*, so a
     * label never lands on a machine it does not belong to.
     */
    const taken: Box[] = [
      // Zone captions render uppercase with letter-spacing, so they are wider
      // than a plain character count suggests. Under-estimating here is what
      // lets a machine label land on top of one.
      ...zones.map((z) => ({
        x: z.x,
        y: z.y - 15,
        w: z.label.length * LABEL_SIZE * CHAR_W * ZONE_CAPTION_WIDEN + 10,
        h: 16,
      })),
      ...marks.map((m) => ({
        x: m.x - markRadius(m.count) - 1,
        y: m.y - markRadius(m.count) - 1,
        w: markRadius(m.count) * 2 + 2,
        h: markRadius(m.count) * 2 + 2,
      })),
    ];

    const labels: { x: number; y: number; text: string; landmark: boolean }[] = [];
    for (const mark of [...marks].sort((a, b) => b.priority - a.priority)) {
      const w = mark.name.length * LABEL_SIZE * CHAR_W;
      const h = LABEL_SIZE + 3;
      const r = markRadius(mark.count);
      const options: { x: number; y: number; baseline: number }[] = [
        { x: mark.x + r + 4, y: mark.y - h / 2, baseline: mark.y + 3.5 },
        { x: mark.x - r - 4 - w, y: mark.y - h / 2, baseline: mark.y + 3.5 },
        { x: mark.x - w / 2, y: mark.y - r - 4 - h, baseline: mark.y - r - 6 },
        { x: mark.x - w / 2, y: mark.y + r + 4, baseline: mark.y + r + 4 + LABEL_SIZE },
      ];

      const spot = options.find((option) => {
        const box = { x: option.x, y: option.y, w, h };
        if (box.x < 2 || box.x + box.w > CANVAS_W - 2) return false;
        if (box.y < 2 || box.y + box.h > canvasH - 26) return false;
        return !taken.some((t) => overlaps(box, t));
      });
      if (!spot) continue;

      taken.push({ x: spot.x, y: spot.y, w, h });
      labels.push({ x: spot.x, y: spot.baseline, text: mark.name, landmark: mark.landmark });
    }

    const metresPerUnit = 1 / scale;
    const barMetres = niceScale(metresPerUnit, 130);

    return {
      zones,
      marks,
      labels,
      routes,
      outside,
      width: CANVAS_W,
      height: canvasH,
      bar: { metres: barMetres, units: barMetres * scale },
      extent: `${Math.round(worldW)} × ${Math.round(worldH)} m`,
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
          aria-label={`Map of the base, ${model.extent}, showing ${model.marks.length} machines and landmarks across ${model.zones.length} zones, joined by belts and power lines`}
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
                strokeDasharray="6 4"
                opacity={0.7}
              >
                <title>
                  {zone.label} — {zone.machines} machines
                </title>
              </SvgRect>
              <SvgText
                x={zone.x + 3}
                y={zone.y - 5}
                fill="fg.muted"
                fontSize={`${LABEL_SIZE}px`}
                fontFamily="mono"
                letterSpacing="0.08em"
              >
                {zone.label.toUpperCase()}
              </SvgText>
            </g>
          ))}

          {/* Power first: it is the faintest layer and everything sits on top. */}
          <g fill="none" strokeLinecap="round">
            {model.routes.power.map((d, i) => (
              <SvgPath key={`w${i}`} d={d} stroke="fg.subtle" strokeWidth={0.7} opacity={0.45} />
            ))}
            {model.routes.pipe.map((d, i) => (
              <SvgPath key={`p${i}`} d={d} stroke="steel.400" strokeWidth={2.4} opacity={0.55} />
            ))}
            {model.routes.belt.map((d, i) => (
              <SvgPath key={`b${i}`} d={d} stroke="steel.500" strokeWidth={2.2} opacity={0.85} />
            ))}
          </g>

          <g>
            {model.marks.map((mark, i) =>
              mark.landmark ? (
                <SvgRect
                  key={`m${i}`}
                  x={mark.x - 3.5}
                  y={mark.y - 3.5}
                  width={7}
                  height={7}
                  fill="bg.surface"
                  stroke="fg.muted"
                  strokeWidth={1.5}
                >
                  <title>{mark.title}</title>
                </SvgRect>
              ) : (
                <SvgRect
                  key={`m${i}`}
                  x={mark.x - markRadius(mark.count)}
                  y={mark.y - markRadius(mark.count)}
                  width={markRadius(mark.count) * 2}
                  height={markRadius(mark.count) * 2}
                  rx={1}
                  fill={mark.tone ? TONE_FILL[mark.tone] : 'fg.subtle'}
                  stroke="bg.surface"
                  strokeWidth={1.5}
                >
                  <title>{mark.title}</title>
                </SvgRect>
              ),
            )}
          </g>

          <g>
            {model.labels.map((label, i) => (
              <SvgText
                key={`l${i}`}
                x={label.x}
                y={label.y}
                fill={label.landmark ? 'fg.muted' : 'fg.default'}
                fontSize={`${LABEL_SIZE}px`}
                fontFamily="mono"
              >
                {label.text}
              </SvgText>
            ))}
          </g>

          {/* Scale bar, bottom left. */}
          <g>
            <SvgLine
              x1={PAD}
              y1={model.height - 18}
              x2={PAD + model.bar.units}
              y2={model.height - 18}
              stroke="fg.muted"
              strokeWidth={2}
            />
            <SvgLine
              x1={PAD}
              y1={model.height - 22}
              x2={PAD}
              y2={model.height - 14}
              stroke="fg.muted"
              strokeWidth={2}
            />
            <SvgLine
              x1={PAD + model.bar.units}
              y1={model.height - 22}
              x2={PAD + model.bar.units}
              y2={model.height - 14}
              stroke="fg.muted"
              strokeWidth={2}
            />
            <SvgText
              x={PAD + model.bar.units + 7}
              y={model.height - 14}
              fill="fg.muted"
              fontSize="10.5px"
              fontFamily="mono"
            >
              {model.bar.metres} m
            </SvgText>
            <SvgText
              x={CANVAS_W - PAD}
              y={model.height - 14}
              fill="fg.subtle"
              fontSize="10.5px"
              fontFamily="mono"
              textAnchor="end"
            >
              N ↑
            </SvgText>
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
          <Label>under 60%</Label>
        </Flex>
        <Flex align="center" gap={1.5}>
          <Box w="9px" h="9px" bg="bg.surface" borderWidth="1.5px" borderColor="fg.muted" />
          <Label>miners, power, HUB</Label>
        </Flex>
        <Flex align="center" gap={1.5}>
          <Box w="14px" h="2px" bg="steel.500" />
          <Label>belts</Label>
        </Flex>
        <Flex align="center" gap={1.5}>
          <Box w="14px" h="1px" bg="fg.subtle" />
          <Label>power</Label>
        </Flex>
        <Label>
          {model.extent}
          {model.outside > 0 ? ` · ${model.outside} buildings outside the frame` : ''}
        </Label>
      </Flex>
    </Box>
  );
}
