import { describe, expect, it } from 'vitest';
import { clusterZones, type Placement } from './cluster.js';

const machine = (
  x: number,
  y: number,
  recipe = 'r-iron-rod',
  name = 'ConstructorMk1',
): Placement => ({
  machine: name,
  x,
  y,
  recipe,
});

const belt = (x: number, y: number): Placement => ({ machine: 'ConveyorBeltMk1', x, y });

describe('clusterZones', () => {
  it('returns nothing for an empty world', () => {
    const result = clusterZones([]);
    expect(result.zones).toEqual([]);
    expect(result.bounds).toBeNull();
  });

  it('groups machines that sit close together', () => {
    const result = clusterZones([machine(0, 0), machine(10, 0), machine(0, 10)]);
    expect(result.zones).toHaveLength(1);
    expect(result.zones[0]?.anchors).toHaveLength(3);
  });

  it('separates clusters that sit far apart', () => {
    const result = clusterZones([
      machine(0, 0),
      machine(10, 0),
      machine(500, 500),
      machine(510, 500),
    ]);
    expect(result.zones).toHaveLength(2);
  });

  it('chains through intermediate machines — single linkage, not radius from a centre', () => {
    // Each step is within the radius, so all four belong to one zone even though
    // the ends are 90 m apart.
    const result = clusterZones([machine(0, 0), machine(30, 0), machine(60, 0), machine(90, 0)]);
    expect(result.zones).toHaveLength(1);
    expect(result.zones[0]?.widthM).toBe(90);
  });

  // The bug this whole design avoids: belts run continuously, so letting them
  // anchor zones welds every distant outpost into one blob.
  it('does not let a belt run weld two areas into one zone', () => {
    const belts: Placement[] = [];
    for (let x = 20; x < 500; x += 8) belts.push(belt(x, 0));
    const result = clusterZones([
      machine(0, 0),
      machine(10, 0),
      ...belts,
      machine(500, 0),
      machine(510, 0),
    ]);
    expect(result.zones).toHaveLength(2);
  });

  it('attaches nearby infrastructure to a zone without letting it define one', () => {
    const result = clusterZones([machine(0, 0), machine(10, 0), belt(5, 5), belt(6, 6)]);
    expect(result.zones).toHaveLength(1);
    expect(result.zones[0]?.attachedCount).toBe(2);
    expect(result.zones[0]?.anchors).toHaveLength(2);
  });

  it('counts buildings that sit outside every zone', () => {
    const result = clusterZones([machine(0, 0), machine(10, 0), belt(9000, 9000)]);
    expect(result.unassignedCount).toBe(1);
  });

  it('drops lone machines as strays', () => {
    const result = clusterZones([machine(0, 0), machine(10, 0), machine(900, 900)]);
    expect(result.zones).toHaveLength(1);
    expect(result.strays).toHaveLength(1);
    expect(result.strays[0]?.x).toBe(900);
  });

  it('keeps lone machines when asked to', () => {
    const result = clusterZones([machine(0, 0), machine(900, 900)], { minAnchors: 1 });
    expect(result.zones).toHaveLength(2);
    expect(result.strays).toEqual([]);
  });

  it('reports bounds, size and centre in metres', () => {
    // Explicit radius: this test is about the geometry it reports, not about
    // where the clustering threshold happens to fall.
    const result = clusterZones([machine(-10, -20), machine(10, 20)], { radiusM: 60 });
    const zone = result.zones[0]!;
    expect(zone.bounds).toEqual({ minX: -10, minY: -20, maxX: 10, maxY: 20 });
    expect(zone.center).toEqual({ x: 0, y: 0 });
    expect(zone.widthM).toBe(20);
    expect(zone.depthM).toBe(40);
  });

  it('names the dominant recipe and counts the rest', () => {
    const result = clusterZones([
      machine(0, 0, 'r-screw'),
      machine(5, 0, 'r-screw'),
      machine(10, 0, 'r-iron-rod'),
    ]);
    const zone = result.zones[0]!;
    expect(zone.dominantRecipe).toBe('r-screw');
    expect(zone.recipeCounts).toEqual({ 'r-screw': 2, 'r-iron-rod': 1 });
    expect(zone.machineCounts).toEqual({ ConstructorMk1: 3 });
  });

  it('orders zones by how many machines they hold', () => {
    const result = clusterZones([
      machine(0, 0),
      machine(10, 0),
      machine(500, 500),
      machine(510, 500),
      machine(520, 500),
    ]);
    expect(result.zones[0]?.anchors).toHaveLength(3);
    expect(result.zones[0]?.id).toBe('zone-1');
    expect(result.zones[1]?.anchors).toHaveLength(2);
  });

  it('honours a custom anchor rule', () => {
    const result = clusterZones([belt(0, 0), belt(10, 0)], {
      isAnchor: (p) => p.machine.startsWith('Conveyor'),
    });
    expect(result.zones).toHaveLength(1);
  });

  it('respects a wider radius', () => {
    const far = [machine(0, 0), machine(100, 0)];
    expect(clusterZones(far).zones).toHaveLength(0); // both are strays
    expect(clusterZones(far, { radiusM: 150 }).zones).toHaveLength(1);
  });
});
