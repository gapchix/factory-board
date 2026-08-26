# 18. The save says what feeds what, so the map can answer "why is this starving?"

**Status:** accepted · 2026-08-26

## Context

The board could say a line was running at 60%. It could not say why. That is the question
a player actually has, and answering it meant walking the factory yourself.

Everything needed was in the save and unread. Every connection component — a machine's
`Output0`, a belt's `ConveyorAny1`, a splitter's `Connection2` — names the component it is
plugged into, and **every connection is declared from both ends**: 422 of them on the
reference save, 0 one-way. Following them from one miner walked 40 hops through belts,
splitters, mergers, smelters, constructors and assemblers.

Geometry had already been tried for a weaker version of this question, and
[ADR 15](0015-runs-are-joined-fittings-are-drawn.md) recorded what it was worth: guessing
which belt continues which bought one join in a hundred. This is the data that guessing
was standing in for.

## Decision

`WorldSnapshot` carries **`links`** — what feeds what, as pairs of placement indices —
and each `BuildingPath` names the building that drew it.

Direction comes from the component names. A belt's `ConveyorAny0` is the end items arrive
at and `ConveyorAny1` the end they leave by; a machine names its `Input` and `Output`
ports. A splitter's `Connection0..3` say nothing, and do not need to: the other side of
any conveyor link is always a belt, and the belt always knows.

Pipes are **undirected**, because which way fluid moves depends on the pumps.

On the factory map, clicking a machine traces the chain: what feeds it, what it feeds, the
rest of the base dimmed. The panel names the **weakest link** — the worst-running thing
upstream — and offers to take you there.

## Why

**Because it is stated rather than inferred.** A belt that ends near a machine may or may
not feed it; the save does not leave that open.

**Because "two hops upstream" should mean two machines.** Belts, splitters and mergers are
walked _through_ rather than counted. Otherwise a hop count on a real base is a measure of
conveyor, which is not a thing anyone wants to know.

**Because a healthy supply is also an answer.** The weakest link is only named when
something upstream is running worse than the machine asked about. A miner at 98% explains
nothing, and naming it would send someone half a kilometre across the map for no reason —
so the panel says instead that nothing feeding this is running worse than it is, which
means the trouble is here.

## Consequences

- The reference save yields 211 links from 422 declared connections: 164 belt, 47 pipe.
  Each is written down once — pipes symmetrically, since their two ends are one link.
- Links are indices into `placements`, which keeps them small and makes them meaningless
  outside their own snapshot. That is the right trade for something regenerated on every
  save.
- The weakest link is a heuristic, not a proof. It compares productivity measurements; it
  does not know that a pump at 70% is enough for a generator that only needs half of it.
  It has been right on every case tried on the reference save, and it says nothing when
  it has nothing to say.
- A link is only emitted when direction can be settled or the link is a pipe. A
  connection between two things that both say nothing is dropped rather than guessed at.
- The chain is on the factory map only. It would suit the schematic too, and the two maps
  are meant to agree — worth doing when the interaction there has somewhere to put it.
