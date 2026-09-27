# 3. The game database is generated, never committed

**Status:** accepted · 2026-08-24. For the hosted build only, superseded by
[ADR 38](0038-the-hosted-copy-ships-a-recipe-book.md): the repository is unchanged.

## Context

The planner needs every recipe in the game. That data sits in each install at
`CommunityResources/Docs/en-US.json` — about 10 MB of UTF-16 JSON, which the extractor
reduces to ~120 KB of typed, pruned data.

We could commit the reduced file and let `git clone && npm run dev` just work.

## Decision

`packages/game-data/generated/` is gitignored. Contributors run `npm run extract` once
against their own install.

## Why

- **It is Coffee Stain's content.** Redistributing a derived copy of their asset database
  in an MIT repo is not ours to do, however common it is among community tools.
- **Extraction is more correct.** The data matches the exact game version installed,
  including whatever the last patch changed. A committed copy is stale the moment a
  patch ships, and stale ratios are worse than no ratios.
- **The extractor is the interesting artefact anyway**, and it is fully ours.

## Consequences

- One extra setup step, which the README covers and the CLI auto-detects.
- CI cannot run the integration tests. They skip cleanly when no database is present, and
  the unit tests cover the parsing logic with hand-written fixtures.
- CI also cannot type-check or build `apps/web`, which imports the generated database.
  The packages are fully checked; the app is checked locally and on every `next build`.
  Closing this would mean committing a small fixture database purely for CI — worth
  doing, and tracked in the roadmap.
- Deployments must run `extract` at build time on a machine with the game, or commit a
  build artefact out-of-band.
