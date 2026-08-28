# 28. The Planner plans against the world

**Status:** accepted, 2026-08-29

## Context

[ADR 26](0026-the-plan-writes-itself.md) got a plan written from the save.
[ADR 27](0027-the-plan-stands-on-the-ground.md) drew what was missing on the map. The
Planner itself was still a calculator: it solved the targets and reported the answer, and
what it reported did not know the factory existed.

That produced four separate failures, and the first is the one that matters.

**It contradicted the rest of the board.** The line card said `Iron Rod · plan 7 · built 4 ·
+3 more`. The Overview said `Iron Rod · BACKED UP · output full, 399 waiting, 5,178 more in
storage`. Both numbers were right, both were on screen, and the instruction was wrong:
three more constructors on a line that cannot shift what it already makes just makes the
pile bigger.

**It ignored the warehouse.** The plan asked for 300.8 iron ore/min while the base held
5,178 iron rods, 2,029 wire and 1,000 screws in containers.

**Its headline drawing said nothing about reality.** The flow was 150 px of eight-pixel
type where every step looked identical — no sense of what was built, what was running, or
where the constraint was, and the rates hidden behind a hover.

**It never asked whether the lights would stay on.** It knew the plan draws 344 MW. The
Overview knew the base draws 188 MW of the 550 MW standing. Nobody added them up.

And "21 still to build" was a number, not a plan.

## Decision

**Everything the Planner says is checked against the save.**

**A card that disagrees with the world says so.** When the plan calls for more of a line the
diagnosis has found backed up or unpowered, the card carries the reason instead of a bare
`+3 more`: _"Not the constraint — more machines here would make the pile bigger."_ The
solver works from rates and cannot know this; the board can, and was contradicting itself
in two panels of the same page.

**Stock is credited as _time_.** A plan is a rate and a stock is a quantity, so they cannot
be subtracted — but dividing one by the other is the honest comparison. 2,705 Cable against
a plan eating 20/min is 2h 15m the plan does not have to make.

**The flow is drawn against the world.** Every step says how much of itself is standing —
`4 / 6 Smelter · 2 to build` — carries its real uptime as a bar, and is **dashed** when
nothing has been built for it, the same language the map uses. Rates are written on the
edges, cased so a label crossing three belts survives. Clicking a step lights its chain and
fogs the rest: the same gesture, and the same answer, as clicking a machine on the map.

**Power is answered per grid.** Only the machines still to build are charged, because the
rest already draw and are already counted. New machines go on the grid their recipe already
runs on, and on the largest grid where nothing runs it yet. Per grid because that is where a
fuse blows: a base can sit at 70% overall with one circuit over its own limit.

**And the machines have an order.** A step can be built now when everything its recipe eats
is either raw or already coming off a machine that exists — the test is about the _world_,
not the plan. Everything else says what it waits for. Within "now", whatever unblocks the
most goes first.

## Consequences

On the reference save the Planner now opens with what the elevator wants, and then:

```
POWER WHEN THIS IS BUILT
  drawn now 188 MW · this plan adds +231 MW (24 machines) · then 419 MW of 550 MW built
  grid 0  397 / 490 MW   +231 MW        grid 1  16 / 30 MW        grid 4  5 / 30 MW

WHAT TO BUILD FIRST — 9 of 14 can be built today
  1  Steel Ingot   3× Foundry    unblocks Automated Wiring, Stator, Steel Beam,
                                 Steel Pipe, Versatile Framework
  …
 10  Steel Pipe    1× Constructor  waiting on Steel Ingot
```

Three pure modules, tested without a browser: `power-plan` (6 tests), `build-order`
(7 tests), and the shortage's stock cross-reference in `diagnose` (3 more).

Two numbers stopped disagreeing. `Still to build` was the plan's total machines minus every
machine standing in the world, which credits the ones the plan never asked for — a Solid
Biofuel and a Concrete constructor made the reference save read 21 when it was 24, and
disagreed with the power panel directly below it. It is counted per line now.

The ordering is deliberately not a schedule. There is no estimate of how long a machine
takes to place, no critical path, and no claim to be optimal — only the difference between
a machine that will run when you build it and one that will stand idle. That is the
question a player has, and it is one the save can answer exactly.

## Alternatives considered

**Solving against stock directly** — subtracting what you hold from what the plan needs, so
the plan shrinks. It reads well and is wrong: a plan is a steady state and a stock is a
one-off, so a plan sized to your warehouse stops producing the moment the warehouse empties.
Time-to-cover says the same thing without lying about it.

**Scheduling the build order** — estimating how long each step takes and laying it on a
timeline. The estimate would be invented; the game gives no such number, and how fast
someone places nine foundries is not a property of the save.

**Charging the whole plan's power to the base.** Double-counts every machine already
standing, which on the reference save is most of them.
