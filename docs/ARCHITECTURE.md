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
- `layout` is pure geometry and graph work — zone clustering and production-flow
  layering — with no idea what a Satisfactory is.

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
├── state/board.tsx         targets, recipe choices, snapshot — Context + useReducer
├── hooks/use-save-loader   file → Worker → snapshot, with a main-thread fallback
├── workers/parse-save      the only place the parser runs in the browser
├── components/
│   ├── primitives.tsx      Label, Panel, table parts, form controls
│   ├── charts.tsx          StatTile, BarRow, MeterRow, ChartFrame
│   ├── base-map.tsx        top-down plan of the base
│   ├── flow-diagram.tsx    the plan as a layered DAG
│   ├── board.tsx           the production-line cards
│   └── panels.tsx          dropzone, target editor, balance, progression
├── lib/                    game database, default snapshot, plan storage, formatting
└── generated/              build artefacts; gitignored
```

**State** is a single `useReducer` behind Context — no state library. The whole store is
three fields (`targets`, `recipeChoices`, `snapshot`); everything else on screen is
derived by `solve()` inside a `useMemo`. See [ADR 0007](adr/0007-no-state-library.md).

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

Three things cross a boundary and are therefore parsed, not cast: the generated game
database, the generated default snapshot, and the plan in `localStorage`.

Two compile-time assertions keep the game database's Zod schema and the domain type in
step:

1. Validated output must be assignable to `GameDatabase`.
2. Every key `GameDatabase` declares must also be declared by the schema.

The second matters more than it looks. Zod strips undeclared keys, so a schema missing
an optional field still satisfies (1) — the field simply vanishes during validation.
That is exactly how `powerRangeMW` went missing, turning every variable-power machine's
draw into `undefined`. The key-completeness check catches it at compile time; it
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

| Decision                                                                           | Why                                                                                            |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| [Client-side only](adr/0001-client-side-only.md)                                   | Saves are personal; a server adds risk and cost for no gain                                    |
| [TypeScript 6, not 7](adr/0002-typescript-6-not-7.md)                              | `typescript-eslint` caps at `<6.1.0`; type-aware linting is worth more than the version number |
| [Don't commit game data](adr/0003-do-not-commit-game-data.md)                      | It is Coffee Stain's content, and extraction gives version-exact data anyway                   |
| [Raw resources terminate the solve](adr/0004-raw-resources-terminate-the-solve.md) | Otherwise the solver mines SAM to make iron                                                    |
| [Build-time save loading](adr/0005-build-time-save-loading.md)                     | A static page cannot read a path from an env var — the browser has no disk                     |
| [No charting library](adr/0006-no-charting-library.md)                             | Every figure is a magnitude or a ratio; a library would be weight without benefit              |
| [No state library](adr/0007-no-state-library.md)                                   | Three fields of state, everything else derived                                                 |
| [Machines anchor zones](adr/0008-machines-anchor-zones.md)                         | Clustering belts welds the whole base into one blob                                            |
