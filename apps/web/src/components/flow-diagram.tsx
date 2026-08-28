'use client';

import { Box, chakra, Flex, Text } from '@chakra-ui/react';
import type { GameDatabase, SolveResult } from '@factory-board/planner';
import { layerGraph, type GraphEdge } from '@factory-board/layout';
import type { ActualLine } from '@factory-board/save-reader';
import { useMemo, useState } from 'react';
import { itemName, machineName, rate as fmtRate, unit } from '@/lib/format';
import { Label } from './primitives';

/**
 * The plan as a schematic: ore on the left, what you are building on the right.
 *
 * A list of cards tells you how many machines you need. It cannot tell you that
 * screws feed both the reinforced plate line and the rotor line, or that one rod
 * constructor is carrying two branches — which is exactly what you need to know
 * when a line starves. So the plan is drawn as the graph it actually is.
 *
 * And drawn **against the world**, not on its own. A plan in isolation is a
 * diagram of a factory that does not exist; every node here says how much of
 * itself is standing and how well it runs, so the picture answers "what is left
 * to build and what is already struggling" in one look. A step nothing has been
 * built for is dashed, the same language the map uses for a machine that is
 * planned and not there ([ADR 27](../../../docs/adr/0027-the-plan-stands-on-the-ground.md)).
 *
 * Clicking a step lights its chain and fogs the rest — the same gesture, and the
 * same answer, as clicking a machine on the map.
 */

/**
 * SVG elements through the Chakra factory, so `fill` and `stroke` take theme
 * tokens and follow the colour mode.
 *
 * Raw `var(--fb-colors-…)` does not work here: Chakra emits root CSS variables
 * only for its own built-in semantic tokens, and inlines custom ones into the
 * generated class. Referencing a custom token as a variable silently resolves to
 * nothing, which in SVG paints black or not at all.
 */
const SvgRect = chakra('rect');
const SvgPath = chakra('path');
const SvgText = chakra('text');
const SvgG = chakra('g');

const NODE_W = 206;
const NODE_H = 76;
const GAP_X = 96;
const GAP_Y = 18;
const PAD = 18;
/** How far a node's chain is dimmed when another one is selected. */
const FOGGED = 0.16;

type NodeKind = 'raw' | 'intermediate' | 'target';
type Tone = 'ok' | 'warn' | 'crit';

const TONE = { ok: 'status.ok', warn: 'status.warn', crit: 'status.crit' } as const;

interface DrawNode {
  readonly id: string;
  readonly kind: NodeKind;
  readonly title: string;
  /** What it is made in, and how many of them. */
  readonly detail: string;
  /** Machines standing against machines wanted, when a save is loaded. */
  readonly built: number | null;
  readonly planned: number;
  readonly uptime: number | null;
  readonly x: number;
  readonly y: number;
}

interface DrawEdge {
  readonly key: string;
  readonly from: string;
  readonly to: string;
  readonly path: string;
  readonly width: number;
  readonly label: string;
  /** Where the rate is written, at the middle of the curve. */
  readonly labelX: number;
  readonly labelY: number;
}

const RAW_PREFIX = 'raw:';

const toneOf = (uptime: number | null): Tone =>
  uptime === null ? 'ok' : uptime >= 0.95 ? 'ok' : uptime >= 0.6 ? 'warn' : 'crit';

export function FlowDiagram({
  db,
  result,
  targets,
  actual,
}: {
  db: GameDatabase;
  result: SolveResult;
  targets: readonly { item: string }[];
  /** What is standing in the world, so a step can say what it already has. */
  actual?: Readonly<Record<string, ActualLine>> | undefined;
}) {
  const [selected, setSelected] = useState<string | null>(null);

  const model = useMemo(() => {
    if (result.lines.length === 0) return null;

    const targetItems = new Set(targets.map((t) => t.item));

    // One producing line per item: the plan pins a single recipe per item, so
    // this stays a simple map rather than a multi-map.
    const producerOf = new Map<string, string>();
    for (const line of result.lines) {
      const recipe = db.recipes[line.recipe];
      if (!recipe) continue;
      for (const output of recipe.outputs) producerOf.set(output.item, line.recipe);
    }

    const nodeIds: { id: string }[] = [];
    const edges: GraphEdge[] = [];
    const rawSeen = new Set<string>();

    for (const line of result.lines) nodeIds.push({ id: line.recipe });

    for (const line of result.lines) {
      const recipe = db.recipes[line.recipe];
      if (!recipe) continue;
      for (const input of recipe.inputs) {
        const perMinute = (input.amount * 60 * line.machinesExact) / recipe.durationSeconds;
        const producer = producerOf.get(input.item);
        if (producer && producer !== line.recipe) {
          edges.push({ from: producer, to: line.recipe, weight: perMinute });
        } else if (!producer) {
          const sourceId = `${RAW_PREFIX}${input.item}`;
          if (!rawSeen.has(sourceId)) {
            rawSeen.add(sourceId);
            nodeIds.push({ id: sourceId });
          }
          edges.push({ from: sourceId, to: line.recipe, weight: perMinute });
        }
      }
    }

    const laid = layerGraph(nodeIds, edges);
    const positions = new Map<string, { x: number; y: number }>();

    // Centre each layer vertically against the tallest one.
    const perLayer = new Map<number, number>();
    for (const node of laid.nodes) perLayer.set(node.layer, (perLayer.get(node.layer) ?? 0) + 1);
    const tallest = Math.max(...perLayer.values(), 1);
    const contentH = tallest * NODE_H + (tallest - 1) * GAP_Y;

    for (const node of laid.nodes) {
      const count = perLayer.get(node.layer) ?? 1;
      const layerH = count * NODE_H + (count - 1) * GAP_Y;
      positions.set(node.id, {
        x: PAD + node.layer * (NODE_W + GAP_X),
        y: PAD + (contentH - layerH) / 2 + node.order * (NODE_H + GAP_Y),
      });
    }

    const nodes: DrawNode[] = laid.nodes.map((node) => {
      const at = positions.get(node.id)!;
      if (node.id.startsWith(RAW_PREFIX)) {
        const item = node.id.slice(RAW_PREFIX.length);
        const amount = result.rawInputs[item] ?? 0;
        return {
          id: node.id,
          kind: 'raw',
          title: itemName(db, item),
          detail: `${fmtRate(amount)}${unit(db, item)} mined`,
          built: null,
          planned: 0,
          uptime: null,
          x: at.x,
          y: at.y,
        };
      }
      const line = result.lines.find((l) => l.recipe === node.id)!;
      const product = db.recipes[node.id]?.outputs[0]?.item ?? '';
      const standing = actual?.[node.id];
      return {
        id: node.id,
        kind: targetItems.has(product) ? 'target' : 'intermediate',
        title: itemName(db, product),
        detail: machineName(db, line.machine),
        built: actual ? (standing?.count ?? 0) : null,
        planned: line.machinesToBuild,
        uptime: standing?.uptime ?? null,
        x: at.x,
        y: at.y,
      };
    });

    // Widths are square-rooted: a 300/min belt should read as heavier than a
    // 15/min one without being twenty times thicker and swallowing the diagram.
    const maxWeight = Math.max(...edges.map((e) => e.weight ?? 1), 1);
    const drawEdges: DrawEdge[] = edges.map((edge, index) => {
      const from = positions.get(edge.from)!;
      const to = positions.get(edge.to)!;
      const x1 = from.x + NODE_W;
      const y1 = from.y + NODE_H / 2;
      const x2 = to.x;
      const y2 = to.y + NODE_H / 2;
      const bend = Math.max(28, (x2 - x1) / 2);
      const weight = edge.weight ?? 1;
      return {
        key: `${edge.from}->${edge.to}-${index}`,
        from: edge.from,
        to: edge.to,
        path: `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`,
        width: 1.2 + Math.sqrt(weight / maxWeight) * 5,
        label: `${fmtRate(weight)}/min`,
        // The midpoint of a symmetric cubic is the average of the ends and the
        // controls, which for this bend is simply halfway across and between.
        labelX: (x1 + x2) / 2,
        labelY: (y1 + y2) / 2 - 5,
      };
    });

    return {
      nodes,
      edges: drawEdges,
      width: PAD * 2 + laid.layerCount * NODE_W + (laid.layerCount - 1) * GAP_X,
      height: PAD * 2 + contentH,
      dropped: laid.droppedEdges.length,
    };
  }, [db, result, targets, actual]);

  /*
   * What the selected step touches, walked both ways. Everything that feeds it
   * and everything it feeds stays lit; the rest fogs — which is what makes a
   * diagram of seventeen steps answer a question about one of them.
   */
  const lit = useMemo(() => {
    if (!model || !selected) return null;
    const up = new Map<string, string[]>();
    const down = new Map<string, string[]>();
    for (const edge of model.edges) {
      (down.get(edge.from) ?? down.set(edge.from, []).get(edge.from)!).push(edge.to);
      (up.get(edge.to) ?? up.set(edge.to, []).get(edge.to)!).push(edge.from);
    }
    const seen = new Set<string>([selected]);
    for (const map of [up, down]) {
      const queue = [selected];
      while (queue.length > 0) {
        const at = queue.pop()!;
        for (const next of map.get(at) ?? []) {
          if (seen.has(next)) continue;
          seen.add(next);
          queue.push(next);
        }
      }
    }
    return seen;
  }, [model, selected]);

  if (!model) {
    return (
      <Text color="fg.subtle" fontSize="14px" py={5}>
        Add a production target and the plan is drawn here as a flow.
      </Text>
    );
  }

  const dim = (id: string) => (lit && !lit.has(id) ? FOGGED : 1);

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
        <Box asChild minW={`${Math.min(model.width, 1180)}px`}>
          <svg
            viewBox={`0 0 ${model.width} ${model.height}`}
            width={model.width}
            height={model.height}
            role="img"
            aria-label={`Production flow: ${model.nodes.length} steps from raw ore to finished parts`}
            style={{ maxWidth: '100%', height: 'auto', display: 'block' }}
            onClick={() => setSelected(null)}
          >
            <g fill="none">
              {model.edges.map((edge) => (
                <SvgPath
                  key={edge.key}
                  d={edge.path}
                  stroke="steel.500"
                  strokeWidth={edge.width}
                  strokeLinecap="round"
                  fill="none"
                  opacity={lit && (!lit.has(edge.from) || !lit.has(edge.to)) ? FOGGED : 0.34}
                />
              ))}
            </g>

            {/*
             * Rates, written rather than hidden behind a hover. Cased in the
             * surface colour so a label crossing three belts is still readable
             * — the same treatment the map gives its captions.
             */}
            {model.edges.map((edge) => (
              <SvgText
                key={`${edge.key}-label`}
                x={edge.labelX}
                y={edge.labelY}
                fill="fg.muted"
                stroke="bg.surface"
                strokeWidth={3.5}
                fontSize="10px"
                fontFamily="mono"
                textAnchor="middle"
                opacity={lit && (!lit.has(edge.from) || !lit.has(edge.to)) ? FOGGED : 1}
                style={{ paintOrder: 'stroke' }}
              >
                {edge.label}
              </SvgText>
            ))}

            {model.nodes.map((node) => {
              const fill =
                node.kind === 'raw'
                  ? 'bg.muted'
                  : node.kind === 'target'
                    ? 'accent.subtle'
                    : 'bg.surface';
              const stroke =
                node.kind === 'raw'
                  ? 'fg.subtle'
                  : node.kind === 'target'
                    ? 'accent.solid'
                    : 'steel.500';
              // Nothing standing yet: dashed, the same language the map uses
              // for a machine that is planned and not built.
              const unbuilt = node.built === 0 && node.planned > 0;
              const short = node.built !== null && node.built < node.planned;
              return (
                <SvgG
                  key={node.id}
                  opacity={dim(node.id)}
                  style={{ cursor: node.kind === 'raw' ? 'default' : 'pointer' }}
                  onClick={(event: React.MouseEvent) => {
                    event.stopPropagation();
                    if (node.kind === 'raw') return;
                    setSelected((current) => (current === node.id ? null : node.id));
                  }}
                >
                  <SvgRect
                    x={node.x}
                    y={node.y}
                    width={NODE_W}
                    height={NODE_H}
                    rx={3}
                    fill={fill}
                    stroke={selected === node.id ? 'accent.solid' : stroke}
                    strokeWidth={node.kind === 'target' || selected === node.id ? 2 : 1.25}
                    strokeDasharray={unbuilt ? '5 4' : undefined}
                  />
                  <SvgText
                    x={node.x + 12}
                    y={node.y + 22}
                    fill="fg.default"
                    fontSize="13.5px"
                    fontWeight="600"
                  >
                    {node.title.length > 24 ? `${node.title.slice(0, 23)}…` : node.title}
                    <title>{node.title}</title>
                  </SvgText>

                  {node.built === null ? (
                    <SvgText
                      x={node.x + 12}
                      y={node.y + 42}
                      fill="fg.muted"
                      fontSize="11px"
                      fontFamily="mono"
                    >
                      {node.planned > 0 ? `${node.planned}× ${node.detail}` : node.detail}
                    </SvgText>
                  ) : (
                    <SvgText
                      x={node.x + 12}
                      y={node.y + 42}
                      fill="fg.muted"
                      fontSize="11px"
                      fontFamily="mono"
                    >
                      {node.built} / {node.planned} {node.detail}
                      {short ? ` · ${node.planned - node.built} to build` : ''}
                    </SvgText>
                  )}

                  {/*
                   * The bar carries the state and the number stays in text ink:
                   * the warning step is 4.04:1 on the light surface, below the
                   * 4.5:1 a reader needs to read words at.
                   */}
                  {node.uptime !== null ? (
                    <>
                      <SvgRect
                        x={node.x + 12}
                        y={node.y + 54}
                        width={NODE_W - 62}
                        height={5}
                        fill="bg.muted"
                      />
                      <SvgRect
                        x={node.x + 12}
                        y={node.y + 54}
                        width={Math.max(2, (NODE_W - 62) * node.uptime)}
                        height={5}
                        fill={TONE[toneOf(node.uptime)]}
                      />
                      <SvgText
                        x={node.x + NODE_W - 12}
                        y={node.y + 60}
                        fill="fg.muted"
                        fontSize="10.5px"
                        fontFamily="mono"
                        textAnchor="end"
                      >
                        {Math.round(node.uptime * 100)}%
                      </SvgText>
                    </>
                  ) : node.kind !== 'raw' && node.built === 0 ? (
                    <SvgText
                      x={node.x + 12}
                      y={node.y + 60}
                      fill="fg.subtle"
                      fontSize="10.5px"
                      fontFamily="mono"
                    >
                      nothing built yet
                    </SvgText>
                  ) : null}
                </SvgG>
              );
            })}
          </svg>
        </Box>
      </Box>

      <Flex gap={4} mt={2.5} wrap="wrap" align="center">
        <Flex align="center" gap={1.5}>
          <Box w="10px" h="10px" bg="bg.muted" borderWidth="1px" borderColor="fg.subtle" />
          <Label>Mined</Label>
        </Flex>
        <Flex align="center" gap={1.5}>
          <Box w="10px" h="10px" bg="bg.surface" borderWidth="1px" borderColor="steel.500" />
          <Label>Intermediate</Label>
        </Flex>
        <Flex align="center" gap={1.5}>
          <Box w="10px" h="10px" bg="accent.subtle" borderWidth="2px" borderColor="accent.solid" />
          <Label>Your target</Label>
        </Flex>
        <Flex align="center" gap={1.5}>
          <Box
            w="10px"
            h="10px"
            bg="bg.surface"
            borderWidth="1px"
            borderStyle="dashed"
            borderColor="steel.500"
          />
          <Label>Nothing built yet</Label>
        </Flex>
        <Label>
          {selected ? 'Click again to show everything' : 'Click a step to trace its chain'}
        </Label>
      </Flex>

      {model.dropped > 0 ? (
        <Text fontSize="13px" color="status.warn" mt={2}>
          {model.dropped} edge{model.dropped === 1 ? '' : 's'} hidden to break a recipe loop.
        </Text>
      ) : null}
    </Box>
  );
}
