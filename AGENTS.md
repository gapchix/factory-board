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
- **Parse at the boundary.** The generated database, the generated snapshot and the
  plan in `localStorage` all go through Zod once, at the edge. Inside, types are
  trusted. A schema missing a field silently drops it — keep both compile-time
  assertions in `packages/game-data/src/schema.ts`.
- **Fluids are m³ everywhere.** Normalised once in the extractor; nothing downstream
  converts.
- **Two build numbers, never compared.** `sourceBuildId` is Steam's;
  `saveBuildVersion` is the game's. Unrelated numbering.
- **Status colour is reserved, and text never wears it.** The warning step is 4.04:1 on
  the light surface — below the 4.5:1 text threshold. The bar carries state; the number
  stays in text ink.
- **Fixtures use real game rates.** A Constructor makes 15 Iron Rod/min in the tests
  because it does in the game, so assertions check the maths against reality.
- **Domain rules get a test.** Changing one means changing the test that pins it, and
  saying why.

## Conventions

TypeScript strict, including `noUncheckedIndexedAccess` and
`exactOptionalPropertyTypes` — an optional prop that may receive `undefined` must say
`?: T | undefined`. Conventional Commits, scoped to the package (`fix(planner): …`).
Decisions worth remembering become a numbered ADR; supersede rather than rewrite.
