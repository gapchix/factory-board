import { Container, Graphics, Sprite, Text, type Application, type Texture } from 'pixi.js';
import { captionOf, type LabelBlock } from './blocks';
import { cornersOf, niceStep, type Camera } from './geometry';

export { containsPoint, cornersOf, fitCamera, niceStep } from './geometry';
export type { Camera } from './geometry';

/**
 * The factory, drawn.
 *
 * Every machine at the size and angle it actually stands, on the belts that
 * actually feed it. That is only possible because the game states both: the
 * clearance box in `Docs.json` says how much ground a building takes, and the
 * save stores the rotation it was placed at.
 *
 * Nothing here knows what a Satisfactory is. It takes shapes, colours and a
 * camera, and draws them; the page works out which shape means what.
 *
 * The camera moves the world rather than the drawing being rebuilt at each
 * view, which is what lets this be dragged at sixty frames a second. The cost
 * is that everything scales with the zoom — so type is counter-scaled by hand,
 * and the grid is drawn in screen space rather than world space. The map this
 * replaced took the opposite bargain and redrew at every view
 * ([ADR 21](../../../../docs/adr/0021-one-map-not-two.md)).
 */

export interface Palette {
  readonly grid: number;
  readonly gridStrong: number;
  readonly ink: number;
  readonly muted: number;
  readonly subtle: number;
  readonly accent: number;
  readonly belt: number;
  readonly pipe: number;
  readonly power: number;
  readonly surface: number;
  readonly ok: number;
  readonly warn: number;
  readonly crit: number;
  readonly okSoft: number;
  readonly warnSoft: number;
  readonly critSoft: number;
}

export type BuildingKind = 'production' | 'extraction' | 'power' | 'other';

export interface SceneBuilding {
  /** Index into the snapshot's placements, which is what a chain is made of. */
  readonly index: number;
  /** Centre, in world metres. */
  readonly x: number;
  readonly y: number;
  /** Footprint along its own axes, in metres. */
  readonly w: number;
  readonly l: number;
  /** Degrees clockwise from north. */
  readonly facing: number;
  readonly kind: BuildingKind;
  readonly uptime: number | null;
  readonly zoneId: string | undefined;
  readonly name: string;
  readonly detail: string;
  /** What it makes, for the block it belongs to. Empty if it makes nothing. */
  readonly product: string;
}

export interface SceneZone {
  readonly id: string;
  readonly label: string;
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly uptime: number | null;
}

export interface SceneRoute {
  readonly kind: 'belt' | 'pipe' | 'power';
  readonly points: readonly (readonly [number, number])[];
  /** The belt or pipe that drew it, so a chain can light up that exact run. */
  readonly building: number | undefined;
}

export interface SceneData {
  readonly buildings: readonly SceneBuilding[];
  readonly zones: readonly SceneZone[];
  readonly routes: readonly SceneRoute[];
  /** Machines grouped by what they make, so a name is drawn once per block. */
  readonly blocks: readonly LabelBlock[];
}

/** Smallest building on the map still worth drawing as a shape rather than a dot. */
const MIN_DRAWN_PX = 2.5;
/** Chevrons this far apart along a belt, in metres, before the cap kicks in. */
const FLOW_SPACING_M = 14;
const MAX_FLOW = 1400;
/** Metres a chevron travels per second. Slow: this is a hint, not a fairground. */
const FLOW_SPEED = 7;
const LABEL_SIZE = 11;
/** Zone captions appear once a zone is worth reading. */
const ZONE_LABEL_SCALE = 0.25;
/**
 * A block has to be this many pixels across before it is named, so a speck two
 * pixels wide is never captioned by something forty times its size. Past that
 * the only thing holding a name back is another name already in the space.
 */
const BLOCK_LABEL_MIN_PX = 22;
/** Clear air kept around a caption when deciding whether the next one fits. */
const LABEL_PAD_PX = 3;
/** How far below its block a caption hangs, in pixels. */
const LABEL_DROP_PX = 4;

function toneOf(palette: Palette, uptime: number | null): { solid: number; soft: number } {
  if (uptime === null) return { solid: palette.muted, soft: palette.grid };
  if (uptime >= 0.95) return { solid: palette.ok, soft: palette.okSoft };
  if (uptime >= 0.6) return { solid: palette.warn, soft: palette.warnSoft };
  return { solid: palette.crit, soft: palette.critSoft };
}

interface Flow {
  readonly sprite: Sprite;
  /** The run it travels, as cumulative lengths and points. */
  readonly run: {
    points: readonly (readonly [number, number])[];
    lengths: number[];
    total: number;
  };
  offset: number;
}

export interface Scene {
  readonly world: Container;
  readonly overlay: Container;
  /** Redraw the parts that live in screen space, after the camera moves. */
  update(camera: Camera, width: number, height: number): void;
  /** Ring the building under the pointer, and the selected zone. */
  highlight(building: SceneBuilding | null, zoneId: string | null): void;
  /**
   * Light one chain and dim the rest of the base, or clear it with null.
   */
  spotlight(members: ReadonlySet<number> | null): void;
  /** Walk the belts along by however long the last frame took. */
  advance(seconds: number): void;
  destroy(): void;
}

function chevronTexture(app: Application, colour: number): Texture {
  const nib = new Graphics().poly([0, -3.2, 7, 0, 0, 3.2]).fill({ color: colour });
  const texture = app.renderer.generateTexture({ target: nib, resolution: 3, antialias: true });
  nib.destroy();
  return texture;
}

export function createScene(app: Application, data: SceneData, palette: Palette): Scene {
  const world = new Container();
  const overlay = new Container();

  const zoneShapes = new Graphics();
  const edges = new Graphics();
  const routes = new Graphics();
  const flowLayer = new Container();
  const shadows = new Graphics();
  const shapes = new Graphics();
  const rings = new Graphics();
  const labels = new Container();
  const fog = new Graphics();
  const chainLayer = new Graphics();
  const grid = new Graphics();

  overlay.addChild(grid);
  world.addChild(
    zoneShapes,
    routes,
    flowLayer,
    shadows,
    shapes,
    edges,
    labels,
    fog,
    chainLayer,
    rings,
  );

  /* ---------------------------------------------------------------- zones */

  for (const zone of data.zones) {
    const tone = toneOf(palette, zone.uptime);
    const width = Math.max(4, zone.maxX - zone.minX) + 8;
    const height = Math.max(4, zone.maxY - zone.minY) + 8;
    zoneShapes
      .roundRect(zone.minX - 4, zone.minY - 4, width, height, 2)
      .fill({ color: tone.soft, alpha: 0.55 });
  }

  /* --------------------------------------------------------------- routes */

  const draw = (kind: SceneRoute['kind'], colour: number, width: number, alpha: number) => {
    for (const route of data.routes) {
      if (route.kind !== kind) continue;
      const [first, ...rest] = route.points;
      if (!first) continue;
      routes.moveTo(first[0], first[1]);
      for (const [x, y] of rest) routes.lineTo(x, y);
      routes.stroke({ color: colour, width, alpha, cap: 'round', join: 'round' });
    }
  };

  draw('power', palette.power, 0.35, 0.35);
  draw('pipe', palette.pipe, 1.1, 0.7);
  // Belts get a casing in the surface colour, so a crossing reads as one run
  // passing over another rather than as a smudge where two strokes met.
  draw('belt', palette.surface, 2, 0.85);
  draw('belt', palette.belt, 1, 0.95);

  /* ----------------------------------------------------------------- flow */

  const flows: Flow[] = [];
  const texture = chevronTexture(app, palette.accent);
  const belts = data.routes.filter((route) => route.kind === 'belt');
  const totalLength = belts.reduce((sum, route) => {
    let length = 0;
    for (let i = 1; i < route.points.length; i += 1) {
      const from = route.points[i - 1]!;
      const to = route.points[i]!;
      length += Math.hypot(to[0] - from[0], to[1] - from[1]);
    }
    return sum + length;
  }, 0);
  // A base with ten kilometres of belt would otherwise ask for ten thousand
  // sprites; spacing gives way before the frame rate does.
  const spacing = Math.max(FLOW_SPACING_M, totalLength / MAX_FLOW);

  for (const route of belts) {
    const lengths: number[] = [0];
    let total = 0;
    for (let i = 1; i < route.points.length; i += 1) {
      const from = route.points[i - 1]!;
      const to = route.points[i]!;
      total += Math.hypot(to[0] - from[0], to[1] - from[1]);
      lengths.push(total);
    }
    if (total < spacing * 0.6) continue;

    const run = { points: route.points, lengths, total };
    const count = Math.max(1, Math.round(total / spacing));
    for (let i = 0; i < count; i += 1) {
      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5);
      sprite.alpha = 0.95;
      flowLayer.addChild(sprite);
      flows.push({ sprite, run, offset: (i * total) / count });
    }
  }

  /* ------------------------------------------------------------ buildings */

  for (const building of data.buildings) {
    const corners = cornersOf(building);
    // A shadow a little to the south-east, which is what stops four hundred
    // flat rectangles from reading as wallpaper.
    shadows
      .poly(corners.map((value, index) => (index % 2 === 0 ? value + 0.8 : value + 1)))
      .fill({ color: palette.ink, alpha: 0.16 });
  }

  for (const building of data.buildings) {
    const tone = toneOf(palette, building.uptime);
    const solid =
      building.kind === 'other'
        ? palette.muted
        : building.uptime === null
          ? palette.muted
          : tone.solid;
    shapes
      .poly(cornersOf(building))
      .fill({ color: solid, alpha: building.kind === 'other' ? 0.42 : 0.82 });
  }

  /* ------------------------------------------------------------ the chain */

  {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const building of data.buildings) {
      minX = Math.min(minX, building.x);
      minY = Math.min(minY, building.y);
      maxX = Math.max(maxX, building.x);
      maxY = Math.max(maxY, building.y);
    }
    const pad = 20000;
    if (Number.isFinite(minX)) {
      fog
        .rect(minX - pad, minY - pad, maxX - minX + pad * 2, maxY - minY + pad * 2)
        .fill({ color: palette.surface, alpha: 0.74 });
    }
  }
  fog.visible = false;

  /* ---------------------------------------------------------------- names */

  /*
   * Type is cased in the surface colour, so a name survives whatever it
   * crosses — the same treatment the schematic map gives its labels, and for
   * the same reason: a conveyor running through a caption strikes it through.
   */
  const casing = { color: palette.surface, width: 3, join: 'round' as const };

  const zoneLabels: { text: Text; x: number; y: number; width: number; height: number }[] = [];
  for (const zone of data.zones) {
    const text = new Text({
      text: zone.label.toUpperCase(),
      style: {
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: LABEL_SIZE,
        letterSpacing: 1.1,
        fill: toneOf(palette, zone.uptime).solid,
        stroke: casing,
      },
    });
    text.anchor.set(0, 1);
    labels.addChild(text);
    zoneLabels.push({
      text,
      x: zone.minX - 3,
      y: zone.minY - 5,
      width: text.width,
      height: text.height,
    });
  }

  /*
   * One caption per block of machines making the same thing, rather than one
   * per machine. Four smelters in a row are one answer, and drawing it four
   * times drew it four times on top of itself — which is why machine names used
   * to be held back until the map was at three hundred percent. Named once,
   * they can arrive as soon as there is room.
   *
   * The width is measured now, while the text is still at its own scale. It is
   * counter-scaled at draw time, so this stays its width on screen at every
   * zoom, and it is what decides whether a caption fits.
   */
  const blockLabels: { text: Text; block: LabelBlock; width: number; height: number }[] = [];
  for (const block of data.blocks) {
    const text = new Text({
      text: captionOf(block),
      style: {
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: LABEL_SIZE - 0.5,
        fill: palette.muted,
        stroke: casing,
      },
    });
    text.anchor.set(0.5, 0);
    text.visible = false;
    labels.addChild(text);
    blockLabels.push({ text, block, width: text.width, height: text.height });
  }

  /* --------------------------------------------------------------- camera */

  let lastCamera: Camera = { x: 0, y: 0, scale: 1 };
  let edgeScale = 0;

  /*
   * An outline is a line on a drawing, not a thing in the world: it should be
   * a pixel and a bit at every zoom rather than growing into a ten-pixel band
   * around a machine. Fills never change, so only the strokes are rebuilt, and
   * only when the scale actually moves — panning leaves them alone.
   */
  const drawEdges = (scale: number) => {
    if (Math.abs(scale - edgeScale) < 1e-4) return;
    edgeScale = scale;
    const hair = 1 / scale;
    edges.clear();
    for (const zone of data.zones) {
      edges
        .roundRect(
          zone.minX - 4,
          zone.minY - 4,
          Math.max(4, zone.maxX - zone.minX) + 8,
          Math.max(4, zone.maxY - zone.minY) + 8,
          2,
        )
        .stroke({ color: toneOf(palette, zone.uptime).solid, width: hair * 1.2, alpha: 0.6 });
    }
    for (const building of data.buildings) {
      edges.poly(cornersOf(building)).stroke({
        color: palette.ink,
        width: hair,
        alpha: building.kind === 'other' ? 0.22 : 0.34,
      });
    }
  };

  const update = (camera: Camera, width: number, height: number) => {
    lastCamera = camera;
    drawEdges(camera.scale);
    world.scale.set(camera.scale);
    world.position.set(width / 2 - camera.x * camera.scale, height / 2 - camera.y * camera.scale);

    // The grid is drawn in screen space so its lines stay a pixel wide however
    // far in you go, and it thins out rather than turning the ground into
    // graph paper.
    const step = niceStep(camera.scale);
    grid.clear();
    const left = camera.x - width / 2 / camera.scale;
    const top = camera.y - height / 2 / camera.scale;
    const right = left + width / camera.scale;
    const bottom = top + height / camera.scale;
    const line = (world: number, vertical: boolean) => {
      const screen =
        Math.round(
          (world - (vertical ? camera.x : camera.y)) * camera.scale +
            (vertical ? width : height) / 2,
        ) + 0.5;
      if (vertical) grid.moveTo(screen, 0).lineTo(screen, height);
      else grid.moveTo(0, screen).lineTo(width, screen);
    };

    for (let x = Math.ceil(left / step) * step; x <= right; x += step) {
      if (Math.round(x / step) % 5 !== 0) line(x, true);
    }
    for (let y = Math.ceil(top / step) * step; y <= bottom; y += step) {
      if (Math.round(y / step) % 5 !== 0) line(y, false);
    }
    grid.stroke({ color: palette.grid, width: 1, alpha: 0.5 });

    for (let x = Math.ceil(left / step) * step; x <= right; x += step) {
      if (Math.round(x / step) % 5 === 0) line(x, true);
    }
    for (let y = Math.ceil(top / step) * step; y <= bottom; y += step) {
      if (Math.round(y / step) % 5 === 0) line(y, false);
    }
    grid.stroke({ color: palette.grid, width: 1, alpha: 1 });

    // Type is counter-scaled so it stays the size it says, whatever the zoom.
    const inverse = 1 / camera.scale;

    /*
     * Every caption on the map competes for the same screen, so they are all
     * placed against one list of what is already spoken for. Zone names go
     * down first: a zone names a whole cell, and losing it to one of the
     * machine blocks inside it would be a worse trade than the other way
     * round.
     */
    const taken: { left: number; right: number; top: number; bottom: number }[] = [];

    for (const label of zoneLabels) {
      label.text.scale.set(inverse);
      label.text.position.set(label.x, label.y);
      label.text.visible = camera.scale >= ZONE_LABEL_SCALE;
      if (!label.text.visible) continue;
      const left = (label.x - camera.x) * camera.scale + width / 2;
      const bottom = (label.y - camera.y) * camera.scale + height / 2;
      taken.push({
        left: left - LABEL_PAD_PX,
        right: left + label.width + LABEL_PAD_PX,
        top: bottom - label.height - LABEL_PAD_PX,
        bottom: bottom + LABEL_PAD_PX,
      });
    }
    /*
     * Captions arrive with the zoom, and nothing but room decides when. A block
     * is named once it is wide enough on screen to be worth naming and nothing
     * already named has taken the space; blocks come biggest first, so when two
     * want the same strip of screen the one standing for more machines keeps
     * it. No fixed zoom threshold, which is what lets a coal plant be named
     * from far out while a lone constructor waits for the base to spread out
     * around it.
     */
    for (const entry of blockLabels) {
      const { block, text } = entry;
      text.scale.set(inverse);
      let visible = block.width * camera.scale >= BLOCK_LABEL_MIN_PX;
      if (visible) {
        const centreX = (block.x - camera.x) * camera.scale + width / 2;
        const top = (block.y - camera.y) * camera.scale + height / 2 + LABEL_DROP_PX;
        const half = entry.width / 2 + LABEL_PAD_PX;
        const rect = {
          left: centreX - half,
          right: centreX + half,
          top: top - LABEL_PAD_PX,
          bottom: top + entry.height + LABEL_PAD_PX,
        };
        // A caption off screen must not hold the space against one in view.
        visible = rect.right > 0 && rect.left < width && rect.bottom > 0 && rect.top < height;
        if (visible) {
          visible = !taken.some(
            (other) =>
              rect.left < other.right &&
              rect.right > other.left &&
              rect.top < other.bottom &&
              rect.bottom > other.top,
          );
          if (visible) taken.push(rect);
        }
      }
      text.visible = visible;
      if (visible) text.position.set(block.x, block.y + LABEL_DROP_PX * inverse);
    }

    // Below a couple of pixels a footprint is a smudge; the shadow under it is
    // worse, so both give way and the shape stands alone.
    shadows.visible = camera.scale >= MIN_DRAWN_PX / 4;
    flowLayer.visible = camera.scale >= 1.2;
    if (chain && Math.abs(camera.scale - chainScale) > 1e-4) drawChain(camera.scale);
  };

  let chain: ReadonlySet<number> | null = null;
  let chainScale = 0;

  const drawChain = (scale: number) => {
    chainScale = scale;
    chainLayer.clear();
    if (!chain) return;
    const hair = 1 / scale;

    for (const route of data.routes) {
      if (route.building === undefined || !chain.has(route.building)) continue;
      const [first, ...rest] = route.points;
      if (!first) continue;
      chainLayer.moveTo(first[0], first[1]);
      for (const [x, y] of rest) chainLayer.lineTo(x, y);
      chainLayer.stroke({
        color: palette.accent,
        width: route.kind === 'pipe' ? 1.3 : 1.2,
        alpha: 0.95,
        cap: 'round',
        join: 'round',
      });
    }

    for (const building of data.buildings) {
      if (!chain.has(building.index)) continue;
      const tone = toneOf(palette, building.uptime);
      chainLayer
        .poly(cornersOf(building))
        .fill({ color: building.kind === 'other' ? palette.muted : tone.solid, alpha: 0.95 })
        .stroke({ color: palette.accent, width: hair * 1.8, alpha: 0.95 });
    }
  };

  const spotlight = (members: ReadonlySet<number> | null) => {
    chain = members;
    fog.visible = members !== null;
    // Names belong to the base, not to the chain: dim them with it.
    labels.alpha = members === null ? 1 : 0.3;
    drawChain(lastCamera.scale || 1);
  };

  const highlight = (building: SceneBuilding | null, zoneId: string | null) => {
    rings.clear();
    const width = 1.4 / Math.max(0.001, lastCamera.scale);
    if (building) {
      rings.poly(cornersOf(building)).stroke({ color: palette.accent, width: width * 1.6 });
    }
    const zone = zoneId ? data.zones.find((candidate) => candidate.id === zoneId) : undefined;
    if (zone) {
      rings
        .roundRect(
          zone.minX - 4,
          zone.minY - 4,
          Math.max(4, zone.maxX - zone.minX) + 8,
          Math.max(4, zone.maxY - zone.minY) + 8,
          2,
        )
        .stroke({ color: palette.accent, width });
    }
  };

  const advance = (seconds: number) => {
    if (!flowLayer.visible) return;
    for (const flow of flows) {
      flow.offset = (flow.offset + FLOW_SPEED * seconds) % flow.run.total;
      const { points, lengths } = flow.run;
      // Walk to the segment this chevron is on. Runs are short and the offset
      // only creeps, so a scan from the start is cheaper than it looks.
      let segment = 1;
      while (segment < lengths.length - 1 && lengths[segment]! < flow.offset) segment += 1;
      const from = points[segment - 1]!;
      const to = points[segment]!;
      const start = lengths[segment - 1]!;
      const span = Math.max(0.0001, lengths[segment]! - start);
      const along = (flow.offset - start) / span;
      flow.sprite.position.set(
        from[0] + (to[0] - from[0]) * along,
        from[1] + (to[1] - from[1]) * along,
      );
      flow.sprite.rotation = Math.atan2(to[1] - from[1], to[0] - from[0]);
      // A fixed size on screen, whatever the zoom: this is a hint about
      // direction, not a thing with a size in the world.
      flow.sprite.scale.set(0.9 / Math.max(0.5, lastCamera.scale));
    }
  };

  return {
    world,
    overlay,
    update,
    highlight,
    spotlight,
    advance,
    destroy() {
      texture.destroy(true);
      world.destroy({ children: true });
      overlay.destroy({ children: true });
    },
  };
}
