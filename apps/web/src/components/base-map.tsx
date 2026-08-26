'use client';

import { Box, Button, chakra, Flex, Text } from '@chakra-ui/react';
import {
  frameContent,
  groupNearby,
  sampleAlong,
  type Bounds,
  type ClusterResult,
} from '@factory-board/layout';
import type { GameDatabase } from '@factory-board/planner';
import type { BuildingPlacement, WorldSnapshot } from '@factory-board/save-reader';
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
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
 *
 * The map pans and zooms, and the whole picture is rebuilt at the current view
 * rather than magnified. That costs a fraction of a millisecond per frame and
 * buys what magnification cannot: type stays 10.5 px at every zoom, labels
 * dropped for want of room reappear as room appears, and machines drawn as one
 * mark separate once they are far enough apart on screen to be worth telling
 * apart. Zooming in reveals detail rather than enlarging it.
 */

/*
 * Theme tokens reach SVG through the chakra factory — see ARCHITECTURE.md. One
 * prop must *not* go through it: `transform` is a Chakra style prop, so an SVG
 * transform list handed to a chakra element is read as CSS, found to be invalid
 * and dropped, and every mark lands on the origin. Positioning goes on a plain
 * `<g>` wrapper, which passes its attributes through untouched.
 */
const SvgRect = chakra('rect');
const SvgPath = chakra('path');
const SvgLine = chakra('line');
const SvgText = chakra('text');
const SvgG = chakra('g');

/**
 * The canvas takes the shape of the base, inside a box it may not exceed.
 *
 * One unit is one pixel and the SVG is drawn at its natural size, so an 11 px
 * label renders at 11 px. That is the constraint the rest follows from: the
 * viewBox cannot be shaped to the world and then stretched to the container,
 * because the same stretch lands on the type.
 *
 * So instead the *canvas* is shaped to the world. Both sides are cut to the
 * content rather than one, which is what stops a deep base from being drawn as
 * a thin ribbon down the middle of a wide white sheet: 1000 m of factory
 * across 450 m of ground used 30% of the old fixed width. Now it is a portrait
 * panel with the factory filling it, centred in the surface it sits in.
 */
const MAX_CANVAS_W = 1180;
const MIN_CANVAS_W = 380;
const MAX_CANVAS_H = 880;
const MIN_CANVAS_H = 300;
const PAD = 30;

const LABEL_SIZE = 10.5;
const CHAR_W = 0.58;
const MACHINE_R = 5;
/** Uppercase plus 0.08em tracking runs about 25% wider than lower-case body text. */
const ZONE_CAPTION_WIDEN = 1.25;
/** Height of a zone's caption band. */
const CAPTION_H = 15;
/** Breathing room between a zone's machines and its boundary. */
const ZONE_PAD = 13;
/**
 * How far out from a mark each ring of label positions sits. Past the first,
 * a label is joined to its mark by a leader line.
 */
const LABEL_RINGS = [4, 13, 26];
/** Clear space kept either side of a placed label, on top of its own width. */
const LABEL_GAP = 4;
/**
 * Machines running the same recipe merge into one mark with a count while they
 * are closer than this *on screen*. Four smelters side by side are one thing you
 * built, and four copies of the label "Iron Ingot" is noise — but only until you
 * zoom in far enough that there is room to draw them apart.
 */
const MERGE_PX = 64;
/** Machines this close in the world stay one cell however far you zoom in. */
const MIN_MERGE_M = 2;

/**
 * Slack around the framed content, so labels have somewhere to go. Small,
 * because PAD already holds a margin in canvas units and leader lines mean a
 * label no longer needs open ground right beside its mark.
 */
const FRAME_MARGIN = 0.03;
const MIN_FRAME_MARGIN_M = 6;

const MAX_ZOOM = 16;
const ZOOM_STEP = 1.5;
/** Room left around a zone when focusing it, for its caption and labels. */
const FOCUS_PAD = 90;

/** Belt chevrons, spaced along the run rather than per segment. */
const ARROW_SPACING = 58;
const MIN_ARROW_RUN = 30;
const ARROW = 'M 0 0 L -5 -2.9 L -5 2.9 Z';

/** How far inside the edge a pointer to off-map content sits. */
const EDGE_INSET = 18;
const EDGE_MERGE_PX = 46;

const TONE_FILL: Record<StatusTone, string> = {
  ok: 'status.ok',
  warn: 'status.warn',
  crit: 'status.crit',
};

/** The same three tones washed out far enough to lie under a drawing. */
const TONE_SUBTLE: Record<StatusTone, string> = {
  ok: 'status.okSubtle',
  warn: 'status.warnSubtle',
  crit: 'status.critSubtle',
};

/** Endpoints of the routes we already draw as lines; dots would double them up. */
const DRAWN_AS_ROUTE =
  /ConveyorBelt|ConveyorLift|PowerLine|Pipeline|ConveyorPole|PowerPole|PowerConnection/;
/** Worth a mark and a name even though they make nothing. */
const LANDMARK =
  /SpaceElevator|TradingPost|Miner|Generator|WaterPump|Workshop|LookoutTower|ResourceSink|Portal/;

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface View {
  readonly cx: number;
  readonly cy: number;
  readonly zoom: number;
}

/** The frame the map opens on, and the scale that fits it to the canvas. */
interface Home {
  readonly bounds: Bounds;
  readonly canvasW: number;
  readonly canvasH: number;
  readonly scale: number;
  readonly center: { readonly x: number; readonly y: number };
  readonly outside: readonly BuildingPlacement[];
}

const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

const contains = (bounds: Bounds, x: number, y: number) =>
  x >= bounds.minX && x <= bounds.maxX && y >= bounds.minY && y <= bounds.maxY;

/** Merged marks grow a little with the machines they stand for, but not linearly. */
function markRadius(count: number): number {
  return MACHINE_R + Math.min(3, Math.sqrt(Math.max(1, count) - 1) * 1.6);
}

/** A round number of metres that lands near a target width on screen. */
function niceScale(metresPerUnit: number, targetUnits: number): number {
  const raw = targetUnits * metresPerUnit;
  const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000];
  return steps.find((s) => s >= raw) ?? steps[steps.length - 1]!;
}

function padBounds(bounds: Bounds): Bounds {
  const marginX = Math.max(MIN_FRAME_MARGIN_M, (bounds.maxX - bounds.minX) * FRAME_MARGIN);
  const marginY = Math.max(MIN_FRAME_MARGIN_M, (bounds.maxY - bounds.minY) * FRAME_MARGIN);
  return {
    minX: bounds.minX - marginX,
    minY: bounds.minY - marginY,
    maxX: bounds.maxX + marginX,
    maxY: bounds.maxY + marginY,
  };
}

/** The map's own controls, in the same vocabulary as the rest of the board. */
function MapButton({
  children,
  active = false,
  disabled = false,
  label,
  onClick,
}: {
  children: ReactNode;
  active?: boolean;
  disabled?: boolean;
  label?: string;
  onClick: () => void;
}) {
  return (
    <Button
      size="xs"
      variant="outline"
      borderRadius="0"
      fontFamily="mono"
      fontSize="11px"
      letterSpacing="0.08em"
      textTransform="uppercase"
      px={2.5}
      minW="auto"
      disabled={disabled}
      borderColor={active ? 'accent.solid' : 'border.default'}
      color={active ? 'accent.solid' : 'fg.muted'}
      bg={active ? 'accent.subtle' : 'transparent'}
      _hover={{ borderColor: active ? 'accent.solid' : 'fg.muted' }}
      {...(label === undefined ? {} : { 'aria-label': label })}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

export function BaseMap({
  db,
  snapshot,
  cluster,
  zoneNames,
  zoneUptimes,
  selectedZoneId,
  onSelectZone,
}: {
  db: GameDatabase;
  snapshot: WorldSnapshot;
  cluster: ClusterResult<BuildingPlacement>;
  zoneNames: Readonly<Record<string, string>>;
  /**
   * Worked out once, next to the zone cards, so the wash on the map and the
   * rule on the card below it can never disagree about how a zone is doing.
   */
  zoneUptimes: Readonly<Record<string, number | null>>;
  selectedZoneId: string | null;
  onSelectZone: (id: string | null) => void;
}) {
  const [fit, setFit] = useState<'base' | 'all'>('base');
  const [view, setView] = useState<View | null>(null);

  const clipId = `fb-map-${useId().replace(/:/g, '')}`;
  const surfaceRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  /*
   * Pointer and wheel events arrive faster than React commits, and both handlers
   * derive the next view from the current one — so the current one is kept here
   * and written synchronously rather than read back from state a frame late.
   */
  const stateRef = useRef<{ home: Home | null; view: View | null }>({ home: null, view: null });
  const dragRef = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);

  /** Everything the map draws a mark for, split into what is worth framing and what is not. */
  const content = useMemo(
    () =>
      frameContent(
        snapshot.placements.filter(
          (placement) =>
            !DRAWN_AS_ROUTE.test(placement.machine) &&
            (placement.recipe !== undefined || LANDMARK.test(placement.machine)),
        ),
        (placement) => ({ x: placement.x, y: placement.y }),
      ),
    [snapshot],
  );

  const home = useMemo((): Home | null => {
    const raw =
      fit === 'all' ? (cluster.bounds ?? content.bounds) : (content.bounds ?? cluster.bounds);
    if (!raw) return null;
    const bounds = padBounds(raw);
    const worldW = Math.max(1, bounds.maxX - bounds.minX);
    const worldH = Math.max(1, bounds.maxY - bounds.minY);
    // Fit the world into the largest canvas allowed, then cut the canvas back to
    // what the fit actually used — on both axes, so neither is left holding a
    // band of empty ground.
    const fitted = Math.min((MAX_CANVAS_W - PAD * 2) / worldW, (MAX_CANVAS_H - PAD * 2) / worldH);
    const canvasW = Math.round(
      Math.min(MAX_CANVAS_W, Math.max(MIN_CANVAS_W, worldW * fitted + PAD * 2)),
    );
    const canvasH = Math.round(
      Math.min(MAX_CANVAS_H, Math.max(MIN_CANVAS_H, worldH * fitted + PAD * 2)),
    );
    return {
      bounds,
      canvasW,
      canvasH,
      scale: Math.min((canvasW - PAD * 2) / worldW, (canvasH - PAD * 2) / worldH),
      center: { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 },
      outside: fit === 'all' ? [] : content.outside,
    };
  }, [cluster.bounds, content, fit]);

  const setViewNow = useCallback((next: View | null) => {
    stateRef.current.view = next;
    setView(next);
  }, []);

  // A new frame is a new map: open it at the top.
  useEffect(() => {
    stateRef.current.home = home;
    stateRef.current.view = null;
    setView(null);
  }, [home]);

  /** Keep the visible rectangle over the content, and the zoom in range. */
  const clampView = useCallback((next: View, frame: Home): View => {
    const zoom = Math.min(MAX_ZOOM, Math.max(1, next.zoom));
    const scale = frame.scale * zoom;
    const axis = (value: number, min: number, max: number, half: number) =>
      max - min <= half * 2 ? (min + max) / 2 : Math.min(max - half, Math.max(min + half, value));
    return {
      zoom,
      cx: axis(next.cx, frame.bounds.minX, frame.bounds.maxX, frame.canvasW / 2 / scale),
      cy: axis(next.cy, frame.bounds.minY, frame.bounds.maxY, frame.canvasH / 2 / scale),
    };
  }, []);

  const currentView = useCallback(
    (frame: Home): View =>
      stateRef.current.view ?? { cx: frame.center.x, cy: frame.center.y, zoom: 1 },
    [],
  );

  /** Returns whether the zoom actually moved, so the wheel can fall through. */
  const zoomBy = useCallback(
    (factor: number, anchor?: { x: number; y: number }): boolean => {
      const frame = stateRef.current.home;
      if (!frame) return false;
      const from = currentView(frame);
      const zoom = Math.min(MAX_ZOOM, Math.max(1, from.zoom * factor));
      if (Math.abs(zoom - from.zoom) < 1e-6) return false;
      // Hold the world point under the cursor still while the scale changes.
      const offsetX = anchor ? anchor.x - frame.canvasW / 2 : 0;
      const offsetY = anchor ? anchor.y - frame.canvasH / 2 : 0;
      const worldX = from.cx + offsetX / (frame.scale * from.zoom);
      const worldY = from.cy + offsetY / (frame.scale * from.zoom);
      setViewNow(
        clampView(
          {
            cx: worldX - offsetX / (frame.scale * zoom),
            cy: worldY - offsetY / (frame.scale * zoom),
            zoom,
          },
          frame,
        ),
      );
      return true;
    },
    [clampView, currentView, setViewNow],
  );

  const focusBounds = useCallback(
    (target: Bounds, frame: Home) => {
      const width = Math.max(8, target.maxX - target.minX);
      const depth = Math.max(8, target.maxY - target.minY);
      setViewNow(
        clampView(
          {
            cx: (target.minX + target.maxX) / 2,
            cy: (target.minY + target.maxY) / 2,
            zoom:
              Math.min(
                (frame.canvasW - FOCUS_PAD * 2) / width,
                (frame.canvasH - FOCUS_PAD * 2) / depth,
              ) / frame.scale,
          },
          frame,
        ),
      );
    },
    [clampView, setViewNow],
  );

  // Selection drives the view, wherever the selection came from — a zone on the
  // map, or one of the zone cards under it.
  useEffect(() => {
    const frame = stateRef.current.home;
    if (!frame) return;
    if (!selectedZoneId) {
      setViewNow(null);
      return;
    }
    const zone = cluster.zones.find((candidate) => candidate.id === selectedZoneId);
    if (zone) focusBounds(zone.bounds, frame);
  }, [selectedZoneId, cluster.zones, focusBounds, setViewNow]);

  /*
   * React registers `wheel` passively at the root, so `onWheel` cannot cancel a
   * page scroll. This listener is bound directly, and cancels only when the zoom
   * actually changed — so scrolling out at the widest view carries on down the
   * page instead of trapping the reader on the map.
   */
  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return undefined;
    const onWheel = (event: WheelEvent) => {
      const svg = svgRef.current;
      const frame = stateRef.current.home;
      if (!svg || !frame) return;
      const rect = svg.getBoundingClientRect();
      if (rect.width === 0) return;
      const perPixel = frame.canvasW / rect.width;
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 400 : 1;
      const moved = zoomBy(Math.exp((-event.deltaY * unit) / 480), {
        x: (event.clientX - rect.left) * perPixel,
        y: (event.clientY - rect.top) * perPixel,
      });
      if (moved) event.preventDefault();
    };
    surface.addEventListener('wheel', onWheel, { passive: false });
    return () => surface.removeEventListener('wheel', onWheel);
  }, [zoomBy]);

  const model = useMemo(() => {
    if (!home) return null;
    const { canvasW, canvasH } = home;
    const active = view ?? { cx: home.center.x, cy: home.center.y, zoom: 1 };
    const scale = home.scale * active.zoom;
    const px = (x: number) => canvasW / 2 + (x - active.cx) * scale;
    const py = (y: number) => canvasH / 2 + (y - active.cy) * scale;

    const visible: Bounds = {
      minX: active.cx - canvasW / 2 / scale,
      maxX: active.cx + canvasW / 2 / scale,
      minY: active.cy - canvasH / 2 / scale,
      maxY: active.cy + canvasH / 2 / scale,
    };

    /*
     * A survey grid on round world coordinates, which is the difference between
     * ground and blank paper. A factory is a diagonal ribbon inside a rectangle
     * however tightly it is framed — on this save the buildings touch under 3%
     * of the frame — so the space between the cells is most of the drawing, and
     * it should read as somewhere rather than as nothing. The lines are pinned
     * to world metres, so they slide under the base as it is panned and hold
     * still as it is zoomed, which is also what makes distance readable at a
     * glance: every square is the scale bar.
     */
    const gridStepM = niceScale(1 / scale, 115);
    const gridX: number[] = [];
    const gridY: number[] = [];
    for (
      let x = Math.ceil(visible.minX / gridStepM) * gridStepM;
      x <= visible.maxX;
      x += gridStepM
    ) {
      gridX.push(px(x));
    }
    for (
      let y = Math.ceil(visible.minY / gridStepM) * gridStepM;
      y <= visible.maxY;
      y += gridStepM
    ) {
      gridY.push(py(y));
    }

    /*
     * Routes are drawn whole and clipped by the canvas rather than having their
     * points filtered. Filtering drops the segment that crosses the edge, so a
     * belt passing through the view vanished the moment both its ends left it.
     */
    const routes = { belt: [] as string[], pipe: [] as string[], power: [] as string[] };
    const arrows: { x: number; y: number; angle: number }[] = [];
    for (const path of snapshot.paths) {
      const points = path.points.map(([x, y]) => [px(x), py(y)] as [number, number]);
      if (
        points.every(([x]) => x < 0) ||
        points.every(([x]) => x > canvasW) ||
        points.every(([, y]) => y < 0) ||
        points.every(([, y]) => y > canvasH)
      ) {
        continue;
      }
      routes[path.kind].push(
        points
          .map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`)
          .join(' '),
      );
      /*
       * Belts only. A conveyor's spline runs from its input connection to its
       * output, so point order is the direction the ore travels — checked
       * against the one building that can only ever be a source: every belt
       * touching a miner in the reference save starts there, none ends there.
       * A pipe carries no such promise; which way fluid moves depends on the
       * pumps at either end.
       */
      if (path.kind !== 'belt') continue;
      for (const marker of sampleAlong(points, ARROW_SPACING, { minLength: MIN_ARROW_RUN })) {
        if (marker.x < 0 || marker.x > canvasW || marker.y < 0 || marker.y > canvasH) continue;
        arrows.push(marker);
      }
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
      zoneId: string | undefined;
    }

    interface Candidate {
      worldX: number;
      worldY: number;
      key: string;
      landmark: boolean;
      name: string;
      machine: string;
      uptime: number | null;
      /** What a miner is pulling or a generator burning, for the hover. */
      resource: string | undefined;
      zoneId: string | undefined;
    }

    const zoneAt = (x: number, y: number) =>
      cluster.zones.find((zone) => contains(zone.bounds, x, y))?.id;

    const candidates: Candidate[] = [];
    for (const placement of content.inside) {
      if (!contains(visible, placement.x, placement.y)) continue;

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
        // An extractor or generator carries its own measurement; a machine's
        // arrives through the line it runs.
        uptime: placement.uptime ?? uptimeOf(placement.recipe),
        resource: placement.resource,
        zoneId: zoneAt(placement.x, placement.y),
      });
    }

    const byKind = new Map<string, Candidate[]>();
    for (const candidate of candidates) {
      const list = byKind.get(candidate.key);
      if (list) list.push(candidate);
      else byKind.set(candidate.key, [candidate]);
    }

    const mergeRadiusM = Math.max(MIN_MERGE_M, MERGE_PX / scale);
    const marks: Mark[] = [];
    for (const list of byKind.values()) {
      for (const group of groupNearby(list, (c) => ({ x: c.worldX, y: c.worldY }), mergeRadiusM)) {
        const first = group[0]!;
        const cx = group.reduce((sum, c) => sum + c.worldX, 0) / group.length;
        const cy = group.reduce((sum, c) => sum + c.worldY, 0) / group.length;
        // Machines merged on a recipe share a line and so share its uptime, but
        // five coal generators each measure their own, and the mark stands for
        // all of them.
        const measured = group.map((c) => c.uptime).filter((value) => value !== null);
        const uptime =
          measured.length > 0 ? measured.reduce((sum, v) => sum + v, 0) / measured.length : null;
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
            (first.resource ? ` — ${itemName(db, first.resource)}` : '') +
            (uptime === null ? '' : ` · ${Math.round(uptime * 100)}% uptime`),
          /*
           * Who wins a collision. Landmarks are the map's anchors and outrank a
           * healthy machine, but not a starving one: at a flat +100 a lookout
           * tower took the space a cell running at 0% needed, which is exactly
           * backwards for a map whose job is to show what is struggling.
           */
          priority:
            (first.landmark ? 40 : 0) + (uptime === null ? 50 : 100 - uptime * 100) + group.length,
          zoneId: first.zoneId,
        });
      }
    }

    /*
     * A zone gets the colour of the work going on inside it — the same tone its
     * card carries below — so the map answers "which part of the base is
     * struggling" from across the room, before a single label is read. Drawn as
     * four grey dashed boxes it answered nothing.
     */
    const zones = cluster.zones.map((zone) => {
      const x = px(zone.bounds.minX) - ZONE_PAD;
      const label = zoneNames[zone.id] ?? zone.label;
      const width = Math.max(30, px(zone.bounds.maxX) - x + ZONE_PAD);
      // The band is cut out of the top of the zone rather than laid over it, so
      // no machine is ever drawn under its own zone's name.
      const y = py(zone.bounds.minY) - ZONE_PAD - CAPTION_H;
      const height = Math.max(30, py(zone.bounds.maxY) - y + ZONE_PAD);

      const uptime = zoneUptimes[zone.id] ?? null;

      // The caption belongs inside its own zone, in a band across the top. Above
      // the box it competed for the same strip of map as the machine labels of
      // whatever sits north of it, and lost about half those fights.
      const captionW = label.length * LABEL_SIZE * CHAR_W * ZONE_CAPTION_WIDEN + 14;
      const captionInside = width >= captionW && height >= CAPTION_H * 2.6;

      return {
        id: zone.id,
        label,
        x,
        y,
        width,
        height,
        captionW,
        captionInside,
        tone: uptime === null ? null : uptimeTone(uptime),
        machines: zone.anchors.length,
        selected: zone.id === selectedZoneId,
      };
    });

    /*
     * Label placement: try the ring of positions around a mark, take the first
     * that is clear, and drop the label rather than stack it. Hover still
     * carries the name, and zooming in makes room for the ones that were cut.
     *
     * Four positions — the four sides, touching — was too few, and the labels
     * that lost ran into each other and into the zone captions anyway. There are
     * now three rings: touching, a step out, and a stride out. The far two are
     * ambiguous on their own, so a label placed there is joined to its mark by a
     * leader line and the reader is never left guessing which machine it names.
     *
     * The occupied set is seeded with the zone captions and every mark, so a
     * label never lands on a machine it does not belong to.
     */
    const taken: Rect[] = [
      // Zone captions render uppercase with letter-spacing, so they are wider
      // than a plain character count suggests. Under-estimating here is what
      // lets a machine label land on top of one.
      ...zones.map((zone) => ({
        x: zone.x - LABEL_GAP,
        y: zone.captionInside ? zone.y : zone.y - CAPTION_H - 3,
        w: zone.captionW + LABEL_GAP * 2,
        h: CAPTION_H + 3,
      })),
      ...marks.map((mark) => ({
        x: mark.x - markRadius(mark.count) - 1,
        y: mark.y - markRadius(mark.count) - 1,
        w: markRadius(mark.count) * 2 + 2,
        h: markRadius(mark.count) * 2 + 2,
      })),
    ];

    const labels: {
      x: number;
      y: number;
      text: string;
      landmark: boolean;
      leader: { x1: number; y1: number; x2: number; y2: number } | null;
    }[] = [];
    for (const mark of [...marks].sort((a, b) => b.priority - a.priority)) {
      const w = mark.name.length * LABEL_SIZE * CHAR_W;
      const h = LABEL_SIZE + 3;
      const r = markRadius(mark.count);

      const options: { x: number; y: number; baseline: number; ring: number }[] = [];
      for (const [ring, gap] of LABEL_RINGS.entries()) {
        const out = r + gap;
        options.push(
          { x: mark.x + out, y: mark.y - h / 2, baseline: mark.y + 3.5, ring },
          { x: mark.x - out - w, y: mark.y - h / 2, baseline: mark.y + 3.5, ring },
          { x: mark.x - w / 2, y: mark.y - out - h, baseline: mark.y - out - 2, ring },
          { x: mark.x - w / 2, y: mark.y + out, baseline: mark.y + out + LABEL_SIZE, ring },
          // Diagonals only past the first ring: touching a corner reads as
          // crooked, a step away reads as deliberate.
          ...(ring === 0
            ? []
            : [
                {
                  x: mark.x + out * 0.72,
                  y: mark.y - out * 0.72 - h,
                  baseline: mark.y - out * 0.72 - 2,
                  ring,
                },
                {
                  x: mark.x - out * 0.72 - w,
                  y: mark.y - out * 0.72 - h,
                  baseline: mark.y - out * 0.72 - 2,
                  ring,
                },
                {
                  x: mark.x + out * 0.72,
                  y: mark.y + out * 0.72,
                  baseline: mark.y + out * 0.72 + LABEL_SIZE,
                  ring,
                },
                {
                  x: mark.x - out * 0.72 - w,
                  y: mark.y + out * 0.72,
                  baseline: mark.y + out * 0.72 + LABEL_SIZE,
                  ring,
                },
              ]),
        );
      }

      const spot = options.find((option) => {
        const box = { x: option.x, y: option.y, w, h };
        if (box.x < 2 || box.x + box.w > canvasW - 2) return false;
        if (box.y < 2 || box.y + box.h > canvasH - 26) return false;
        return !taken.some((t) => overlaps(box, t));
      });
      if (!spot) continue;

      // Reserve a little more than the type occupies. Two labels that merely
      // fail to overlap still read as one run of words.
      taken.push({ x: spot.x - LABEL_GAP, y: spot.y, w: w + LABEL_GAP * 2, h });
      labels.push({
        x: spot.x,
        y: spot.baseline,
        text: mark.name,
        landmark: mark.landmark,
        leader:
          spot.ring === 0
            ? null
            : {
                x1: mark.x,
                y1: mark.y,
                // Meet the label at whichever of its corners faces the mark, so
                // the line stops at the type rather than running under it.
                x2: spot.x + w / 2 < mark.x ? spot.x + w + 2 : spot.x - 2,
                y2: spot.y + h / 2,
              },
      });
    }

    /*
     * What the frame left out does not simply vanish. Each stray is projected
     * onto the edge of the canvas as a pointer, so the map admits there is a
     * miner half a kilometre south rather than quietly cropping it away.
     */
    const edgeMarks = home.outside.map((placement) => {
      const dx = px(placement.x) - canvasW / 2;
      const dy = py(placement.y) - canvasH / 2;
      const length = Math.max(1e-6, Math.hypot(dx, dy));
      const reach = Math.min(
        Math.abs(dx) < 1e-6 ? Infinity : (canvasW / 2 - EDGE_INSET) / Math.abs(dx),
        Math.abs(dy) < 1e-6 ? Infinity : (canvasH / 2 - EDGE_INSET) / Math.abs(dy),
      );
      return {
        x: canvasW / 2 + dx * reach,
        y: canvasH / 2 + dy * reach,
        ux: dx / length,
        uy: dy / length,
        angle: (Math.atan2(dy, dx) * 180) / Math.PI,
        name: buildingName(db, placement.machine),
        distance: Math.hypot(placement.x - home.center.x, placement.y - home.center.y),
      };
    });

    const strays = groupNearby(edgeMarks, (mark) => mark, EDGE_MERGE_PX).map((group) => {
      const first = group[0]!;
      const distance = Math.round(Math.max(...group.map((mark) => mark.distance)) / 10) * 10;
      return {
        x: group.reduce((sum, mark) => sum + mark.x, 0) / group.length,
        y: group.reduce((sum, mark) => sum + mark.y, 0) / group.length,
        ux: first.ux,
        uy: first.uy,
        angle: first.angle,
        text:
          group.length === 1
            ? `${first.name} · ${distance} m`
            : `${group.length} buildings · ${distance} m`,
      };
    });

    return {
      zones,
      marks,
      labels,
      routes,
      arrows,
      strays,
      grid: { x: gridX, y: gridY },
      zoom: active.zoom,
      panned: view !== null,
      canvasW,
      canvasH,
      // One square of the grid, so the bar measures what the reader can already
      // see rather than an unrelated round number beside it.
      bar: { metres: gridStepM, units: gridStepM * scale },
      extent: `${Math.round(visible.maxX - visible.minX)} × ${Math.round(
        visible.maxY - visible.minY,
      )} m`,
    };
  }, [
    cluster.zones,
    content.inside,
    db,
    home,
    selectedZoneId,
    snapshot,
    view,
    zoneNames,
    zoneUptimes,
  ]);

  /*
   * No pointer capture here. Capturing on the press retargets the pointerup to
   * the SVG, which moves the click to their common ancestor — so every click on
   * a zone was swallowed by the map. Capture is taken once a drag has actually
   * started, which is the only time it is needed.
   */
  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    suppressClick.current = false;
    dragRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
  };

  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    const frame = stateRef.current.home;
    if (!drag || drag.id !== event.pointerId || !frame) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width === 0) return;
    const perPixel = frame.canvasW / rect.width;
    const dx = (event.clientX - drag.x) * perPixel;
    const dy = (event.clientY - drag.y) * perPixel;
    // A few pixels of slop, so a click on a zone is not read as a drag.
    if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 3) return;
    if (!drag.moved) event.currentTarget.setPointerCapture(event.pointerId);
    drag.moved = true;
    drag.x = event.clientX;
    drag.y = event.clientY;
    const from = currentView(frame);
    const scale = frame.scale * from.zoom;
    setViewNow(
      clampView({ zoom: from.zoom, cx: from.cx - dx / scale, cy: from.cy - dy / scale }, frame),
    );
  };

  const endDrag = (event: ReactPointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== event.pointerId) return;
    suppressClick.current = drag.moved;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const selectZone = (id: string | undefined) => {
    if (suppressClick.current || id === undefined) return;
    onSelectZone(id === selectedZoneId ? null : id);
  };

  const reset = () => {
    onSelectZone(null);
    setViewNow(null);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const frame = stateRef.current.home;
    if (!frame) return;
    const from = currentView(frame);
    const step = (frame.canvasW * 0.18) / (frame.scale * from.zoom);
    const pan = (dx: number, dy: number) =>
      setViewNow(clampView({ ...from, cx: from.cx + dx * step, cy: from.cy + dy * step }, frame));

    switch (event.key) {
      case 'ArrowLeft':
        pan(-1, 0);
        break;
      case 'ArrowRight':
        pan(1, 0);
        break;
      case 'ArrowUp':
        pan(0, -1);
        break;
      case 'ArrowDown':
        pan(0, 1);
        break;
      case '+':
      case '=':
        zoomBy(ZOOM_STEP);
        break;
      case '-':
      case '_':
        zoomBy(1 / ZOOM_STEP);
        break;
      case '0':
        reset();
        break;
      case 'Escape':
        if (selectedZoneId) onSelectZone(null);
        else setViewNow(null);
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  if (!model) {
    return (
      <Text color="fg.subtle" fontSize="14px" py={5}>
        No building positions in this save.
      </Text>
    );
  }

  const selectedName = model.zones.find((zone) => zone.selected)?.label;
  const canPan = model.zoom > 1;
  const strayCount = content.outside.length;

  return (
    <Box>
      <Flex align="center" gap={2} mb={2.5} wrap="wrap">
        <Label>View</Label>
        <MapButton active={fit === 'base'} onClick={() => setFit('base')}>
          The base
        </MapButton>
        {strayCount > 0 ? (
          <MapButton active={fit === 'all'} onClick={() => setFit('all')}>
            Everything
          </MapButton>
        ) : null}
        {selectedName === undefined ? null : (
          <MapButton
            active
            label={`Clear the focus on ${selectedName}`}
            onClick={() => onSelectZone(null)}
          >
            {selectedName} ✕
          </MapButton>
        )}

        <Box flex="1" minW="8px" />

        <MapButton
          label="Zoom out"
          disabled={model.zoom <= 1}
          onClick={() => zoomBy(1 / ZOOM_STEP)}
        >
          −
        </MapButton>
        <Text
          fontFamily="mono"
          fontSize="11px"
          color="fg.muted"
          minW="48px"
          textAlign="center"
          fontVariantNumeric="tabular-nums"
        >
          {Math.round(model.zoom * 100)}%
        </Text>
        <MapButton
          label="Zoom in"
          disabled={model.zoom >= MAX_ZOOM - 1e-6}
          onClick={() => zoomBy(ZOOM_STEP)}
        >
          +
        </MapButton>
        <MapButton disabled={!model.panned} onClick={reset}>
          Reset
        </MapButton>
      </Flex>

      <Box
        ref={surfaceRef}
        tabIndex={0}
        role="group"
        aria-label="Base map. Drag to pan, scroll to zoom; arrow keys pan, plus and minus zoom, 0 resets."
        onKeyDown={onKeyDown}
        bg="bg.surface"
        borderWidth="1px"
        borderColor="border.default"
        p="6px"
        touchAction="pan-y"
        // A portrait base makes a portrait canvas, and the surface is cut to it
        // rather than the drawing being stranded in the middle of a wide box.
        w="fit-content"
        maxW="100%"
        mx="auto"
        cursor={canPan ? 'grab' : 'default'}
        _active={{ cursor: canPan ? 'grabbing' : 'default' }}
        _focusVisible={{ outline: '2px solid', outlineColor: 'accent.solid', outlineOffset: '1px' }}
      >
        <svg
          ref={svgRef}
          width={model.canvasW}
          height={model.canvasH}
          viewBox={`0 0 ${model.canvasW} ${model.canvasH}`}
          role="img"
          aria-label={`Map of the base, ${model.extent} in view, showing ${model.marks.length} machines and landmarks across ${model.zones.length} zones, joined by belts and power lines`}
          style={{ maxWidth: '100%', height: 'auto', display: 'block', touchAction: 'inherit' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <defs>
            <clipPath id={clipId}>
              <rect x="0" y="0" width={model.canvasW} height={model.canvasH} />
            </clipPath>
          </defs>

          <g clipPath={`url(#${clipId})`}>
            {/* The ground the factory stands on. */}
            <g pointerEvents="none">
              {model.grid.x.map((x, i) => (
                <SvgLine
                  key={`gx${i}`}
                  x1={x}
                  y1={0}
                  x2={x}
                  y2={model.canvasH}
                  stroke="border.subtle"
                  strokeWidth={1}
                />
              ))}
              {model.grid.y.map((y, i) => (
                <SvgLine
                  key={`gy${i}`}
                  x1={0}
                  y1={y}
                  x2={model.canvasW}
                  y2={y}
                  stroke="border.subtle"
                  strokeWidth={1}
                />
              ))}
            </g>

            {model.zones.map((zone) => (
              <SvgG
                key={zone.id}
                role="button"
                tabIndex={0}
                aria-label={`${zone.label}, ${zone.machines} buildings`}
                aria-pressed={zone.selected}
                cursor="pointer"
                opacity={selectedZoneId !== null && !zone.selected ? 0.4 : 1}
                onClick={() => selectZone(zone.id)}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return;
                  event.preventDefault();
                  event.stopPropagation();
                  onSelectZone(zone.id === selectedZoneId ? null : zone.id);
                }}
              >
                <SvgRect
                  x={zone.x}
                  y={zone.y}
                  width={zone.width}
                  height={zone.height}
                  rx={2}
                  fill={
                    zone.selected
                      ? 'accent.subtle'
                      : zone.tone
                        ? TONE_SUBTLE[zone.tone]
                        : 'bg.muted'
                  }
                  stroke={
                    zone.selected
                      ? 'accent.solid'
                      : zone.tone
                        ? TONE_FILL[zone.tone]
                        : 'border.default'
                  }
                  strokeWidth={zone.selected ? 1.6 : 1.2}
                  // The focused zone gets a crisp edge and a lighter wash: at the
                  // same opacity as the rest, the tint muddies the belts under it.
                  fillOpacity={zone.selected ? 0.4 : 0.85}
                  strokeOpacity={zone.selected ? 1 : 0.42}
                >
                  <title>
                    {zone.label} — {zone.machines} buildings
                  </title>
                </SvgRect>
              </SvgG>
            ))}

            {/*
             * Power first: it is the faintest layer and everything sits on top.
             * Belts are drawn twice — a casing in the surface colour, then the
             * line — so a crossing reads as one run passing over another rather
             * than as a smudge where two strokes met.
             */}
            <g fill="none" strokeLinecap="round" pointerEvents="none">
              {model.routes.power.map((d, i) => (
                <SvgPath key={`w${i}`} d={d} stroke="fg.subtle" strokeWidth={0.7} opacity={0.4} />
              ))}
              {model.routes.pipe.map((d, i) => (
                <SvgPath key={`p${i}`} d={d} stroke="steel.300" strokeWidth={2.6} opacity={0.7} />
              ))}
              {model.routes.belt.map((d, i) => (
                <SvgPath key={`bc${i}`} d={d} stroke="bg.surface" strokeWidth={5} opacity={0.75} />
              ))}
              {model.routes.belt.map((d, i) => (
                <SvgPath key={`b${i}`} d={d} stroke="steel.500" strokeWidth={2.4} opacity={0.95} />
              ))}
            </g>

            {/* Which way the ore is going. */}
            <g pointerEvents="none">
              {model.arrows.map((arrow, i) => (
                <g
                  key={`a${i}`}
                  transform={`translate(${arrow.x.toFixed(1)} ${arrow.y.toFixed(1)}) rotate(${(
                    (arrow.angle * 180) /
                    Math.PI
                  ).toFixed(1)})`}
                >
                  <SvgPath
                    d={ARROW}
                    fill="route.arrow"
                    stroke="bg.surface"
                    strokeWidth={0.8}
                    strokeLinejoin="round"
                  />
                </g>
              ))}
            </g>

            {/*
             * Machines sit on the wiring, so each carries a ring of surface
             * colour to lift it off the belt it stands on, and then a hairline
             * of its own tone darkened — an edge, rather than the white halo
             * that made every mark look like a sticker.
             */}
            <g>
              {model.marks.map((mark, i) =>
                mark.landmark ? (
                  <SvgRect
                    key={`m${i}`}
                    x={mark.x - 4}
                    y={mark.y - 4}
                    width={8}
                    height={8}
                    fill="bg.surface"
                    // The outline carries state where there is state to carry:
                    // a miner and a generator measure their productivity like
                    // any machine, and a coal plant running at 60% is exactly
                    // the sort of thing this map exists to show. The HUB and
                    // the Space Elevator measure nothing and stay grey.
                    stroke={mark.tone ? TONE_FILL[mark.tone] : 'fg.muted'}
                    strokeWidth={1.6}
                    cursor={mark.zoneId === undefined ? 'default' : 'pointer'}
                    onClick={() => selectZone(mark.zoneId)}
                  >
                    <title>{mark.title}</title>
                  </SvgRect>
                ) : (
                  <SvgG key={`m${i}`} cursor={mark.zoneId === undefined ? 'default' : 'pointer'}>
                    <SvgRect
                      x={mark.x - markRadius(mark.count) - 1.4}
                      y={mark.y - markRadius(mark.count) - 1.4}
                      width={markRadius(mark.count) * 2 + 2.8}
                      height={markRadius(mark.count) * 2 + 2.8}
                      rx={2}
                      fill="bg.surface"
                      opacity={0.9}
                    />
                    <SvgRect
                      x={mark.x - markRadius(mark.count)}
                      y={mark.y - markRadius(mark.count)}
                      width={markRadius(mark.count) * 2}
                      height={markRadius(mark.count) * 2}
                      rx={1.5}
                      fill={mark.tone ? TONE_FILL[mark.tone] : 'fg.subtle'}
                      stroke={mark.tone ? TONE_FILL[mark.tone] : 'fg.subtle'}
                      strokeWidth={1.6}
                      strokeOpacity={0.45}
                      onClick={() => selectZone(mark.zoneId)}
                    >
                      <title>{mark.title}</title>
                    </SvgRect>
                  </SvgG>
                ),
              )}
            </g>

            {/*
             * Zone names last of the drawing, on a plate of the surface colour.
             * Inside the zone group they were drawn before the belts, and a
             * conveyor crossing the top of a cell struck its name through.
             */}
            <g pointerEvents="none">
              {model.zones.map((zone) => (
                <g key={`zl${zone.id}`}>
                  {zone.captionInside ? (
                    <SvgRect
                      x={zone.x + 1}
                      y={zone.y + 1}
                      width={zone.captionW}
                      height={CAPTION_H}
                      fill="bg.surface"
                      fillOpacity={0.82}
                    />
                  ) : null}
                  <SvgText
                    x={zone.x + 6}
                    y={zone.captionInside ? zone.y + 12 : zone.y - 5}
                    fill={
                      zone.selected ? 'accent.solid' : zone.tone ? TONE_FILL[zone.tone] : 'fg.muted'
                    }
                    fontSize={`${LABEL_SIZE}px`}
                    fontFamily="mono"
                    letterSpacing="0.08em"
                    paintOrder="stroke"
                    stroke="bg.surface"
                    strokeWidth={2.5}
                    strokeLinejoin="round"
                  >
                    {zone.label.toUpperCase()}
                  </SvgText>
                </g>
              ))}
            </g>

            {/* Leader lines under the type they belong to. */}
            <g pointerEvents="none">
              {model.labels.map((label, i) =>
                label.leader ? (
                  <SvgLine
                    key={`ll${i}`}
                    x1={label.leader.x1}
                    y1={label.leader.y1}
                    x2={label.leader.x2}
                    y2={label.leader.y2}
                    stroke="fg.subtle"
                    strokeWidth={0.8}
                    opacity={0.65}
                  />
                ) : null,
              )}
            </g>

            {/*
             * Type carries a casing of the surface colour so it stays readable
             * where it crosses a belt or a grid line, which is most places.
             */}
            <g pointerEvents="none">
              {model.labels.map((label, i) => (
                <SvgText
                  key={`l${i}`}
                  x={label.x}
                  y={label.y}
                  fill={label.landmark ? 'fg.muted' : 'fg.default'}
                  fontSize={`${LABEL_SIZE}px`}
                  fontFamily="mono"
                  paintOrder="stroke"
                  stroke="bg.surface"
                  strokeWidth={3}
                  strokeLinejoin="round"
                >
                  {label.text}
                </SvgText>
              ))}
            </g>
          </g>

          {/* Pointers to what the frame left out. */}
          <g>
            {model.strays.map((stray, i) => (
              <SvgG
                key={`s${i}`}
                role="button"
                tabIndex={0}
                aria-label={`${stray.text} beyond the frame. Show everything.`}
                cursor="pointer"
                color="fg.subtle"
                _hover={{ color: 'accent.solid' }}
                onClick={() => {
                  if (!suppressClick.current) setFit('all');
                }}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return;
                  event.preventDefault();
                  event.stopPropagation();
                  setFit('all');
                }}
              >
                <g
                  transform={`translate(${stray.x.toFixed(1)} ${stray.y.toFixed(
                    1,
                  )}) rotate(${stray.angle.toFixed(1)}) scale(1.5)`}
                >
                  <SvgPath d={ARROW} fill="currentColor" />
                </g>
                <SvgText
                  x={stray.x - stray.ux * 11}
                  y={stray.y - stray.uy * 11 + 3.5}
                  fill="currentColor"
                  fontSize="10px"
                  fontFamily="mono"
                  paintOrder="stroke"
                  stroke="bg.surface"
                  strokeWidth={3}
                  strokeLinejoin="round"
                  textAnchor={stray.ux > 0.5 ? 'end' : stray.ux < -0.5 ? 'start' : 'middle'}
                >
                  {stray.text}
                </SvgText>
              </SvgG>
            ))}
          </g>

          {/*
           * Scale bar, bottom left — one square of the grid, so the bar measures
           * something already on the page. Cased rather than plated: a plate wide
           * enough to hold it also covered whatever the map had drawn down there,
           * which on this save was the pointer to a miner 630 m south.
           */}
          <g pointerEvents="none">
            {/* Casing pass, then the bar. Children inherit the group's stroke. */}
            {[0, 1].map((pass) => (
              <SvgG
                key={pass}
                stroke={pass === 0 ? 'bg.surface' : 'fg.muted'}
                strokeWidth={pass === 0 ? 5 : 2}
                strokeLinecap={pass === 0 ? 'round' : 'butt'}
                opacity={pass === 0 ? 0.85 : 1}
              >
                <line
                  x1={PAD}
                  y1={model.canvasH - 18}
                  x2={PAD + model.bar.units}
                  y2={model.canvasH - 18}
                />
                <line x1={PAD} y1={model.canvasH - 22} x2={PAD} y2={model.canvasH - 14} />
                <line
                  x1={PAD + model.bar.units}
                  y1={model.canvasH - 22}
                  x2={PAD + model.bar.units}
                  y2={model.canvasH - 14}
                />
              </SvgG>
            ))}
            <SvgText
              x={PAD + model.bar.units + 7}
              y={model.canvasH - 14}
              fill="fg.muted"
              fontSize="10.5px"
              fontFamily="mono"
              paintOrder="stroke"
              stroke="bg.surface"
              strokeWidth={3}
              strokeLinejoin="round"
            >
              {model.bar.metres} m
            </SvgText>
            <SvgText
              x={model.canvasW - PAD}
              y={model.canvasH - 14}
              fill="fg.subtle"
              fontSize="10.5px"
              fontFamily="mono"
              textAnchor="end"
              paintOrder="stroke"
              stroke="bg.surface"
              strokeWidth={3}
              strokeLinejoin="round"
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
          <Label>belts, arrows downstream</Label>
        </Flex>
        <Flex align="center" gap={1.5}>
          <Box w="14px" h="1px" bg="fg.subtle" />
          <Label>power</Label>
        </Flex>
        <Label>{model.extent} in view</Label>
      </Flex>

      <Text fontSize="13px" color="fg.subtle" mt={2} maxW="90ch">
        Drag to pan, scroll to zoom, click a zone to focus it. Zooming in splits machines drawn as
        one mark apart and brings back labels there was no room for.
        {strayCount > 0 && fit === 'base'
          ? ` ${strayCount} building${strayCount === 1 ? '' : 's'} sit too far out to frame with the
             rest; the arrow at the edge points the way, and Everything pulls back to include
             ${strayCount === 1 ? 'it' : 'them'}.`.replace(/\s+/g, ' ')
          : ''}
      </Text>
    </Box>
  );
}
