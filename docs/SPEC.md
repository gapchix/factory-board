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

## The three views

| View            | Answers                               | Shows                                                                                                                                            |
| --------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Overview**    | "How is the factory doing right now?" | Bottlenecks ranked worst-first, power draw and machine census by type, progress against the plan, infrastructure counts, Space Elevator delivery |
| **Planner**     | "What am I building towards?"         | Production targets, one card per line with plan vs. built and an alternate-recipe picker, raw inputs and surplus                                 |
| **Progression** | "What have I unlocked?"               | Milestone research by tier, then every milestone with its real cost                                                                              |

Overview is the landing view on purpose: the question people open the tool with is
"what is broken", not "let me start a plan". A save loads automatically where one is
configured, so that question is answered on first paint.

## Opening a save

Three ways in, in order of precedence:

1. Drop a `.sav` on the page, or use the file picker.
2. `SATISFACTORY_SAVE` — one exact file.
3. `SATISFACTORY_SAVES_DIR` — a folder, newest `.sav` wins. With neither set, the
   usual SaveGames location is auto-detected.

(2) and (3) are resolved in Node before the app is built, never in the browser — see
[ADR 0005](adr/0005-build-time-save-loading.md). During `npm run dev` the save folder is
watched, so the dashboard follows autosaves as you play.

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

### Milestones are not schematics

A save's purchased schematics include tutorial steps and customiser unlocks alongside
the numbered milestones. Counting the raw set against a denominator of milestones
reports more researched than exist — it showed "17 of 42" where the per-tier figures
summed to 8. Always count the intersection.

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
