'use client';

import { Box, Button, chakra, Flex, Text } from '@chakra-ui/react';
import { frameContent, joinRuns } from '@factory-board/layout';
import type { GameDatabase } from '@factory-board/planner';
import type { WorldSnapshot } from '@factory-board/save-reader';
import { Application } from 'pixi.js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { traceChain, type Chain, type ChainStep } from '@/lib/chain';
import { diagnose, explain } from '@/lib/diagnose';
import { buildingName, itemName } from '@/lib/format';
import type { ZoneView } from '@/lib/zones';
import { uptimeTone, type StatusTone } from '../charts';
import { MapCard, placeCard, type MapCardContent, type MapCardPlacement } from '../map-card';
import { Label } from '../primitives';
import { blocksOf } from './blocks';
import {
  containsPoint,
  createScene,
  fitCamera,
  niceStep,
  type Camera,
  type Palette,
  type Scene,
  type SceneBuilding,
  type SceneData,
} from './scene';

/**
 * The factory as it stands, drawn on a WebGL canvas. The map of the base.
 *
 * It draws every machine at the size and angle it really stands: the game's
 * clearance data gives the footprint, the save gives the rotation. There was a
 * schematic of merged marks and placed labels alongside it for a while, on the
 * theory that legibility and fidelity were incompatible bargains. They were
 * not — this one answers both questions
 * ([ADR 21](../../../../docs/adr/0021-one-map-not-two.md)).
 *
 * The camera moves the world instead of the drawing being rebuilt at each view,
 * which is what makes it drag and zoom at sixty frames a second. The cost is
 * that everything scales with the zoom, so type is counter-scaled by hand and
 * the grid is drawn in screen space.
 */

/** Anything already drawn as a route; a rectangle would only double it up. */
const DRAWN_AS_ROUTE =
  /ConveyorBelt|ConveyorLift|PowerLine|Pipeline|ConveyorPole|PowerPole|PowerConnection/;
/** The floor of a factory, drawn first and quietly. */
const FLOOR = /Foundation|Wall|Ramp|Pillar|Walkway|Catwalk|Fence|Stair/;

const MIN_ZOOM_FACTOR = 0.4;
const MAX_ZOOM = 60;
const ZOOM_STEP = 1.5;

/**
 * Chakra inlines custom token colours into a generated class rather than
 * publishing them as root variables, so they cannot be read off `:root` — see
 * ARCHITECTURE.md. A hidden element per token, asked what colour it ended up,
 * is the way to get a number out of the theme, and it re-runs when the theme
 * changes because the class changes with it.
 */
const TOKENS = {
  grid: 'border.default',
  gridStrong: 'border.subtle',
  ink: 'fg.default',
  muted: 'fg.muted',
  subtle: 'fg.subtle',
  accent: 'accent.solid',
  belt: 'steel.500',
  pipe: 'steel.300',
  power: 'fg.subtle',
  surface: 'bg.surface',
  ok: 'status.ok',
  warn: 'status.warn',
  crit: 'status.crit',
  okSoft: 'status.okSubtle',
  warnSoft: 'status.warnSubtle',
  critSoft: 'status.critSubtle',
} as const;

type TokenName = keyof typeof TOKENS;

/** Whether the camera is still sitting exactly where a fit left it. */
function sameCamera(a: Camera, b: Camera): boolean {
  return (
    Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01 && Math.abs(a.scale - b.scale) < 1e-6
  );
}

/** Any CSS colour to a number, by asking a canvas what it painted. */
function toNumber(colour: string): number {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return 0x808080;
  context.fillStyle = '#808080';
  context.fillStyle = colour;
  context.fillRect(0, 0, 1, 1);
  const [r = 128, g = 128, b = 128] = context.getImageData(0, 0, 1, 1).data;
  return (r << 16) | (g << 8) | b;
}

export interface FactoryMapProps {
  db: GameDatabase;
  snapshot: WorldSnapshot;
  zones: readonly ZoneView[];
  selectedZoneId: string | null;
  onSelectZone: (id: string | null) => void;
}

export default function FactoryMap({
  db,
  snapshot,
  zones,
  selectedZoneId,
  onSelectZone,
}: FactoryMapProps) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const probesRef = useRef<Partial<Record<TokenName, HTMLDivElement | null>>>({});
  const appRef = useRef<Application | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const cameraRef = useRef<Camera>({ x: 0, y: 0, scale: 1 });
  const homeRef = useRef<Camera>({ x: 0, y: 0, scale: 1 });
  const targetRef = useRef<Camera | null>(null);
  const sizeRef = useRef({ width: 0, height: 0 });
  const dragRef = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  /** Whether the camera has been anywhere yet, so a rebuild can put it back. */
  const placedRef = useRef(false);

  const [palette, setPalette] = useState<Palette | null>(null);
  const [status, setStatus] = useState<'starting' | 'drawn' | 'failed'>('starting');
  /**
   * What the toolbar says: the camera scale it is reporting, and the home
   * scale it is reporting it against. Both the percentage and the scale bar
   * read this one number, so they can never disagree with each other — and it
   * is set to where a flight is going rather than where the camera has got to,
   * because a flight converges for about a second after it has visibly
   * arrived and a readout that lags by a second reads as broken.
   */
  const [shown, setShown] = useState({ scale: 1, home: 1 });
  /**
   * Whether the surface has been measured yet. A ref would be enough to read
   * the size, but not to re-run the effect that flies to a zone: arriving on
   * `/base?zone=coal-power` sets the selection before there is a camera to
   * move, and nothing re-ran once there was.
   */
  const [sized, setSized] = useState(false);
  /** Whether the pointer is over a signpost, so the surface can say it is a control. */
  const [overChip, setOverChip] = useState(false);
  const [hovered, setHovered] = useState<{
    content: MapCardContent;
    at: MapCardPlacement;
  } | null>(null);
  const [chain, setChain] = useState<Chain | null>(null);
  /** The scene is rebuilt when the theme changes, and has to be told again. */
  const chainRef = useRef<Chain | null>(null);
  chainRef.current = chain;

  /* ------------------------------------------------------------- the data */

  const data = useMemo((): SceneData => {
    /*
     * Why each slow line is slow, keyed by recipe. Per line rather than per
     * machine because that is how the game measures productivity — it records
     * the recipe's, not the box's.
     */
    const why = new Map(diagnose(db, snapshot).map((line) => [line.recipe, explain(line) ?? '']));

    const zoneAt = (x: number, y: number) =>
      zones.find(
        (zone) =>
          x >= zone.bounds.minX &&
          x <= zone.bounds.maxX &&
          y >= zone.bounds.minY &&
          y <= zone.bounds.maxY,
      )?.id;

    const buildings: SceneBuilding[] = [];
    snapshot.placements.forEach((placement, index) => {
      if (DRAWN_AS_ROUTE.test(placement.machine)) return;
      const footprint = db.buildings[placement.machine]?.footprintM;
      if (!footprint) return;

      const line = placement.recipe ? snapshot.lines[placement.recipe] : undefined;
      const product = placement.recipe ? db.recipes[placement.recipe]?.outputs[0]?.item : undefined;
      const machine = buildingName(db, placement.machine);
      const resource = placement.resource ? itemName(db, placement.resource) : undefined;

      /*
       * What this machine would put its name to on the map. A manufacturer and
       * a miner are both named by what comes out of them; a generator makes
       * power, which is not an item, so it is named by what it is. Anything
       * making nothing — a foundation, a wall, a constructor with no recipe
       * set — says nothing and is never part of a block.
       */
      const produces =
        placement.role === 'production'
          ? (product && itemName(db, product)) || ''
          : placement.role === 'extraction'
            ? (resource ?? '')
            : placement.role === 'power'
              ? machine
              : '';

      buildings.push({
        index,
        x: placement.x,
        y: placement.y,
        w: footprint.width,
        l: footprint.length,
        facing: placement.facing ?? 0,
        kind: placement.role ?? 'other',
        uptime: placement.uptime ?? line?.uptime ?? null,
        zoneId: zoneAt(placement.x, placement.y),
        name: product ? itemName(db, product) : machine,
        detail: placement.recipe ? machine : (resource ?? ''),
        product: produces,
        why: (placement.recipe && why.get(placement.recipe)) || '',
      });
    });
    // The floor first, so everything else stands on it.
    buildings.sort((a, b) => Number(FLOOR.test(b.detail)) - Number(FLOOR.test(a.detail)));

    /*
     * Routes are drawn as the runs they are — joined where they continue — but
     * a chain lights up the belts it actually runs through, and those are the
     * objects the save connected. So both go in: joined runs to draw, and each
     * object's own run, which is drawn only when a chain lights it.
     */
    const byKind = {
      belt: [] as (readonly (readonly [number, number])[])[],
      pipe: [] as (readonly (readonly [number, number])[])[],
      power: [] as (readonly (readonly [number, number])[])[],
    };
    for (const path of snapshot.paths) byKind[path.kind].push(path.points);

    return {
      buildings,
      blocks: blocksOf(buildings),
      zones: zones.map((zone) => ({
        id: zone.id,
        label: zone.name,
        minX: zone.bounds.minX,
        minY: zone.bounds.minY,
        maxX: zone.bounds.maxX,
        maxY: zone.bounds.maxY,
        uptime: zone.uptime,
      })),
      routes: [
        ...byKind.power.map((points) => ({
          kind: 'power' as const,
          points,
          building: undefined,
        })),
        ...joinRuns(byKind.pipe).map((points) => ({
          kind: 'pipe' as const,
          points,
          building: undefined,
        })),
        ...joinRuns(byKind.belt).map((points) => ({
          kind: 'belt' as const,
          points,
          building: undefined,
        })),
        ...snapshot.paths
          .filter((path) => path.kind !== 'power' && path.building !== undefined)
          .map((path) => ({ kind: path.kind, points: path.points, building: path.building })),
      ],
    };
  }, [db, snapshot, zones]);

  /*
   * Opens on the factory rather than on the world. A single miner 700 m out
   * would otherwise set the scale for everything, and the base would be a smudge
   * in the middle of a field — which is the failure `frameContent` was written
   * for ([ADR 11](../../../../docs/adr/0011-reach-is-bought-with-buildings.md)).
   * The rest is still there; it is a scroll away rather than in the way.
   */
  const bounds = useMemo(() => {
    const framed = frameContent(data.buildings, (building) => ({ x: building.x, y: building.y }));
    const base = framed.bounds ?? { minX: 0, minY: 0, maxX: 1, maxY: 1 };
    const reach = data.buildings.reduce(
      (largest, building) => Math.max(largest, building.w, building.l),
      8,
    );
    return {
      minX: base.minX - reach,
      minY: base.minY - reach,
      maxX: base.maxX + reach,
      maxY: base.maxY + reach,
    };
  }, [data]);

  /*
   * How far the camera may roam, which is a different question from what it
   * opens on. `bounds` deliberately refuses to frame the far-flung — that is
   * ADR 11 doing its job — but bounding the *pan* by it as well meant the
   * places it refused to frame could not be reached at all: at 900% the slack
   * is a couple of metres, so flying to a coal outpost 655 m out pinned the
   * camera against the edge of the factory and showed empty ground.
   *
   * So the frame is bought with buildings and the leash is not: everything
   * drawn is somewhere you are allowed to go.
   */
  const limits = useMemo(() => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const grow = (x: number, y: number) => {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    };
    for (const building of data.buildings) {
      const reach = Math.max(building.w, building.l) / 2;
      grow(building.x - reach, building.y - reach);
      grow(building.x + reach, building.y + reach);
    }
    for (const zone of data.zones) {
      grow(zone.minX, zone.minY);
      grow(zone.maxX, zone.maxY);
    }
    for (const route of data.routes) for (const [x, y] of route.points) grow(x, y);
    return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : bounds;
  }, [data, bounds]);

  /* ---------------------------------------------------------- the palette */

  useEffect(() => {
    const read = () => {
      const entries = Object.keys(TOKENS).map((name) => {
        const element = probesRef.current[name as TokenName];
        const colour = element ? getComputedStyle(element).color : '';
        return [name, toNumber(colour || '#808080')] as const;
      });
      setPalette(Object.fromEntries(entries) as unknown as Palette);
    };
    read();
    // The theme swaps the class on the document, not the tokens on the element.
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  /* -------------------------------------------------------------- the app */

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface || !palette) return undefined;

    let cancelled = false;
    let app: Application | null = null;

    void (async () => {
      const instance = new Application();
      try {
        await instance.init({
          backgroundAlpha: 0,
          antialias: true,
          resolution: Math.min(2, globalThis.devicePixelRatio || 1),
          autoDensity: true,
          preference: 'webgl',
          width: surface.clientWidth || 800,
          height: surface.clientHeight || 520,
        });
      } catch {
        if (!cancelled) setStatus('failed');
        return;
      }
      if (cancelled) {
        instance.destroy(true, { children: true });
        return;
      }

      app = instance;
      appRef.current = instance;
      surface.appendChild(instance.canvas);
      instance.canvas.style.display = 'block';
      instance.canvas.style.touchAction = 'pan-y';

      const scene = createScene(instance, data, palette);
      sceneRef.current = scene;
      instance.stage.addChild(scene.world, scene.overlay);

      const width = surface.clientWidth || 800;
      const height = surface.clientHeight || 520;
      sizeRef.current = { width, height };
      const home = fitCamera(bounds, width, height);
      homeRef.current = home;
      // A theme change rebuilds the scene, and a reader who was looking at the
      // coal plant should still be looking at the coal plant afterwards.
      if (!placedRef.current) {
        cameraRef.current = { ...home };
        placedRef.current = true;
        setShown({ scale: home.scale, home: home.scale });
      }
      scene.update(cameraRef.current, width, height);
      scene.highlight(null, selectedZoneId);
      scene.spotlight(chainRef.current?.members ?? null);
      setStatus('drawn');

      instance.ticker.add((ticker) => {
        const target = targetRef.current;
        if (target) {
          const camera = cameraRef.current;
          const step = Math.min(1, ticker.deltaMS / 140);
          camera.x += (target.x - camera.x) * step;
          camera.y += (target.y - camera.y) * step;
          camera.scale += (target.scale - camera.scale) * step;
          if (
            Math.abs(target.x - camera.x) < 0.05 &&
            Math.abs(target.y - camera.y) < 0.05 &&
            Math.abs(target.scale - camera.scale) < 0.001
          ) {
            cameraRef.current = { ...target };
            targetRef.current = null;
          }
          scene.update(cameraRef.current, sizeRef.current.width, sizeRef.current.height);
        }
        scene.advance(ticker.deltaMS / 1000);
      });
    })();

    return () => {
      cancelled = true;
      sceneRef.current?.destroy();
      sceneRef.current = null;
      app?.destroy(true, { children: true });
      appRef.current = null;
    };
  }, [data, palette, bounds]);

  /* ------------------------------------------------------------- the size */

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.round(entry?.contentRect.width ?? 0);
      const height = Math.round(entry?.contentRect.height ?? 0);
      if (width === 0 || height === 0) return;
      setSized(true);
      /*
       * The surface is measured inside the init effect, before the browser has
       * laid it out, so the first fit is against the fallback width and the
       * real one only arrives here. A camera still sitting exactly where a fit
       * put it has not been touched by anyone, so it moves with the fit —
       * otherwise the map opens at 161% of itself with the copper wing off the
       * edge, and only a press of Reset ever shows what it meant to show.
       */
      const following = sameCamera(cameraRef.current, homeRef.current);
      sizeRef.current = { width, height };
      appRef.current?.renderer.resize(width, height);
      homeRef.current = fitCamera(bounds, width, height);
      if (following) {
        cameraRef.current = { ...homeRef.current };
        targetRef.current = null;
      }
      // The home scale moved, so the percentage means something different now
      // even for a reader who has not touched anything.
      setShown((prev) => ({
        scale: following ? homeRef.current.scale : prev.scale,
        home: homeRef.current.scale,
      }));
      sceneRef.current?.update(cameraRef.current, width, height);
    });
    observer.observe(surface);
    return () => observer.disconnect();
  }, [bounds]);

  /* ------------------------------------------------------------ the camera */

  const redraw = useCallback(() => {
    sceneRef.current?.update(cameraRef.current, sizeRef.current.width, sizeRef.current.height);
  }, []);

  const clamp = useCallback(
    (camera: Camera): Camera => {
      const home = homeRef.current;
      const scale = Math.min(MAX_ZOOM, Math.max(home.scale * MIN_ZOOM_FACTOR, camera.scale));
      // Panning is bounded by everything drawn, plus a screen of slack, so the
      // base can never be lost off the edge of an empty world.
      const slackX = sizeRef.current.width / scale / 2;
      const slackY = sizeRef.current.height / scale / 2;
      return {
        scale,
        x: Math.min(limits.maxX + slackX, Math.max(limits.minX - slackX, camera.x)),
        y: Math.min(limits.maxY + slackY, Math.max(limits.minY - slackY, camera.y)),
      };
    },
    [limits],
  );

  const zoomBy = useCallback(
    (factor: number, anchor?: { x: number; y: number }) => {
      const camera = cameraRef.current;
      const next = clamp({ ...camera, scale: camera.scale * factor });
      if (Math.abs(next.scale - camera.scale) < 1e-6) return;
      if (anchor) {
        // Hold the world point under the cursor still while the scale changes.
        const { width, height } = sizeRef.current;
        const worldX = camera.x + (anchor.x - width / 2) / camera.scale;
        const worldY = camera.y + (anchor.y - height / 2) / camera.scale;
        next.x = worldX - (anchor.x - width / 2) / next.scale;
        next.y = worldY - (anchor.y - height / 2) / next.scale;
      }
      cameraRef.current = clamp(next);
      targetRef.current = null;
      redraw();
      setShown({ scale: cameraRef.current.scale, home: homeRef.current.scale });
    },
    [clamp, redraw],
  );

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return undefined;
    const onWheel = (event: WheelEvent) => {
      const rect = surface.getBoundingClientRect();
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 400 : 1;
      const before = cameraRef.current.scale;
      zoomBy(Math.exp((-event.deltaY * unit) / 420), {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      });
      if (cameraRef.current.scale !== before) event.preventDefault();
      setHovered(null);
    };
    surface.addEventListener('wheel', onWheel, { passive: false });
    return () => surface.removeEventListener('wheel', onWheel);
  }, [zoomBy]);

  /** Fly to a zone when the selection changes, wherever it came from. */
  useEffect(() => {
    const zone = zones.find((candidate) => candidate.id === selectedZoneId);
    if (!zone || sizeRef.current.width === 0) {
      if (!selectedZoneId) targetRef.current = null;
      return;
    }
    const { width, height } = sizeRef.current;
    const target = clamp(
      fitCamera(
        {
          minX: zone.bounds.minX - 12,
          minY: zone.bounds.minY - 12,
          maxX: zone.bounds.maxX + 12,
          maxY: zone.bounds.maxY + 12,
        },
        width,
        height,
        0.8,
      ),
    );
    targetRef.current = target;
    // The readout says where the camera is going as it sets off, rather than
    // catching up a second later when the flight has finished converging.
    setShown({ scale: target.scale, home: homeRef.current.scale });
  }, [selectedZoneId, zones, clamp, sized]);

  useEffect(() => {
    sceneRef.current?.highlight(null, selectedZoneId);
  }, [selectedZoneId, status]);

  /* ---------------------------------------------------------- the pointer */

  const worldAt = (clientX: number, clientY: number) => {
    const surface = surfaceRef.current;
    if (!surface) return null;
    const rect = surface.getBoundingClientRect();
    const camera = cameraRef.current;
    return {
      x: camera.x + (clientX - rect.left - rect.width / 2) / camera.scale,
      y: camera.y + (clientY - rect.top - rect.height / 2) / camera.scale,
      screenX: clientX - rect.left,
      screenY: clientY - rect.top,
      width: rect.width,
      height: rect.height,
    };
  };

  const buildingAt = (x: number, y: number): SceneBuilding | null => {
    let found: SceneBuilding | null = null;
    for (const building of data.buildings) {
      const reach = Math.max(building.w, building.l);
      if (Math.abs(building.x - x) > reach || Math.abs(building.y - y) > reach) continue;
      if (!containsPoint(building, x, y)) continue;
      // Later buildings are drawn on top, so the last hit is the visible one.
      found = building;
    }
    return found;
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (drag) {
      const camera = cameraRef.current;
      cameraRef.current = clamp({
        ...camera,
        x: camera.x - (event.clientX - drag.x) / camera.scale,
        y: camera.y - (event.clientY - drag.y) / camera.scale,
      });
      dragRef.current = { x: event.clientX, y: event.clientY, moved: true };
      targetRef.current = null;
      redraw();
      return;
    }

    if (event.pointerType === 'touch') return;
    const at = worldAt(event.clientX, event.clientY);
    if (!at) return;

    // A signpost is chrome sitting over the drawing, so it takes the pointer
    // before anything in the world does.
    const chip = sceneRef.current?.signpostAt(at.screenX, at.screenY) ?? null;
    setOverChip(chip !== null);
    if (chip !== null) {
      sceneRef.current?.highlight(null, selectedZoneId);
      setHovered(null);
      return;
    }

    const building = buildingAt(at.x, at.y);
    sceneRef.current?.highlight(building, selectedZoneId);
    if (!building) {
      setHovered(null);
      return;
    }
    const zone = zones.find((candidate) => candidate.id === building.zoneId);
    setHovered({
      content: {
        name: building.name,
        detail: building.detail || undefined,
        uptime: building.uptime,
        zone: zone?.name,
        tone: building.uptime === null ? null : uptimeTone(building.uptime),
        why: building.why || undefined,
      },
      at: placeCard(at.screenX, at.screenY, at.width, at.height),
    });
  };

  const showChain = useCallback((next: Chain | null) => {
    setChain(next);
    sceneRef.current?.spotlight(next?.members ?? null);
  }, []);

  /**
   * A machine is a question — what feeds this? — so clicking one traces it.
   * The ground is not a question, so it picks out the zone you clicked in, or
   * clears everything where there is none.
   */
  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag?.moved) return;
    const at = worldAt(event.clientX, event.clientY);
    if (!at) return;

    // Clicking a signpost is asking to go there, which is what selecting the
    // zone already does — camera, ring and deep link together.
    const chip = sceneRef.current?.signpostAt(at.screenX, at.screenY) ?? null;
    if (chip !== null) {
      showChain(null);
      onSelectZone(chip);
      return;
    }

    const building = buildingAt(at.x, at.y);

    if (building) {
      const traced = traceChain(db, snapshot, building.index);
      showChain(traced && traced.members.size > 1 ? traced : null);
      return;
    }

    showChain(null);
    const zone = zones.find(
      (candidate) =>
        at.x >= candidate.bounds.minX &&
        at.x <= candidate.bounds.maxX &&
        at.y >= candidate.bounds.minY &&
        at.y <= candidate.bounds.maxY,
    );
    onSelectZone(zone && zone.id !== selectedZoneId ? zone.id : null);
  };

  /** Take me to that one. */
  const flyTo = (index: number) => {
    const placement = snapshot.placements[index];
    if (!placement) return;
    const target = clamp({
      x: placement.x,
      y: placement.y,
      scale: Math.max(cameraRef.current.scale, 6),
    });
    targetRef.current = target;
    setShown({ scale: target.scale, home: homeRef.current.scale });
  };

  const reset = () => {
    targetRef.current = { ...homeRef.current };
    setShown({ scale: homeRef.current.scale, home: homeRef.current.scale });
    setHovered(null);
    showChain(null);
  };

  const metresPerStep = niceStep(shown.scale || 1);
  const tone: StatusTone | null = null;
  void tone;

  return (
    <Box>
      <Flex align="center" gap={2} mb={2.5} wrap="wrap">
        <Label color="fg.subtle">{data.buildings.length} buildings drawn from the save</Label>
        <Box flex="1" minW="8px" />
        <MapButton label="Zoom out" onClick={() => zoomBy(1 / ZOOM_STEP)}>
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
          {Math.round((shown.scale / shown.home) * 100)}%
        </Text>
        <MapButton label="Zoom in" onClick={() => zoomBy(ZOOM_STEP)}>
          +
        </MapButton>
        <MapButton onClick={reset}>Reset</MapButton>
      </Flex>

      <Box
        ref={surfaceRef}
        position="relative"
        h={{ base: '420px', md: '620px' }}
        // Ground, so the factory stands on something rather than floating on a
        // sheet of paper.
        bg="bg.muted"
        borderWidth="1px"
        borderColor="border.default"
        overflow="hidden"
        cursor={dragRef.current ? 'grabbing' : overChip ? 'pointer' : 'grab'}
        touchAction="pan-y"
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          dragRef.current = { x: event.clientX, y: event.clientY, moved: false };
          setHovered(null);
        }}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => {
          dragRef.current = null;
          setHovered(null);
          setOverChip(false);
          sceneRef.current?.highlight(null, selectedZoneId);
        }}
      >
        {status === 'failed' ? (
          <Flex align="center" justify="center" h="100%" px={6}>
            <Text fontSize="14px" color="fg.muted" textAlign="center" maxW="52ch">
              This browser could not start WebGL, so the base cannot be drawn. Everything the map
              says is also in the zone cards below — what each part of the base is for, how it is
              running, and what the plan still wants built there.
            </Text>
          </Flex>
        ) : null}

        {chain ? <ChainPanel chain={chain} onGo={flyTo} onClose={() => showChain(null)} /> : null}

        {hovered ? <MapCard content={hovered.content} at={hovered.at} /> : null}

        <Flex position="absolute" left="10px" bottom="8px" align="center" gap={2}>
          <Box h="1px" bg="fg.muted" w={`${Math.round(metresPerStep * (shown.scale || 1))}px`} />
          <Label color="fg.muted">{metresPerStep} m</Label>
        </Flex>
      </Box>

      <Flex gap={4} mt={2.5} wrap="wrap" align="center">
        {(
          [
            ['status.ok', '95%+'],
            ['status.warn', '60–95%'],
            ['status.crit', 'under 60%'],
            ['fg.muted', 'no measurement'],
          ] as const
        ).map(([colour, text]) => (
          <Flex key={text} align="center" gap={1.5}>
            <Box w="9px" h="9px" bg={colour} />
            <Label>{text}</Label>
          </Flex>
        ))}
        <Flex align="center" gap={1.5}>
          <Box w="14px" h="3px" bg="steel.500" />
          <Label>belts, chevrons downstream</Label>
        </Flex>
        <Flex align="center" gap={1.5}>
          <Box w="14px" h="3px" bg="steel.300" />
          <Label>pipes</Label>
        </Flex>
      </Flex>

      <Text fontSize="13px" color="fg.subtle" mt={2.5} maxW="88ch">
        Drag to pan, scroll to zoom. Click a machine to trace what feeds it, or the ground to focus
        the zone you clicked in. Footprints come from the game&apos;s own clearance data and the
        rotation each building was placed at; belts carry the direction their items travel.
      </Text>

      {/* The theme, asked one colour at a time. */}
      <Box display="none" aria-hidden>
        {Object.entries(TOKENS).map(([name, token]) => (
          <Box
            key={name}
            color={token}
            ref={(element: HTMLDivElement | null) => {
              probesRef.current[name as TokenName] = element;
            }}
          />
        ))}
      </Box>
    </Box>
  );
}

function MapButton({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode;
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
      borderColor="border.default"
      color="fg.muted"
      _hover={{ borderColor: 'fg.muted' }}
      {...(label === undefined ? {} : { 'aria-label': label })}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

/*
 * Buttons come from the chakra factory rather than `as="button"`: the
 * polymorphic prop keeps the div's attribute set, and a button needs `type`.
 * See AGENTS.md.
 */
const RowButton = chakra('button', {
  base: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '8px',
    width: '100%',
    textAlign: 'start',
    py: 0.5,
    cursor: 'pointer',
    _hover: { bg: 'bg.muted' },
    _focusVisible: { outline: '2px solid', outlineColor: 'accent.solid', outlineOffset: '-2px' },
  },
});

const PlainButton = chakra('button', {
  base: {
    cursor: 'pointer',
    textAlign: 'start',
    _focusVisible: { outline: '2px solid', outlineColor: 'accent.solid', outlineOffset: '1px' },
  },
});

const pct = (uptime: number | null) => (uptime === null ? '—' : `${Math.round(uptime * 100)}%`);

const toneOf = (uptime: number | null): string =>
  uptime === null ? 'fg.subtle' : `status.${uptimeTone(uptime)}`;

/** One machine in the chain: click it and the camera goes there. */
function ChainRow({ step, onGo }: { step: ChainStep; onGo: (index: number) => void }) {
  return (
    <RowButton type="button" onClick={() => onGo(step.index)}>
      <Text fontFamily="mono" fontSize="10px" color="fg.subtle" w="14px" flex="none">
        {step.hops}
      </Text>
      <Text fontSize="12.5px" flex="1" truncate>
        {step.name}
      </Text>
      <Box w="6px" h="6px" flex="none" bg={toneOf(step.uptime)} alignSelf="center" />
      <Text
        fontFamily="mono"
        fontSize="11px"
        color="fg.muted"
        w="34px"
        textAlign="end"
        flex="none"
        fontVariantNumeric="tabular-nums"
      >
        {pct(step.uptime)}
      </Text>
    </RowButton>
  );
}

/** How many of a list to show before it stops being a list and becomes a wall. */
const SHOWN = 10;

/**
 * What feeds the machine you clicked, and what it feeds.
 *
 * The weakest link comes first because it is the answer: everything else is
 * the working out.
 */
function ChainPanel({
  chain,
  onGo,
  onClose,
}: {
  chain: Chain;
  onGo: (index: number) => void;
  onClose: () => void;
}) {
  const section = (title: string, steps: readonly ChainStep[]) =>
    steps.length === 0 ? null : (
      <Box mt={3}>
        <Label display="block" mb={1}>
          {title}
        </Label>
        {steps.slice(0, SHOWN).map((step) => (
          <ChainRow key={`${title}-${step.index}`} step={step} onGo={onGo} />
        ))}
        {steps.length > SHOWN ? (
          <Text fontFamily="mono" fontSize="10px" color="fg.subtle" mt={1}>
            …and {steps.length - SHOWN} more
          </Text>
        ) : null}
      </Box>
    );

  return (
    <Box
      position="absolute"
      top="10px"
      left="10px"
      w="266px"
      maxH="calc(100% - 20px)"
      overflowY="auto"
      bg="bg.surface"
      borderWidth="1px"
      borderColor="fg.muted"
      px={3.5}
      py={3}
      zIndex={2}
      // The panel is a thing in its own right; clicking it is not clicking the
      // ground behind it.
      onPointerDown={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
      onPointerMove={(event) => event.stopPropagation()}
    >
      <Flex align="baseline" gap={2} mb={2}>
        <Label>The chain</Label>
        <Box flex="1" />
        <PlainButton
          type="button"
          fontFamily="mono"
          fontSize="11px"
          color="fg.subtle"
          _hover={{ color: 'fg.default' }}
          aria-label="Clear the chain"
          onClick={onClose}
        >
          ✕
        </PlainButton>
      </Flex>

      <Text fontSize="14px" fontWeight="600" lineHeight="1.25" truncate>
        {chain.origin.name}
      </Text>
      <Flex align="center" gap={2}>
        <Text fontFamily="mono" fontSize="10.5px" color="fg.subtle" truncate flex="1">
          {chain.origin.detail}
        </Text>
        <Box w="6px" h="6px" bg={toneOf(chain.origin.uptime)} flex="none" />
        <Text fontFamily="mono" fontSize="11px" color="fg.muted" fontVariantNumeric="tabular-nums">
          {pct(chain.origin.uptime)}
        </Text>
      </Flex>

      {chain.weakest ? (
        <PlainButton
          type="button"
          display="block"
          w="100%"
          mt={3}
          px={2.5}
          py={2}
          bg="status.critSubtle"
          borderLeftWidth="3px"
          borderColor="status.crit"
          onClick={() => onGo(chain.weakest?.index ?? chain.origin.index)}
        >
          <Label display="block" color="fg.default">
            Weakest link
          </Label>
          <Text fontSize="13px" fontWeight="600" mt={0.5} truncate>
            {chain.weakest.name} · {pct(chain.weakest.uptime)}
          </Text>
          <Text fontFamily="mono" fontSize="10.5px" color="fg.muted">
            {chain.weakest.hops} machine{chain.weakest.hops === 1 ? '' : 's'} back · go there
          </Text>
        </PlainButton>
      ) : (
        <Text fontSize="12.5px" color="fg.subtle" mt={3}>
          Nothing feeding this is running worse than it is.
        </Text>
      )}

      {section('Feeding it', chain.upstream)}
      {section('It feeds', chain.downstream)}
    </Box>
  );
}
