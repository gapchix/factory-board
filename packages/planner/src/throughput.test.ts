import { describe, expect, it } from 'vitest';
import { testDatabase as db } from './fixtures.js';
import { carriersFor, extractionFrom, extractorsFor } from './throughput.js';
import type { GameDatabase } from './types.js';

describe('carriersFor', () => {
  /*
   * The case the whole module exists for. The board writes 176 Iron Ingot a
   * minute over a Mk.1 belt and says nothing; a Mk.1 carries sixty, so that is
   * three of them — or one Mk.3, which is a tier you may not have.
   */
  it('says how many of each tier it takes', () => {
    expect(carriersFor(db, 176)).toEqual([
      { carrier: 'belt-1', name: 'Conveyor Belt Mk.1', ratePerMinute: 60, count: 3 },
      { carrier: 'belt-2', name: 'Conveyor Belt Mk.2', ratePerMinute: 120, count: 2 },
      { carrier: 'belt-3', name: 'Conveyor Belt Mk.3', ratePerMinute: 270, count: 1 },
    ]);
  });

  /*
   * A rate that lands exactly on a belt's capacity fills one belt, not two.
   * 180/60 is 3.0000000000000004 often enough to matter, and the fourth belt
   * it asks for carries nothing.
   */
  it('does not ask for a belt to carry a rounding error', () => {
    expect(carriersFor(db, 120).find((c) => c.carrier === 'belt-2')?.count).toBe(1);
    expect(carriersFor(db, 180).find((c) => c.carrier === 'belt-1')?.count).toBe(3);
    expect(carriersFor(db, 0.3).find((c) => c.carrier === 'belt-1')?.count).toBe(1);
  });

  /*
   * An item cannot go down a pipe and m³ cannot go on a belt, so the two never
   * appear in the same answer. Lifts are left out of both: a lift is a belt
   * that goes up, and offering one alongside its own belt answers nothing.
   */
  it('offers belts for items and pipes for fluids, and never a lift', () => {
    expect(carriersFor(db, 100).map((c) => c.carrier)).toEqual(['belt-1', 'belt-2', 'belt-3']);
    // One entry per rate: a Clean Pipeline is a Pipeline with the indicator
    // taken off, and choosing between them is not a throughput decision.
    expect(carriersFor(db, 450, { fluid: true })).toEqual([
      { carrier: 'pipe-1', name: 'Pipeline Mk.1', ratePerMinute: 300, count: 2 },
    ]);
  });

  it('has nothing to say about a rate of nothing', () => {
    expect(carriersFor(db, 0)).toEqual([]);
  });
});

describe('extractionFrom', () => {
  /*
   * The ceiling you cannot widen. Two Miner Mk.1s are 120/min on normal nodes
   * and 240 even if both were pure — against a plan wanting 300.75 they are
   * short whatever is underneath them, which is a thing the board can say
   * without knowing the purity it will never be told.
   */
  it('answers as a range, because the node purity is not in the save', () => {
    expect(extractionFrom(db, ['miner-1', 'miner-1'])).toEqual({
      ratePerMinute: 120,
      min: 60,
      max: 240,
      purityVaries: true,
      extractors: 2,
    });
  });

  it('does not range over water, which stands on no node', () => {
    expect(extractionFrom(db, ['water-pump'])).toMatchObject({
      ratePerMinute: 120,
      min: 120,
      max: 120,
      purityVaries: false,
    });
  });

  it('counts the marks it knows and ignores the ones it does not', () => {
    expect(extractionFrom(db, ['miner-1', 'miner-2', 'MinerMk9'])).toMatchObject({
      ratePerMinute: 180,
      extractors: 2,
    });
    // Not "0 per minute", which reads as a measurement of a mine that is there.
    expect(extractionFrom(db, ['MinerMk9'])).toBeNull();
    expect(extractionFrom(db, [])).toBeNull();
  });
});

describe('extractorsFor', () => {
  /*
   * A miner names no resources because it takes whatever node it is bolted to.
   * Read as "anything at all", that offers a Miner Mk.1 for water.
   */
  it('matches on form where the game names no resource', () => {
    expect(extractorsFor(db, 'iron-ore')).toEqual(['miner-1', 'miner-2']);
    expect(extractorsFor(db, 'water')).toEqual(['water-pump']);
  });

  it('offers nothing for something nobody mines', () => {
    // An Iron Rod is a solid, and a miner takes any solid — but nothing that
    // is not raw comes out of the ground.
    expect(extractorsFor(db, 'iron-rod')).toEqual([]);
    expect(extractorsFor(db, 'nonsense')).toEqual([]);
  });

  it('says nothing when the database knows no carriers or extractors', () => {
    const bare = { ...db, carriers: {}, extractors: {} } as GameDatabase;
    expect(carriersFor(bare, 100)).toEqual([]);
    expect(extractionFrom(bare, ['miner-1'])).toBeNull();
  });
});
