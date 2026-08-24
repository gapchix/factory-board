import { describe, expect, it } from 'vitest';
import { layerGraph, type GraphEdge, type GraphNode } from './flow.js';

const nodes = (...ids: string[]): GraphNode[] => ids.map((id) => ({ id }));
const edge = (from: string, to: string, weight?: number): GraphEdge =>
  weight === undefined ? { from, to } : { from, to, weight };

const layerOf = (result: ReturnType<typeof layerGraph>, id: string) =>
  result.nodes.find((n) => n.id === id)?.layer;

describe('layerGraph', () => {
  it('handles an empty graph', () => {
    const result = layerGraph([], []);
    expect(result.nodes).toEqual([]);
    expect(result.layerCount).toBe(0);
  });

  it('puts unconnected nodes all in the first layer', () => {
    const result = layerGraph(nodes('a', 'b', 'c'), []);
    expect(result.layerCount).toBe(1);
    expect(result.maxLayerSize).toBe(3);
  });

  it('orders a chain left to right', () => {
    const result = layerGraph(nodes('ore', 'ingot', 'rod'), [
      edge('ore', 'ingot'),
      edge('ingot', 'rod'),
    ]);
    expect(layerOf(result, 'ore')).toBe(0);
    expect(layerOf(result, 'ingot')).toBe(1);
    expect(layerOf(result, 'rod')).toBe(2);
  });

  // Longest path, not shortest: a node must sit right of *everything* feeding
  // it, or an edge would point backwards in the drawing.
  it('places a node after its furthest input, not its nearest', () => {
    const result = layerGraph(nodes('a', 'b', 'c', 'd'), [
      edge('a', 'b'),
      edge('b', 'c'),
      edge('a', 'd'),
      edge('c', 'd'),
    ]);
    expect(layerOf(result, 'd')).toBe(3);
  });

  it('never points an edge backwards', () => {
    const graphEdges = [
      edge('ore', 'ingot'),
      edge('ingot', 'plate'),
      edge('ingot', 'rod'),
      edge('rod', 'screw'),
      edge('plate', 'rip'),
      edge('screw', 'rip'),
    ];
    const result = layerGraph(nodes('ore', 'ingot', 'plate', 'rod', 'screw', 'rip'), graphEdges);
    for (const e of graphEdges) {
      expect(layerOf(result, e.from)!).toBeLessThan(layerOf(result, e.to)!);
    }
  });

  it('gives every node a unique position inside its layer', () => {
    const result = layerGraph(nodes('a', 'b', 'c', 'd'), [edge('a', 'c'), edge('b', 'd')]);
    for (let layer = 0; layer < result.layerCount; layer += 1) {
      const orders = result.nodes.filter((n) => n.layer === layer).map((n) => n.order);
      expect(new Set(orders).size).toBe(orders.length);
      expect([...orders].sort((x, y) => x - y)).toEqual(orders.map((_, i) => i));
    }
  });

  it('breaks a cycle instead of hanging, and says which edges it dropped', () => {
    const result = layerGraph(nodes('a', 'b'), [edge('a', 'b'), edge('b', 'a')]);
    expect(result.nodes).toHaveLength(2);
    expect(result.droppedEdges.length).toBeGreaterThan(0);
  });

  it('survives a self-edge', () => {
    const result = layerGraph(nodes('a'), [edge('a', 'a')]);
    expect(result.nodes).toHaveLength(1);
    expect(layerOf(result, 'a')).toBe(0);
  });

  it('ignores edges pointing at nodes that do not exist', () => {
    const result = layerGraph(nodes('a'), [edge('a', 'ghost')]);
    expect(result.nodes).toHaveLength(1);
    expect(result.layerCount).toBe(1);
  });

  it('is deterministic — the same plan always draws the same way', () => {
    const graphNodes = nodes('a', 'b', 'c', 'd', 'e');
    const graphEdges = [edge('a', 'c'), edge('b', 'c'), edge('c', 'd'), edge('b', 'e')];
    const first = layerGraph(graphNodes, graphEdges);
    const second = layerGraph([...graphNodes].reverse(), [...graphEdges].reverse());
    expect(second.nodes).toEqual(first.nodes);
  });

  it('reports the busiest layer, which sets the drawing height', () => {
    const result = layerGraph(nodes('root', 'a', 'b', 'c'), [
      edge('root', 'a'),
      edge('root', 'b'),
      edge('root', 'c'),
    ]);
    expect(result.maxLayerSize).toBe(3);
    expect(result.layerCount).toBe(2);
  });

  it('pulls a heavily weighted edge straighter than a light one', () => {
    // `heavy` is fed only by `h`, `light` only by `l`; the barycentre should put
    // each consumer next to its producer rather than in arbitrary order.
    const result = layerGraph(nodes('h', 'l', 'heavy', 'light'), [
      edge('h', 'heavy', 100),
      edge('l', 'light', 1),
    ]);
    const h = result.nodes.find((n) => n.id === 'h')!;
    const heavy = result.nodes.find((n) => n.id === 'heavy')!;
    const l = result.nodes.find((n) => n.id === 'l')!;
    const light = result.nodes.find((n) => n.id === 'light')!;
    expect(heavy.order).toBe(h.order);
    expect(light.order).toBe(l.order);
  });
});
