# Working on Factory Board

Plan a Satisfactory factory, then check it against a real save file. Client-side only —
no server, no database, no runtime network calls.

## Orientation

|                                           |                                              |
| ----------------------------------------- | -------------------------------------------- |
| What it does and the rules it must follow | [docs/SPEC.md](docs/SPEC.md)                 |
| How the pieces fit together               | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| What is built, what is next               | [docs/ROADMAP.md](docs/ROADMAP.md)           |
| Why a decision was made                   | [docs/adr/](docs/adr)                        |
| Setup and house rules                     | [CONTRIBUTING.md](CONTRIBUTING.md)           |

## Before you change anything

```bash
npm install
npm run extract                     # needs Satisfactory installed
npm run typecheck && npm run lint && npm test
```

`npm run extract` writes `packages/game-data/generated/`, which is **gitignored on
purpose** ([ADR 0003](docs/adr/0003-do-not-commit-game-data.md)). Without it the
integration tests skip and the web app refuses to build with instructions.

## Invariants — each one exists because breaking it produced a wrong answer

- **Raw resources terminate the solve.** The game has non-alternate Converter recipes
  that manufacture ore. Without this rule the solver answers a Tier 2 request with 22
  Converters and 733 SAM/min. [ADR 0004](docs/adr/0004-raw-resources-terminate-the-solve.md)
- **`planner` stays pure.** No I/O, no file formats, no dependencies. What the solver
  needs arrives as an argument.
- **Parse at the boundary.** The generated database, the generated snapshot and what
  `localStorage` holds all go through Zod once, at the edge. Inside, types are trusted.
  A schema missing a field silently drops it — keep the compile-time key-completeness
  assertions in `packages/game-data/src/schema.ts` and `apps/web/src/lib/default-snapshot.ts`.
  Adding a field to a domain type means adding it to the schema in the same commit; the
  assertion will say so.
- **Fluids are m³ everywhere.** Normalised once in the extractor; nothing downstream
  converts.
- **Two build numbers, never compared.** `sourceBuildId` is Steam's;
  `saveBuildVersion` is the game's. Unrelated numbering.
- **A belt's spline runs downstream.** `mSplineData` is stored in build order, input
  connection to output, so point order is the direction items travel — the map's
  direction chevrons depend on it. Checked against miners, the one building that can only
  be a source. Pipes carry no such promise and get no arrows.
- **What feeds what is read, not inferred.** Every connection component names the one it
  is plugged into, from both ends. A belt's `ConveyorAny0` is the end items arrive at and
  `ConveyorAny1` the end they leave by; a splitter's `Connection0..3` say nothing, and the
  belt on the other side always does.
  [ADR 18](docs/adr/0018-the-save-says-what-feeds-what.md)
- **Machines define a zone; miners and burners describe one.** They are clustered in
  separate passes because one kind bridges the other's zones — generators dotted between
  two factory cells welded them into a 109 m blob.
  [ADR 13](docs/adr/0013-zones-are-clustered-in-passes.md)
- **A stored reference to a zone is a point on the ground.** Ids are positional and names
  are derived, so both are re-keyed by the next autosave; a coordinate is not.
  [ADR 14](docs/adr/0014-a-zone-reference-is-a-point.md)
- **Status colour is reserved, and text never wears it.** The warning step is 4.04:1 on
  the light surface — below the 4.5:1 text threshold. The bar carries state; the number
  stays in text ink.
- **Theme colours cannot be read off `:root`.** Chakra publishes root variables for its
  own built-in semantic tokens but inlines custom ones into the generated class, so
  `getComputedStyle(document.documentElement)` returns nothing for them. Anything needing
  a colour as a _number_ — the WebGL map — renders a hidden element per token and asks it
  what colour it ended up. [ADR 17](docs/adr/0017-a-second-map-on-a-canvas.md)
- **`transform` never goes through the Chakra factory.** It is a style prop, so an SVG
  transform list is read as CSS, found invalid, and silently dropped — every mark lands on
  the origin. Put it on a plain `<g>` wrapper. Colour still comes from the factory.
- **Fixtures use real game rates.** A Constructor makes 15 Iron Rod/min in the tests
  because it does in the game, so assertions check the maths against reality.
- **Restore before you persist.** `BoardProvider` reads `localStorage` in an effect and
  writes it back in others, and effects on the same mount run in order while a dispatch does
  not land until the next render — so an unguarded writer saves the _initial_ state over what
  was just read. A plan did not survive a page load for as long as that went unnoticed. The
  guard has to be state, not a ref: a ref set at the end of the restore effect is already
  true when the writers run in that same commit.
  [ADR 27](docs/adr/0027-the-plan-stands-on-the-ground.md)
- **Domain rules get a test.** Changing one means changing the test that pins it, and
  saying why.

## Conventions

TypeScript strict, including `noUncheckedIndexedAccess` and
`exactOptionalPropertyTypes` — an optional prop that may receive `undefined` must say
`?: T | undefined`. Conventional Commits, scoped to the package (`fix(planner): …`).
Decisions worth remembering become a numbered ADR; supersede rather than rewrite.
