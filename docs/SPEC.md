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

1. **Plan.** You declare production targets ("5 Smart Plating/min"). The planner expands
   them into every machine, at every step, with power draw and raw ore rates.
2. **Load.** You drop in a `.sav`. It is parsed in the browser — nothing is uploaded.
3. **Compare.** Every production line shows planned machines against built machines, plus
   the game's own uptime measurement for that line.
4. **Track.** Milestone research and Space Elevator delivery progress, read from the save.

## Non-goals

- **Not a save editor.** Read-only, always. Nothing this tool does can corrupt a save.
- **Not a map.** SCIM already does that well; resource node positions and purity are not
  in save files anyway (only mutated state is stored).
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

### Byproducts are surplus, not credit

A recipe with two outputs produces both. The planner reports the excess as surplus rather
than subtracting it from what you need, because in the world that surplus backs up a belt
unless you sink it. Crediting it silently would hide a real problem.

### Uptime distinguishes "never measured" from "idle"

A machine built ten seconds ago has no productivity history. That is `null`, not `0%`. A
machine that has been sitting starved for five minutes is `0%`. Conflating them turns every
fresh build into a false alarm.

### Two build numbers, never compared

`GameDatabase.sourceBuildId` is Steam's build id for the install the data came from.
`WorldSnapshot.saveBuildVersion` is the game's internal version stamped in the save header.
They use unrelated numbering. Comparing them produces nonsense.

## Data sources

| Source                                                  | Provides                                           | Notes                                                            |
| ------------------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------- |
| `CommunityResources/Docs/en-US.json`                    | Recipes, items, machines, milestones               | UTF-16LE with BOM. Nested structs are escaped strings, not JSON. |
| `%LOCALAPPDATA%/FactoryGame/Saved/SaveGames/<id>/*.sav` | Built machines, recipes, uptime, milestones, phase | Parsed by [`@etothepii/satisfactory-file-parser`][parser].       |

[parser]: https://www.npmjs.com/package/@etothepii/satisfactory-file-parser

### What saves do _not_ contain

Resource node **type and purity** are world-generation data, not save data — only mutated
state is written. Any feature needing a node map has to source it elsewhere.

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
