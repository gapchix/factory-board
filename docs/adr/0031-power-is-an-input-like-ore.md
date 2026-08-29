# 31. Power is an input like ore

**Status:** accepted, 2026-08-29

## Context

The board has been able to say a plan draws 344 MW since the first week. Since
[ADR 25](0025-a-grid-is-checked-before-a-buffer.md) it has read every grid out of the save,
and since the Planner grew a power panel it has added the two together and said whether the
lights stay on. When they would not, it printed this:

> Grid 1 would be asked for more than it can supply. **Build generators there** before the
> machines, or the whole circuit stops.

Which generator. How many. Fed with what. The board had no answer to any of it, because
nothing in the database knew a generator from a wall: `buildMachines` keeps a `Build_` class
only if it declares `mPowerConsumption`, and **every generator in the game declares zero**.
Power was a number the factory spent and nothing that anything produced.

That absence hid a second, larger thing. A plan's inputs have always been ore, water and
crude oil — what the machines eat. The machines are not the whole factory. The Phase 2 plan
the board writes in one click calls for 124.5 Coal/min for its foundries, and running its
344 MW off coal generators takes **another 68.8 Coal/min and 206 m³ of water** that appeared
on no page anywhere. Over half again on the largest raw input in the plan, uncounted.

## Decision

**Generators are their own record.** `GameDatabase` gains `generators`: the four buildings
in `FGBuildableGenerator*` that declare an output, each with its power and every fuel it
takes, priced per minute at full output. Deliberately not merged into `machines` — a
machine's `powerMW` is what it _takes_, and a field that means the opposite in the same
place is how a total ends up wrong by twice the difference.

Three numbers come out of the files, and each is stated in units that are not the ones a
board wants:

- **Fuel** is the item's own `mEnergyValue`. A generator turns megajoules into
  megawatt-seconds at par, so 75 MW off 300 MJ Coal is 15 Coal/min. Fluid energy is stated
  **per litre**, so Fuel arrives as `0.75` beside Coal's `300` — normalised at the extractor
  with every other fluid figure, as [ADR 3](0003-do-not-commit-game-data.md) requires.
  Missed, a Fuel-Powered Generator burns twenty thousand m³ a minute.
- **Water** is `mSupplementalToPowerRatio` — litres per second per megawatt. Ten, for a
  Coal-Powered Generator, is 45 m³/min.
- **Waste** is `mByproductAmount`, which is per fuel _item_, not per minute. Priced off the
  fuel rate: 0.2 rods a minute at fifty each is 10 Uranium Waste/min.

That is 17 generator-and-fuel pairs and 26 items carrying an energy value, for 2.5 KB on a
225 KB database.

**Fuel burn is linear in load, so the bill follows the megawatts.** Satisfactory throttles
generators to what their circuit is drawing rather than running some flat out and idling the
rest, and they burn in proportion. This is the rule that makes the question answerable at
all: five coal generators at 20% cost exactly what one at full output costs, so a plan's
draw states its fuel without anyone having to say how the generators are arranged.
`fuelToCarry` prices a load; nothing prices a generator.

**Generators come whole, and the two numbers disagree on purpose.** Covering 80 MW takes two
Coal-Powered Generators, and between them they still only burn the 80 MW asked for. So a
cover carries both: what it _could_ supply, and what it would _burn_ carrying the gap.

**Which generator is a question for the world, not the arithmetic.** `generatorsToCover`
leads with what the grid already burns, then with what the rest of the base burns, exactly
as the panel already charges new machines to the grid their recipe runs on. Only when the
world says nothing does arithmetic order the list, and it orders by how little of what you
build would stand idle — ranking by building count answers a 200 MW hole with a 2,500 MW
reactor.

**And so is which fuel.** The game's own first fuel is right for three generators and wrong
for the one every new save has: a Biomass Burner's list opens with Leaves, so covering
240 MW came out as **876 Leaves a minute** — true, unusable, and from the only generator
available at that tier. The caller supplies the fuel, and the app takes it from what the
base mines, makes or has in a box. Solid Biofuel, on any save that has ever made any.

**Capacity the database cannot price is reported, not spread.**
`Build_GeneratorIntegratedBiomass_C` — the burner inside the HUB — is not in `Docs.json` at
all, and the reference save runs two of them. Their share of the draw is counted and named
rather than divided among the generators that can be priced, so the fuel bill is stated as a
floor: _about 14 MW of what is drawn today comes from generators the database cannot price._

**A generator with nothing in it is left out of both sides.** The save's `capacityMW` is
`mDynamicProductionCapacity` — what a grid can supply _now_ — and an empty generator
contributes nothing to it. Charging for its coal would invoice someone for fuel nobody is
shovelling.

## Consequences

The Planner's power panel says what to build, and what it costs to run. On the demo base:

```
GRID 1 IS 9 MW SHORT   build one of these there · the fuel is what carrying the gap costs
  1 ×  Biomass Burner            30 MW    1.2 /min Solid Biofuel
  1 ×  Coal-Powered Generator    75 MW    1.8 /min Coal · 5.4 m³/min Water
  1 ×  Fuel-Powered Generator   250 MW    0.7 m³/min Fuel

AND FEEDING IT         what the generators burn to hold that draw
  Solid Biofuel            10.4 /min  →   12 /min
```

And on the reference save, where the Phase 2 plan adds 231 MW to a base drawing 188:

```
  Water                    61.1 m³/min → 146 m³/min
  Coal                     20.4 /min   → 48.7 /min
  Solid Biofuel             9.6 /min   →  19 /min
```

Nineteen Solid Biofuel a minute is the sentence that justifies the whole change: nothing on
that base makes any, they are carried to the burners by hand, and no other figure on the
board was ever going to say so.

The Overview's dry-generator note grew its price — _1 generator out of fuel, **75 MW
idle**_ — which is the difference between a burner that wants a walk across the base and the
reason a grid is browning out. It is a Coal-Powered Generator, and it is why the reference
save reports 490 MW on a grid with 525 MW standing on it.

**The demo had to be fixed to be shown.** Its three burners were written burning **coal**,
which no Biomass Burner will take; nothing read a generator's fuel before, so nothing
noticed. Two more of its hand-typed index lists had gone stale the same way — grid 0 listed
the first ten buildings and none of its own burners, and seven of ten belt links pointed at
whatever had drifted into that index, so _iron miner into the first smelter_ had become _the
Smart Plating assembler into it_. Both are worked out from the placements now and pinned by
a test. And it claimed 90 MW off three burners with one of them empty, which is a state the
game cannot be in: it has four burners now, three of them burning.

## Alternatives considered

**Folding fuel into `solve`'s raw inputs.** The solver's contract is targets to lines, and a
plan's draw depends on which generator you choose to answer it with — a choice the solver
has no business making. Fuel is priced beside the plan, in the panel that already knows what
the grids are.

**Solving the fuel as a plan of its own.** Twenty m³/min of Fuel is half an oil refinery,
which draws power, which needs fuel — a fixed point that converges in three passes and
reports a number nobody asked for. The fuel demand is stated; what to do about it is the
next plan, and the board is happy to be asked.

**Sizing the fuel for the generators rather than for the load.** A belt sized for four coal
generators at full output is what a careful player builds. It is also not what the
generators will burn, and the board reports what is, not what is prudent. The capacity
column says how much headroom the cover buys.

**Including the Geothermal Generator.** Its output is the purity of the vent it stands on,
which is world-generation data no save records — the same wall the node budget runs into
([SPEC](../SPEC.md#what-saves-do-not-contain)). It declares no fuel and no output, and it is
left out rather than given an invented one.

**Deriving real capacity by comparing nameplate against the save's figure.** The gap is
fuel, and it would have been a neat reading. On the reference save it is also wrong by
40 MW in the other direction, because two of the fourteen generators are not in the game's
own documentation. Dry generators are named one at a time from what the save says about
each, and unknown capacity is declared rather than inferred.
