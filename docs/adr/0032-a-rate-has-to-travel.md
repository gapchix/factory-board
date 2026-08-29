# 32. A rate has to travel, and start somewhere

**Status:** accepted, 2026-08-29

## Context

Everything the board says is a rate. Thirty Iron Ingot a minute, 300.75 Iron Ore, 5 : 5 : 1
into the Space Elevator. [ADR 31](0031-power-is-an-input-like-ore.md) added the last thing a
rate _costs_ — the fuel behind its megawatts. This is about the two things a rate has to
**do**, and the board had never mentioned either:

- it has to **travel down a belt**, and a belt has a hard limit;
- it has to **start out of the ground**, and a node has a harder one.

The Phase 2 plan the board writes in a single click asks for **176 Iron Ingot a minute over
a Mk.1 belt**, on a base built from 89 Mk.1 belts and 12 Mk.2. It asks for **300.75 Iron
Ore/min** from a mine of two Miner Mk.1s, which cannot give 240 with both nodes pure. Neither
was said anywhere, and one of them cannot be fixed by building more machines at all.

The one figure the board did offer was invented. The Balance panel printed a "Mk.1 miners"
column computed as `rate / 60` — a hardcoded normal-purity Miner Mk.1, which tells a player
with three Mk.3s nothing, and told nobody what was standing in their own save.

## Decision

**The database learns what a rate can travel down and come out of.** `GameDatabase` gains
`carriers` (belts, lifts and pipes) and `extractors` (miners, pumps and wells). Both are
stated in the game files and neither is stated in the units a plan uses:

- `mSpeed` is **twice** the item rate. A Mk.1 belt says 120 and moves 60, all the way up to
  the Mk.6's 2400 for 1,200.
- `mFlowLimit` is m³ a **second**. Five, for a Pipeline Mk.1, is the 300 m³/min the game
  quotes.
- `mItemsPerCycle / mExtractCycleTime` is a rate per second in internal units, so a Water
  Extractor's 2000 is 120 m³ a minute once fluids are normalised like everything else.

**A belt is a ceiling you widen; a node is one you cannot.** The two are drawn apart on the
page and answered differently. Too much for a belt is another belt, or a better one, and
`carriersFor` offers every tier with a count. Too much for a mine is more nodes — somewhere
else on the map, at a purity that is world-generation data
([SPEC](../SPEC.md#what-saves-do-not-contain)) — so `extractionFrom` answers as a **range**,
half to double, and never as the single number that would read as a measurement.

**Purity is a property of the node, and the game says which extractors stand on one.** Water
comes from `FGBuildableWaterPump` and everything else from the resource-extractor classes, so
"the Water Extractor is 120 m³/min wherever it stands" is read rather than special-cased by
name.

**A miner names no resource because it takes whatever it is bolted to.** Read as "anything at
all", the empty list offers a Miner Mk.1 for water; the form has to match too, and only raw
items come out of the ground — an Iron Rod is a solid.

**What a belt actually carries is followed, not guessed.** The first attempt compared a
line's whole output against the belt _nearest_ it and reported two of the reference save's
twelve lines as over capacity. **Neither is.** Four smelters making 30 each on four belts is
not 120 on one. So `forcedFlow` walks the network the save states —
[ADR 18](0018-the-save-says-what-feeds-what.md) — out of each machine, along the belt and
**through mergers**, and **stops at a splitter**, because how much goes each way depends on
what the far ends are taking and answering it would be a model wearing a measurement's
clothes. What survives is a set of segments each carrying a rate that has to cross them
whatever else the network does.

**An extractor is not a source.** What a miner pulls depends on the node under it, so a belt
out of a mine carries an unknown and is left out of the flow rather than credited with a
guess.

**A tier standing in the world is a tier you have.** The same proof
[ADR 30](0030-the-save-says-what-you-can-build.md) takes from a running line: belt unlocks
are not in the recipe book, but a Mk.2 belt somewhere in the save is one you can build. Tiers
nothing is built from are marked rather than hidden.

## Consequences

A new Planner section, **Can it be moved and fed**. On the reference save, against the plan
the board writes itself:

```
TOO MUCH FOR THE BELT IT RUNS ON      14 other lines fit down what already carries them
  Screws        230   /min   on Mk.2 · 120/min    4 × Mk.1 · 2 × Mk.2 · 1 × Mk.3*
  Iron Ingot    176.3 /min   on Mk.1 ·  60/min    3 × Mk.1 · 2 × Mk.2 · 1 × Mk.3*
  Iron Rod       97.5 /min   on Mk.1 ·  60/min    2 × Mk.1 · 1 × Mk.2 · 1 × Mk.3*

MORE THAN THE MINE CAN GIVE           at 100% clock, and the nodes are not in the save
  Iron Ore      300.8 /min   2 standing · 120/min    240 even with every node pure
  Coal          124.5 /min   1 standing ·  60/min    120 even with every node pure
```

Two of those lines are the _whole plan_ being impossible on the mine that exists, which no
amount of machine-building fixes and which the board had been silent about since the day it
learned to write a plan.

The invented node column is gone. Raw inputs now read `2 standing · 120 /min (60–240)` —
what is actually bolted to the ground in that save, with the purity stated as the range it
is.

And a backed-up line can name the belt. _"Output full — 200 Iron Rod waiting. Nothing
downstream is taking them"_ is where [ADR 24](0024-the-buffers-say-why.md) stopped; where a
forced segment is at or over its capacity it now finishes the sentence: _"The Conveyor Belt
Mk.1 out of it carries 60/min and these machines make 120."_ Offered only where the flow is
forced, so it stays two stated numbers rather than a story.

**Nothing on the reference base is over capacity today** — which is the check that the
reading is honest, because the crude version said two lines were. What it finds instead is
the Screw run sitting at **exactly 120 of a Mk.2 belt's 120**, and the Solid Biofuel run at
60 of 60. Both are runs the player already upgraded or filled by hand, and both are one
machine away from spilling.

## Alternatives considered

**Modelling what a splitter does.** Satisfactory splitters round-robin evenly among outputs
that accept, so a full flow solve is possible and would cover the whole network rather than
the third of it that is forced. It is also a model: the moment one branch backs up the
division changes, and the number on the page would stop being a reading. The forced part is
smaller and true.

**Comparing a line's output against the nearest belt.** Tried first, and wrong on the
reference save in both directions — it reported Iron Ingot and Screws as over capacity when
the four smelters have four belts between them. It is in the module's own comment as the
thing not to do again.

**Naming a purity per miner.** A miner's _measured_ uptime is not its rate: a generator or a
miner running at 50% is usually being asked for half, not starved of half. There is no
reading here that is not a guess, and the range is honest.

**Gating the plan on what can be moved.** The same argument as
[ADR 30](0030-the-save-says-what-you-can-build.md): planning ahead of what you have built is
the point of a planner. The board says what the belts and the mine would have to become, and
leaves the plan alone.

**Offering a lift, or a Clean Pipeline, as an option.** Both are in the database because a
run in the world can contain one and must be priced. Neither is a decision — a lift is a belt
that goes up, a Clean Pipeline is a Pipeline without the flow indicator — so `carriersFor`
returns one entry per rate and leaves the twins out.
