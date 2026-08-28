# 24. Uptime says how much; the buffers say why

**Status:** accepted, 2026-08-28

## Context

[SPEC.md](../SPEC.md) opens by saying what this project is for:

> None of them open your save and tell you that your Rotor assembler ran at 60% because
> screws are starving it.

The board reported the 60%. It did not say _because screws_. What it said instead was a
legend under the bottleneck chart:

```
95% and above
60–95%, starving
below 60%
```

That middle line is a guess dressed as a reading. Uptime is one number and it has at least
two causes that want opposite fixes — a machine with nothing to work on, and a machine
with nowhere to put what it made — so a label picked from the number alone is right about
half the time by construction.

On the reference save it was wrong about the two largest lines in the base:

| line       | uptime | old label | input buffer          | output buffer      |
| ---------- | ------ | --------- | --------------------- | ------------------ |
| Iron Rod   | 67%    | starving  | 100 Iron Ingot        | **399 Iron Rod**   |
| Iron Ingot | 83%    | starving  | 400 Iron Ore          | **100 Iron Ingot** |
| Cable      | 50%    | below 60% | **2 Wire**            | empty              |
| Rotor      | 60%    | starving  | 200 rod, **25 screw** | empty              |

The iron rod constructors were not starving. Their inputs were full, their outputs were
full, and 5,178 more rods were already sitting in containers. The label's advice — build
more smelters — is the exact opposite of the fix, and following it makes the backlog
worse.

The save has known all along. Every machine carries an input inventory and an output
inventory, and the reader already walked `mInventoryStacks` — to learn _what_ ore a miner
stands on and _what_ a generator burns, throwing the counts away.

## Decision

**Keep the counts, and let them answer the question.**

`save-reader` now carries, per placement, what is waiting in the input buffer and what has
piled up in the output buffer, plus a generator's remaining fuel; and per snapshot, the
total sitting in every container. An **empty buffer is a value, not an absence** — "this
machine has nothing to work on" is the whole point of reading them.

`apps/web/src/lib/diagnose.ts` turns that into a verdict, in **runs rather than items**. A
recipe wanting 25 screws and one wanting 2 wire are not comparable in items and are
exactly comparable in runs, and it is what names the culprit: of everything a recipe needs,
the ingredient with the fewest runs buffered is the one holding it up. That is how a Rotor
assembler sitting on 200 iron rods is correctly reported as short of _screws_.

The order matters. **Output is checked before input**, because a machine that cannot put
anything down stops drawing what it is fed, so its input buffer fills and would otherwise
read as perfectly healthy.

Two constants, both meaning "more than one cycle":

- **backed up** at two runs' worth of product waiting. One is what a healthy machine holds
  between belt arrivals; two means a whole run went by uncollected.
- **starving** at two runs' worth of an ingredient left. The mirror, and the reason it is a
  small number: a line that is keeping up sits on a _deep_ buffer, because the belt
  delivers faster than it consumes. On the reference save the healthy lines hold 20 to 100
  runs' worth and the starving ones hold one or less.

**And it does not guess.** A line that is fed, not backed up and still slow gets
`unexplained` — "fed, not backed up, still slow; check power" — rather than a story. The
likeliest remaining cause is a power circuit that cannot meet its demand, and that is not
read yet. Inventing a reason there would be the same mistake this ADR exists to undo.

## Consequences

Every measured line on the reference save is now named correctly, and two of the seven
slow ones flipped:

```
  0%  Solid Biofuel   STARVING   Short of Biomass — 6 left, 8 per run.
  0%  Smart Plating   STARVING   No Rotor arriving.
 50%  Cable           STARVING   Short of Wire — 2 left, 2 per run.
 60%  Rotor           STARVING   Short of Screws — 25 left, 25 per run.
 67%  Concrete        STARVING   Short of Limestone — 2 left, 3 per run.
 67%  Iron Rod        BACKED UP  Output full — 399 waiting, 5,178 more in storage.
 83%  Iron Ingot      BACKED UP  Output full — 100 waiting.
```

The same sentence appears on the map's hover card, so "why is this one amber" is answered
where the machine is rather than only in a list.

Two more things fell out of the same data, because the board had every number and had
never put them side by side:

- **34 Smart Plating built and sitting in a container, 0 delivered** to a Space Elevator
  that wants 500. That reads as "nothing made yet" until the stock is shown next to it.
- **One coal generator out of fuel**, while its four neighbours hold 155 to 263. The map
  already coloured the plant amber; this says which one.

The snapshot grew from 57 KB to 58 KB, which is 23 machines' buffers and one stock table.

Verdicts are per _line_, not per machine, because that is how the game measures: the save
records the productivity of a recipe, not of a box. Four rod constructors where two are
backed up and two are keeping pace is one line that cannot shift its rods, and summing
their buffers is the honest reading of it.

The legend lost its middle claim and now says only what the colours are. What the colours
_mean_ is written next to each line, in text — the status colour stays reserved, and text
never wears it.

## Alternatives considered

**Comparing rates instead of buffers.** Work out what each line should produce and compare
with what feeds it. That is the planner's job, needs a plan, and would be wrong in a
different way: it says what _should_ be true, where a buffer says what _is_.

**Stack fullness as a percentage.** More precise than runs, and it needs a stack size per
item, which is in `Docs.json` but not in the extracted database. Runs need nothing new,
compare across recipes, and are the unit the answer is spoken in anyway — "25 left, 25 per
run" says it without a percentage.

**Reading power circuits now.** The save has three `FGPowerCircuit` objects with
membership, and `mTargetConsumption` and `mDynamicProductionCapacity` per component, so a
circuit's demand and capacity can both be totalled. No machine carries an `mHasPower`
flag, so this has to be derived, which is a pass of its own. `unexplained` is the seam it
will fill.
