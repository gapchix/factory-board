'use client';

import { Box, chakra, Flex, Text } from '@chakra-ui/react';
import type { GameDatabase, SolveResult } from '@factory-board/planner';
import { layerGraph, type GraphEdge } from '@factory-board/layout';
import { useMemo } from 'react';
import { itemName, machineName, rate as fmtRate, unit } from '@/lib/format';
import { Label } from './primitives';

/**
 * The plan as a schematic: ore on the left, what you are building on the right.
 *
 * A list of cards tells you how many machines you need. It cannot tell you that
 * screws feed both the reinforced plate line and the rotor line, or that one rod
 * constructor is carrying two branches — which is exactly what you need to know
 * when a line starves. So the plan is drawn as the graph it actually is.
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

const NODE_W = 156;
const NODE_H = 56;
const GAP_X = 104;
const GAP_Y = 16;
const PAD = 16;

type NodeKind = 'raw' | 'intermediate' | 'target';

interface DrawNode {
  readonly id: string;
  readonly kind: NodeKind;
  readonly title: string;
  readonly subtitle: string;
  readonly x: number;
  readonly y: number;
}

interface DrawEdge {
  readonly key: string;
  readonly path: string;
  readonly width: number;
  readonly label: string;
}

const RAW_PREFIX = 'raw:';

export function FlowDiagram({
  db,
  result,
  targets,
}: {
  db: GameDatabase;
  result: SolveResult;
  targets: readonly { item: string }[];
}) {
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
          subtitle: `${fmtRate(amount)}${unit(db, item)}`,
          x: at.x,
          y: at.y,
        };
      }
      const line = result.lines.find((l) => l.recipe === node.id)!;
      const product = db.recipes[node.id]?.outputs[0]?.item ?? '';
      return {
        id: node.id,
        kind: targetItems.has(product) ? 'target' : 'intermediate',
        title: itemName(db, product),
        subtitle: `${line.machinesToBuild}× ${machineName(db, line.machine)}`,
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
        path: `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`,
        width: 1.2 + Math.sqrt(weight / maxWeight) * 5,
        label: `${fmtRate(weight)}/min`,
      };
    });

    return {
      nodes,
      edges: drawEdges,
      width: PAD * 2 + laid.layerCount * NODE_W + (laid.layerCount - 1) * GAP_X,
      height: PAD * 2 + contentH,
      dropped: laid.droppedEdges.length,
    };
  }, [db, result, targets]);

  if (!model) {
    return (
      <Text color="fg.subtle" fontSize="14px" py={5}>
        Add a production target and the plan is drawn here as a flow.
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
        <Box asChild minW={`${Math.min(model.width, 1180)}px`}>
          <svg
            viewBox={`0 0 ${model.width} ${model.height}`}
            width={model.width}
            height={model.height}
            role="img"
            aria-label={`Production flow: ${model.nodes.length} steps from raw ore to finished parts`}
            style={{ maxWidth: '100%', height: 'auto', display: 'block' }}
          >
            <g fill="none" opacity={0.34}>
              {model.edges.map((edge) => (
                <SvgPath
                  key={edge.key}
                  d={edge.path}
                  stroke="steel.500"
                  strokeWidth={edge.width}
                  strokeLinecap="round"
                  fill="none"
                >
                  <title>{edge.label}</title>
                </SvgPath>
              ))}
            </g>

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
              return (
                <g key={node.id}>
                  <SvgRect
                    x={node.x}
                    y={node.y}
                    width={NODE_W}
                    height={NODE_H}
                    rx={3}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={node.kind === 'target' ? 2 : 1.25}
                  />
                  <SvgText
                    x={node.x + 12}
                    y={node.y + 23}
                    fill="fg.default"
                    fontSize="13px"
                    fontWeight="600"
                  >
                    {node.title.length > 19 ? `${node.title.slice(0, 18)}…` : node.title}
                    <title>{node.title}</title>
                  </SvgText>
                  <SvgText
                    x={node.x + 12}
                    y={node.y + 41}
                    fill="fg.muted"
                    fontSize="11px"
                    fontFamily="mono"
                  >
                    {node.subtitle}
                  </SvgText>
                </g>
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
        <Label>Line thickness is throughput · hover an edge for the rate</Label>
      </Flex>

      {model.dropped > 0 ? (
        <Text fontSize="13px" color="status.warn" mt={2}>
          {model.dropped} edge{model.dropped === 1 ? '' : 's'} hidden to break a recipe loop.
        </Text>
      ) : null}
    </Box>
  );
}
