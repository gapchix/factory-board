# Architecture

## Shape

A client-side SPA over three pure packages. No server, no database, no network calls at
runtime.

```
Satisfactory install                    Your save file
  Docs/en-US.json                         polska_autosave_1.sav
        │                                       │
        │ npm run extract (once, at dev time)   │ dropped into the page
        ▼                                       ▼
  @factory-board/game-data            @factory-board/save-reader
  ├─ decode UTF-16LE                  ├─ Parser.ParseSave (in a Worker)
  ├─ parse escaped structs            └─ reduce to WorldSnapshot
  ├─ normalise fluids to m³                     │
  └─ validate with Zod                          │
        │                                       │
        │ GameDatabase                          │ WorldSnapshot
        └───────────────┬───────────────────────┘
                        ▼
             @factory-board/planner
             solve(db, targets) → SolveResult
                        │
                        ▼
                    apps/web
             plan vs. actual, per line
```

## Dependency direction

`planner` owns the domain types and depends on nothing. `game-data` and `save-reader`
both depend on it, and never on each other. The app depends on all three.

That ordering is deliberate: the domain vocabulary lives at the bottom where it cannot
acquire a dependency on a file format, and each adapter can be swapped without touching
the solver.

## Why the packages are separate

Each is independently useful, and independently publishable:

- `planner` is the interesting maths, and works with any database you hand it.
- `game-data` is worth publishing on its own — "typed Satisfactory data from your install"
  is a thing other tools want.
- `save-reader` runs in browser or Node, and is the reusable half of a save-inspection
  tool.

Keeping them apart also keeps them honest. The solver has no idea a save file exists, so
it cannot quietly grow a dependency on one.

## Key decisions

Recorded in full under [adr/](adr). In brief:

| Decision                                                                           | Why                                                                                            |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| [Client-side only](adr/0001-client-side-only.md)                                   | Saves are private; a server would add risk and cost for no gain                                |
| [TypeScript 6, not 7](adr/0002-typescript-6-not-7.md)                              | `typescript-eslint` caps at `<6.1.0`; type-aware linting is worth more than the version number |
| [Don't commit game data](adr/0003-do-not-commit-game-data.md)                      | It is Coffee Stain's content, and extraction gives version-exact data anyway                   |
| [Raw resources terminate the solve](adr/0004-raw-resources-terminate-the-solve.md) | Otherwise the solver mines SAM to make iron                                                    |

## Type safety at the boundaries

The generated database crosses a process boundary — written by a CLI, read back by the web
app's build. Zod validates it on the way in, and two compile-time assertions keep the
schema and the domain type in step:

1. Validated output must be assignable to `GameDatabase`.
2. Every key `GameDatabase` declares must also be declared by the schema.

The second one matters more than it looks. Zod strips undeclared keys, so a schema missing
an optional field still passes (1) — the field just vanishes during validation. That is
exactly how `powerRangeMW` went missing, turning every variable-power machine's draw into
`undefined`. The key-completeness check catches it at compile time.

## Testing strategy

| Layer                          | Tool                              | What it proves                                                    |
| ------------------------------ | --------------------------------- | ----------------------------------------------------------------- |
| Solver, extractor, save reader | Vitest, hand-written fixtures     | The rules hold, including the ones that bit us before             |
| Extracted database             | Vitest, skipped without real data | The extractor produces _correct_ data, not merely well-typed data |
| The app                        | Playwright                        | A real browser can load a real save and render the board          |

Fixtures use genuine Satisfactory rates (a Constructor makes 15 Iron Rod/min), so
assertions check the maths against the game rather than against themselves.

## Performance

Saves run to tens of megabytes. Parsing happens in a Web Worker so the UI never blocks;
a 230 KB save parses in about 200 ms, a large one in a few seconds.

The extracted database is ~120 KB of JSON for the full recipe book, small enough to inline
in the bundle with no loading state.
