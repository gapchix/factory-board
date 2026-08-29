# Factory Board — Specification

## The problem

Satisfactory players have good calculators. [Satisfactory Tools][st] does
linear-programming-optimal ratios, [SCIM][scim] renders a save on an interactive map,
[Satisfactory Factories][sf] draws factory dependency graphs.

All of them take **manual input**. You type in the factory you wish you had. None of them
open your save and tell you that your Rotor assembler ran at 60% for the last five minutes
because screws are starving it.

That gap — between the plan and the world — is what this project fills.

[st]: https://www.satisfactorytools.com/
[scim]: https://satisfactory-calculator.com/en/interactive-map
[sf]: https://satisfactory-factories.app/

## What it does

0. **Run.** With no Satisfactory install and no save, the board opens on a demo base of its
   own — a factory that does not exist, carrying every fault the board can diagnose, so the
   whole thing can be used and judged before anyone installs anything
   ([ADR 29](adr/0029-the-board-ships-a-base-of-its-own.md)). It says so on every page.
1. **Plan.** You declare production targets ("5 Smart Plating/min"). The planner expands
   them into every machine, at every step, with power draw and raw ore rates.
2. **Load.** You drop in a `.sav`. It is parsed in the browser — nothing is uploaded.
3. **Compare.** Every production line shows planned machines against built machines, plus
   the game's own uptime measurement for that line — and _why_ it is what it is, read
   from each machine's own input and output buffers
   ([ADR 24](adr/0024-the-buffers-say-why.md)).
4. **Track.** Milestone research and Space Elevator delivery progress, read from the save.

## The views

| View            | Answers                                        | Shows                                                                                                                                                                                                                          |
| --------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Overview**    | "How is the factory doing right now?"          | Bottlenecks ranked worst-first, each naming what starved it or what it is backed up with, power draw and machine census by type, progress against the plan, infrastructure counts, Space Elevator delivery                     |
| **Base**        | "Where is everything, and where is it broken?" | The factory itself, every building at its real size and angle. Machines coloured by uptime, grouped into zones named after what they make, extract or burn — nameable, linkable, and showing what the plan wants built in each |
| **Planner**     | "What am I building towards?"                  | The plan drawn as a flow — ore on the left, targets on the right, edge weight showing throughput — then one card per line with plan vs. built, and raw inputs and surplus                                                      |
| **History**     | "Is this getting better or worse?"             | Every autosave kept as a digest: what changed since the last save, machines, power, uptime and buildings over the session, and a burn-down against the current Space Elevator phase                                            |
| **Progression** | "What have I unlocked?"                        | Milestone research by tier, then every milestone with its real cost                                                                                                                                                            |

Overview is the landing view on purpose: the question people open the tool with is
"what is broken", not "let me start a plan". A save loads automatically where one is
configured, so that question is answered on first paint.

## Opening a save

Four ways in, in order of precedence — and the last is the reason the board always has
something to show:

1. Drop a `.sav` on the page, or use the file picker.
2. `SATISFACTORY_SAVE` — one exact file.
3. `SATISFACTORY_SAVES_DIR` — a folder, newest `.sav` wins. With neither set, the
   usual SaveGames location is auto-detected.
4. Nothing found at all — the built-in demo base, clearly marked as one.

(2) and (3) are resolved in Node before the app is built, never in the browser — see
[ADR 0005](adr/0005-build-time-save-loading.md). During `npm run dev` the save folder is
watched, so the dashboard follows autosaves as you play.

## Non-goals

- **Not a save editor.** Read-only, always. Nothing this tool does can corrupt a save.
- **Not a resource map.** Node positions and purity are world-generation data and are not
  in a save file at all; SCIM has them and this cannot. What _is_ drawn is the base you
  built, from the save's own placements — which turned out to be most of what the board is
  ([ADR 21](adr/0021-one-map-not-two.md)).
- **Not a server.** No accounts, no upload, no database. See [ADR 0001](adr/0001-client-side-only.md).
- **Not an optimiser.** It solves the plan you specify; it does not search for a better one.

## Domain rules

These are the rules that make the numbers right. Each is enforced by a test.

### Raw resources terminate the solve

Ore, water and crude oil are mined, never manufactured. The game ships late-game Converter
recipes that turn SAM into iron ore, and **they are not flagged as alternates** — so a
naive "first non-alternate recipe" rule discovers them and solves a starter factory by
mining SAM. See [ADR 0004](adr/0004-raw-resources-terminate-the-solve.md).

### Fluids are cubic metres, everywhere

The game files store fluid amounts in litres (crude oil `Amount=3000` means 3 m³). The
extractor divides by 1000 once, at the boundary. Nothing downstream carries a unit flag or
remembers to convert.

### Machine counts round up; power follows what you build

`2.5` assemblers is the honest ratio, and the plan shows it. But you place 3, and 3 is what
draws power. Totals use the rounded figure; the exact figure stays visible so you can see
the headroom.

### Power is an input, and its bill follows the load

Generators throttle to what their circuit is drawing and burn fuel in proportion, so the
running cost of a factory's power is a function of the megawatts drawn and not of how many
generators stand behind them. Five coal generators at 20% cost exactly what one at full
output costs. A plan's fuel is therefore priced from its draw, alongside the ore its
machines eat and never inside it — the plan does not choose which generator answers it.
[ADR 31](adr/0031-power-is-an-input-like-ore.md)

Fluid energy is stated **per litre** where fluid amounts are stated per litre, and is
normalised the same way: Fuel is 750 MJ/m³, not 0.75.

### Byproducts are surplus, not credit

A recipe with two outputs produces both. The planner reports the excess as surplus rather
than subtracting it from what you need, because in the world that surplus backs up a belt
unless you sink it. Crediting it silently would hide a real problem.

### Uptime distinguishes "never measured" from "idle"

A machine built ten seconds ago has no productivity history. That is `null`, not `0%`. A
machine that has been sitting starved for five minutes is `0%`. Conflating them turns every
fresh build into a false alarm.

### Milestones are not schematics

A save's purchased schematics include tutorial steps and customiser unlocks alongside
the numbered milestones. Counting the raw set against a denominator of milestones
reports more researched than exist — it showed "17 of 42" where the per-tier figures
summed to 8. Always count the intersection.

### A belt's spline runs downstream

A conveyor's `mSplineData` is stored in build order, which runs from the belt's input
connection to its output. Point order is therefore the direction the items travel, and
the map draws direction chevrons on the strength of it.

The check that settled it uses the one building in the game that can only be a source: on
the reference save, every belt touching a miner **starts** at that miner and none ends
there — five for five, no counterexamples. `analyze.test.ts` pins the half that is ours,
that the parser hands the spline back in the order it read it.

Pipes carry no such promise. Which way fluid moves depends on the pumps at either end, so
they get no arrows.

### The factory is a graph, and the save draws it

Every connection component names the one it is plugged into, from both ends. Direction
comes out of the names — a belt's `ConveyorAny0` is the end items arrive at, `ConveyorAny1`
the end they leave by, and a machine names its `Input` and `Output` ports — so what feeds
what is read rather than inferred from which belt ends near which machine. Splitters and
mergers name their ports `Connection0..3` and say nothing; the belt on the other side of
the link always does ([ADR 18](adr/0018-the-save-says-what-feeds-what.md)).

Pipes carry no direction, for the same reason they carry no arrows: which way fluid moves
depends on the pumps at either end.

Belts, splitters and mergers are walked _through_ when tracing a chain, never counted: a
hop is a machine. And the weakest link upstream is only named when it is running worse
than the machine asked about — a supply at 98% explains nothing.

### Machines define a zone; miners and burners describe one

A zone is the buildings within 32 m of one another, clustered in two rounds: machines
with a recipe first, then extractors and generators. Clustering them together lets one
kind bridge two zones of the other — a line of burners between two factory cells welds
them into one, exactly as a belt run does
([ADR 8](adr/0008-machines-anchor-zones.md), [ADR 13](adr/0013-zones-are-clustered-in-passes.md)).

A zone is named after what it is for: the product its machines mostly make, the resource
its extractors pull, or the fuel its generators burn. Anything the player names by hand
overrides that, and every stored reference to a zone — a name, a plan target's
assignment — is a point on the ground rather than an id, because ids are positional and
the next autosave renumbers them ([ADR 14](adr/0014-a-zone-reference-is-a-point.md)).

### Presentation: status colour is reserved, and text never wears it

Good / warning / critical mean machine state; they are never reused to tell series
apart. And a value is never printed in its status colour: every mark colour clears 3:1
against both surfaces, but the warning step is 4.04:1 — below the 4.5:1 threshold for
text. The coloured bar carries the state, the number stays in text ink.

### Two build numbers, never compared

`GameDatabase.sourceBuildId` is Steam's build id for the install the data came from.
`WorldSnapshot.saveBuildVersion` is the game's internal version stamped in the save header.
They use unrelated numbering. Comparing them produces nonsense.

## Data sources

| Source                                                  | Provides                                           | Notes                                                            |
| ------------------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------- |
| `CommunityResources/Docs/en-US.json`                    | Recipes, items, machines, generators, milestones   | UTF-16LE with BOM. Nested structs are escaped strings, not JSON. |
| `%LOCALAPPDATA%/FactoryGame/Saved/SaveGames/<id>/*.sav` | Built machines, recipes, uptime, milestones, phase | Parsed by [`@etothepii/satisfactory-file-parser`][parser].       |

[parser]: https://www.npmjs.com/package/@etothepii/satisfactory-file-parser

### What saves do _not_ contain

Resource node **type and purity** are world-generation data, not save data — only mutated
state is written. Any feature needing a node map has to source it elsewhere. The Geothermal
Generator's output is the same fact seen from the other side — it depends on the vent it
stands on — which is why it is the one generator the database leaves out.

What a **placed extractor** is producing is a different question, and the save does answer
it: the miner's output buffer is locked to the ore it stands on, and reports it even when
a belt has drained the last stack. Generators name their fuel outright. Neither says
anything about the node underneath, or about the ones nobody has built on.

## Verification

The numbers are checked against a known-good factory. Space Elevator Phase 2, built at
5 : 5 : 1 per minute, must solve to exactly:

|            |             |
| ---------- | ----------- |
| Machines   | 44          |
| Power      | 344 MW      |
| Iron Ore   | 300.75 /min |
| Coal       | 124.5 /min  |
| Copper Ore | 24 /min     |

This runs as an integration test against a real extracted database, and skips where none
has been extracted (CI included). It is the only test that can catch "the extractor
compiles but produces subtly wrong data".
