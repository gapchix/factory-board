/**
 * Layered layout for a production graph.
 *
 * A factory plan is a DAG: ore on the left, the thing you are building on the
 * right, and every intermediate in between. Drawing it that way shows the
 * mechanism — what feeds what, and where a chain narrows — which a list of cards
 * cannot.
 *
 * This is the classic Sugiyama first two phases: assign each node to a layer so
 * every edge points forward, then order within layers to reduce crossings. It
 * deliberately stops short of exact crossing minimisation, which is NP-hard and
 * pointless at the scale of a factory plan (tens of nodes, not thousands).
 */

/** Append to a map of arrays, creating the array on first use. */
function pushInto<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const existing = map.get(key);
  if (existing) existing.push(value);
  else map.set(key, [value]);
}

export interface GraphNode {
  readonly id: string;
}

export interface GraphEdge {
  readonly from: string;
  readonly to: string;
  /** Used to weight the barycentre, so heavy flows sit straighter. */
  readonly weight?: number | undefined;
}

export interface LayeredNode {
  readonly id: string;
  /** 0 is the leftmost layer: the things nothing else feeds. */
  readonly layer: number;
  /** Position within the layer, top to bottom. */
  readonly order: number;
}

export interface LayeredGraph {
  readonly nodes: readonly LayeredNode[];
  readonly layerCount: number;
  /** How many nodes sit in the busiest layer. */
  readonly maxLayerSize: number;
  /** Edges that had to be ignored to break a cycle. */
  readonly droppedEdges: readonly GraphEdge[];
}

export interface LayerOptions {
  /** Barycentre sweeps. Two or three gets most of the benefit. Default 4. */
  readonly passes?: number;
}

/**
 * Assign layers by longest path, ignoring edges that would close a cycle.
 *
 * Cycles are rare but real once alternate recipes are in play — Satisfactory has
 * genuine loops, such as recycled plastic and rubber feeding each other. A cycle
 * must not hang the layout, so back edges are dropped and reported.
 */
function assignLayers(
  nodes: readonly GraphNode[],
  edges: readonly GraphEdge[],
): { layers: Map<string, number>; dropped: GraphEdge[] } {
  const incoming = new Map<string, GraphEdge[]>();
  const outgoing = new Map<string, GraphEdge[]>();
  const known = new Set(nodes.map((n) => n.id));

  const usable: GraphEdge[] = [];
  for (const edge of edges) {
    if (!known.has(edge.from) || !known.has(edge.to) || edge.from === edge.to) continue;
    usable.push(edge);
    pushInto(outgoing, edge.from, edge);
    pushInto(incoming, edge.to, edge);
  }

  // Kahn's algorithm; whatever remains when the queue empties is in a cycle.
  const remaining = new Map<string, number>();
  for (const node of nodes) remaining.set(node.id, (incoming.get(node.id) ?? []).length);

  const layers = new Map<string, number>();
  const queue: string[] = [];
  for (const [id, count] of remaining) if (count === 0) queue.push(id);
  for (const id of queue) layers.set(id, 0);

  while (queue.length > 0) {
    const id = queue.shift()!;
    const layer = layers.get(id) ?? 0;
    for (const edge of outgoing.get(id) ?? []) {
      layers.set(edge.to, Math.max(layers.get(edge.to) ?? 0, layer + 1));
      const left = (remaining.get(edge.to) ?? 1) - 1;
      remaining.set(edge.to, left);
      if (left === 0) queue.push(edge.to);
    }
  }

  const dropped: GraphEdge[] = [];
  const stuck = nodes.filter((n) => !layers.has(n.id));
  if (stuck.length > 0) {
    // Place the cycle after everything that reaches it, and report the edges
    // inside it rather than pretending the graph was acyclic.
    for (const node of stuck) {
      const feeders = (incoming.get(node.id) ?? [])
        .map((e) => layers.get(e.from))
        .filter((l): l is number => l !== undefined);
      layers.set(node.id, feeders.length > 0 ? Math.max(...feeders) + 1 : 0);
    }
    const stuckIds = new Set(stuck.map((n) => n.id));
    for (const edge of usable) {
      if (stuckIds.has(edge.from) && stuckIds.has(edge.to)) dropped.push(edge);
    }
  }

  return { layers, dropped };
}

/** Median of a sorted-able list; the barycentre heuristic's input. */
function mean(values: readonly number[]): number | undefined {
  if (values.length === 0) return undefined;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export function layerGraph(
  nodes: readonly GraphNode[],
  edges: readonly GraphEdge[],
  options: LayerOptions = {},
): LayeredGraph {
  if (nodes.length === 0) {
    return { nodes: [], layerCount: 0, maxLayerSize: 0, droppedEdges: [] };
  }

  const { layers, dropped } = assignLayers(nodes, edges);
  const droppedSet = new Set(dropped);
  const live = edges.filter((e) => !droppedSet.has(e));

  const layerCount = Math.max(...[...layers.values()], 0) + 1;
  const byLayer: string[][] = Array.from({ length: layerCount }, () => []);
  for (const node of nodes) byLayer[layers.get(node.id) ?? 0]!.push(node.id);

  // Stable starting order, so the same plan always draws the same way.
  for (const layer of byLayer) layer.sort();

  const order = new Map<string, number>();
  const reindex = () => {
    for (const layer of byLayer) layer.forEach((id, index) => order.set(id, index));
  };
  reindex();

  const predecessors = new Map<string, GraphEdge[]>();
  const successors = new Map<string, GraphEdge[]>();
  for (const edge of live) {
    pushInto(predecessors, edge.to, edge);
    pushInto(successors, edge.from, edge);
  }

  const barycentre = (id: string, side: 'up' | 'down'): number | undefined => {
    const list = side === 'up' ? (predecessors.get(id) ?? []) : (successors.get(id) ?? []);
    const positions: number[] = [];
    for (const edge of list) {
      const other = side === 'up' ? edge.from : edge.to;
      const position = order.get(other);
      if (position === undefined) continue;
      const weight = Math.max(1, Math.round(edge.weight ?? 1));
      for (let i = 0; i < Math.min(weight, 8); i += 1) positions.push(position);
    }
    return mean(positions);
  };

  const passes = options.passes ?? 4;
  for (let pass = 0; pass < passes; pass += 1) {
    const side = pass % 2 === 0 ? 'up' : 'down';
    const sequence =
      side === 'up'
        ? byLayer.map((_, i) => i).slice(1)
        : byLayer
            .map((_, i) => i)
            .slice(0, -1)
            .reverse();

    for (const index of sequence) {
      const layer = byLayer[index]!;
      const keys = new Map<string, number>();
      layer.forEach((id, position) => {
        keys.set(id, barycentre(id, side) ?? position);
      });
      layer.sort((a, b) => (keys.get(a) ?? 0) - (keys.get(b) ?? 0) || a.localeCompare(b));
    }
    reindex();
  }

  const laidOut: LayeredNode[] = [];
  byLayer.forEach((layer, index) => {
    layer.forEach((id, position) => laidOut.push({ id, layer: index, order: position }));
  });

  return {
    nodes: laidOut,
    layerCount,
    maxLayerSize: Math.max(...byLayer.map((l) => l.length), 0),
    droppedEdges: dropped,
  };
}
