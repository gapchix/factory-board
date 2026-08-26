# Architecture

## Shape

A client-side SPA over three dependency-light packages. No server, no database, no
network calls at runtime. Two data sources, both resolved **before** the browser is
involved — one at build time, one in the page itself.

```
Satisfactory install                     Your save file
  CommunityResources/Docs/en-US.json       …/SaveGames/<id>/*.sav
        │                                        │
        │  npm run extract                       │  scripts/sync-save.mjs
        │  (once, in Node)                       │  (dev/build, in Node)
        ▼                                        ▼
  @factory-board/game-data              @factory-board/save-reader
  ├─ decode UTF-16LE                    ├─ Parser.ParseSave
  ├─ parse escaped structs              └─ reduce to WorldSnapshot
  ├─ normalise fluids to m³                       │
  └─ validate with Zod                            │
        │                                         │
        ▼                                         ▼
  generated/game-database.json          generated/default-snapshot.json
        │                                         │
        └──────────────┬──────────────────────────┘
                       │  inlined into the bundle
                       ▼
                   apps/web
        ┌──────────────┴───────────────┐
        │                              │
  @factory-board/planner        a dropped-in .sav
  solve(db, targets)            → Web Worker → WorldSnapshot
        │                              │
        └──────────────┬───────────────┘
                       ▼
          Overview · Planner · Progression
```

## Dependency direction

`planner` owns the domain vocabulary and depends on nothing. `game-data` and
`save-reader` both depend on it, and never on each other. The app depends on all three.

That ordering is deliberate: the domain types live at the bottom where they cannot
acquire a dependency on a file format, and either adapter can be replaced without
touching the solver. The solver has no idea a save file exists.

## Why the packages are separate

Each is independently useful, and independently publishable:

- `planner` is the interesting maths, and works with any database you hand it.
- `game-data` is worth publishing on its own — "typed Satisfactory data from your own
  install" is a thing other tools want.
- `save-reader` runs in browser or Node, and is the reusable half of any
  save-inspection tool.
- `layout` is pure geometry and graph work — zone clustering, nearby-item grouping,
  production-flow layering, choosing what a map should frame and spacing markers along a
  polyline — with no idea what a Satisfactory is.

### Two entry points for `game-data`

`game-data` exposes two:

| Entry      | Contains                                | For         |
| ---------- | --------------------------------------- | ----------- |
| `.`        | extractor, install locator, CLI, schema | Node        |
| `./schema` | Zod schema and `parseGameDatabase` only | the browser |

The split is not cosmetic. The install locator imports `node:fs`, and a single entry
point drags that into the client bundle — Turbopack fails the build outright with
_"the chunking context does not support external modules (request: node:fs)"_. The
browser only ever needs to validate a database, never to find one.

## The web app

Static export (`output: 'export'`), so every route is prerendered HTML and there is no
server at runtime.

```
apps/web/src/
├── app/
│   ├── layout.tsx          Providers + Header + page container
│   ├── providers.tsx       Emotion registry → Chakra → theme → BoardProvider
│   ├── page.tsx            Overview
│   ├── base/page.tsx       Base — map and zones
│   ├── plan/page.tsx       Planner
│   └── progress/page.tsx   Progression
├── state/board.tsx         targets, recipe choices, zones, snapshot — Context + useReducer
├── hooks/use-save-loader   file → Worker → snapshot, with a main-thread fallback
├── workers/parse-save      the only place the parser runs in the browser
├── components/
│   ├── primitives.tsx      Label, Panel, table parts, form controls
│   ├── charts.tsx          StatTile, BarRow, MeterRow, ChartFrame
│   ├── base-map.tsx        top-down plan of the base
│   ├── flow-diagram.tsx    the plan as a layered DAG
│   ├── board.tsx           the production-line cards
│   └── panels.tsx          dropzone, target editor, balance, progression
├── lib/
│   ├── zones.ts            the base as named zones: clustering, naming, pinning
│   ├── zone-plan.ts        the plan laid over them: what is still missing, and where
│   ├── zone-storage.ts     names the player gave places, pinned to coordinates
│   └── …                   game database, default snapshot, plan storage, formatting
└── generated/              build artefacts; gitignored
```

**State** is a single `useReducer` behind Context — no state library. The whole store is
what the player has said (`targets`, `recipeChoices`, `zoneAssignments`, `zoneNames`) plus
the loaded `snapshot`; everything else on screen is derived by `solve()` and
`buildZoneBoard()` inside a `useMemo`. See [ADR 0007](adr/0007-no-state-library.md).

**Parsing** happens in a Web Worker so a large save cannot freeze the page, with a
main-thread fallback when a Worker cannot be constructed.

**Hydration.** Chakra's styles are collected through an Emotion cache registry wired to
`useServerInsertedHTML`. Without it the prerendered HTML carries no style rules and
React discards the tree on hydration (error #418).

## Build-time data

Neither data source can be read by the page itself, so both are resolved in Node first
and inlined:

| Script               | Reads                                                            | Writes                                | Runs                                                   |
| -------------------- | ---------------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------ |
| `sync-game-data.mjs` | `packages/game-data/generated/`                                  | `src/generated/game-database.json`    | `predev`, `prebuild`                                   |
| `sync-save.mjs`      | `SATISFACTORY_SAVE` / `SATISFACTORY_SAVES_DIR`, else auto-detect | `src/generated/default-snapshot.json` | `prebuild`, and on every autosave during `npm run dev` |

`npm run dev` goes through `scripts/dev.mjs`, which watches the save _directory_ — the
game writes a new file and swaps it, so a watch bound to the original file is dropped
on the first autosave. Writes are debounced 750 ms, because one autosave lands as
several events. See [ADR 0005](adr/0005-build-time-save-loading.md).

## Type safety at the boundaries

Four things cross a boundary and are therefore parsed, not cast: the generated game
database, the generated default snapshot, the plan in `localStorage`, and the zone names
beside it.

Two compile-time assertions keep the game database's Zod schema and the domain type in
step:

1. Validated output must be assignable to `GameDatabase`.
2. Every key `GameDatabase` declares must also be declared by the schema.

The **snapshot** schema in `lib/default-snapshot.ts` carries the same check, and it was
added the hard way: placements learned what building they were for, that schema did not,
and Zod deleted the new fields on the way in — so the board drew a base with no miners,
no generators and no coal plant, from a file that had all three.

The second assertion matters more than it looks. Zod strips undeclared keys, so a schema
missing an optional field still satisfies (1) — the field simply vanishes during
validation. That is exactly how `powerRangeMW` went missing, turning every variable-power
machine's draw into `undefined`. The key-completeness check catches it at compile time; it
compares _keys_ rather than whole types because the domain uses `readonly` arrays and
Zod infers mutable ones, and a plain `extends` in that direction fails on variance that
has nothing to do with completeness.

## Presentation rules

The chart layer is hand-built rather than pulled from a library
([ADR 0006](adr/0006-no-charting-library.md)). Two rules are load-bearing rather than
stylistic:

- **Status colour is reserved.** Good / warning / critical mean machine state and are
  never reused as series colours.
- **SVG takes theme tokens through the Chakra factory, never raw CSS variables.**
  Chakra emits root CSS variables for its own built-in semantic tokens but inlines
  custom ones into the generated class, so `var(--fb-colors-accent-solid)` resolves to
  nothing. In HTML that is invisible; in SVG it paints black or not at all. Use
  `chakra("rect")` and pass `fill="accent.solid"`.
- **…except `transform`, which must not go through it.** `transform` is a Chakra style
  prop, so an SVG transform list handed to a chakra element is read as CSS, found to be
  invalid, and dropped — silently, with every mark landing on the origin. Positioning
  goes on a plain `<g transform=…>` wrapper, which passes its attributes through
  untouched, with the chakra element inside it carrying the colour.
- **Text never wears the data colour.** Every mark colour clears 3:1 against both
  surfaces, but the warning step is 4.04:1 — under the 4.5:1 threshold for text. The
  bar carries the state; the number stays in text ink.

## Testing strategy

| Layer                          | Tool                              | What it proves                                                    |
| ------------------------------ | --------------------------------- | ----------------------------------------------------------------- |
| Solver, extractor, save reader | Vitest, hand-written fixtures     | The rules hold, including the ones that bit us before             |
| Extracted database             | Vitest, skipped without real data | The extractor produces _correct_ data, not merely well-typed data |
| The app                        | Playwright                        | A real browser can load a real save and render the board          |

Fixtures use genuine Satisfactory rates (a Constructor makes 15 Iron Rod/min), so
assertions check the maths against the game rather than against themselves.

## Performance

A 230 KB save parses in about 200 ms; large ones take a few seconds, which is why it
happens in a Worker. The extracted database is ~120 KB of JSON for the full recipe book
— small enough to inline with no loading state.

## Key decisions

Recorded in full under [adr/](adr).

| Decision                                                                                     | Why                                                                                            |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| [Client-side only](adr/0001-client-side-only.md)                                             | Saves are personal; a server adds risk and cost for no gain                                    |
| [TypeScript 6, not 7](adr/0002-typescript-6-not-7.md)                                        | `typescript-eslint` caps at `<6.1.0`; type-aware linting is worth more than the version number |
| [Don't commit game data](adr/0003-do-not-commit-game-data.md)                                | It is Coffee Stain's content, and extraction gives version-exact data anyway                   |
| [Raw resources terminate the solve](adr/0004-raw-resources-terminate-the-solve.md)           | Otherwise the solver mines SAM to make iron                                                    |
| [Build-time save loading](adr/0005-build-time-save-loading.md)                               | A static page cannot read a path from an env var — the browser has no disk                     |
| [No charting library](adr/0006-no-charting-library.md)                                       | Every figure is a magnitude or a ratio; a library would be weight without benefit              |
| [No state library](adr/0007-no-state-library.md)                                             | A handful of fields of state, everything else derived                                          |
| [Machines anchor zones](adr/0008-machines-anchor-zones.md)                                   | Clustering belts welds the whole base into one blob                                            |
| [The map redraws at the view](adr/0009-the-map-redraws-at-the-view.md)                       | Magnifying enlarges the picture; redrawing reveals what would not fit                          |
| [The frame reaches for its content](adr/0010-the-frame-reaches-for-its-content.md)           | Framing the zones cropped a coal generator six metres past the edge                            |
| [Reach is bought with buildings](adr/0011-reach-is-bought-with-buildings.md)                 | A flat allowance let one water extractor buy 28% of the frame's width                          |
| [The canvas takes the shape of the base](adr/0012-the-canvas-takes-the-shape-of-the-base.md) | A portrait base on a landscape sheet drew as a ribbon using 30% of the width                   |
| [Zones are clustered in passes](adr/0013-zones-are-clustered-in-passes.md)                   | Letting generators anchor zones alongside machines welded two factory cells into one           |
| [A reference to a zone is a point](adr/0014-a-zone-reference-is-a-point.md)                  | Zone ids are positional and names derived; a coordinate survives the next autosave             |
| [Runs are joined, fittings are drawn](adr/0015-runs-are-joined-fittings-are-drawn.md)        | Reaching across the gaps bought one join in a hundred; the thing in the gap says more          |
