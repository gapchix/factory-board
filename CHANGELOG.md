# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `@factory-board/planner` — production solver with machine counts, power, raw inputs,
  production balance and structured warnings.
- `@factory-board/game-data` — `Docs.json` extractor, Zod-validated database and the
  `factory-board-extract` CLI with Steam and Epic auto-detection.
- `@factory-board/save-reader` — save-file reducer producing a `WorldSnapshot` with
  per-line uptime, clock, building census, milestones and Space Elevator progress.
- Integration test pinning Space Elevator Phase 2 to 44 machines and 344 MW against a real
  extracted database.
- Project documentation: spec, architecture, roadmap and seven ADRs.

- Web app: Overview, Planner and Progression views with hand-built bar and meter
  charts, validated for contrast in both themes.
- Default save auto-loading via `SATISFACTORY_SAVE` / `SATISFACTORY_SAVES_DIR`, plus a
  dev-time watcher that re-reads the save on every autosave.

- `@factory-board/layout` — zone clustering over building coordinates, and layered
  layout for the production graph. Pure, dependency-free, 26 tests.
- Building placements in `WorldSnapshot`, positioned in metres.
- **Base view** — a top-down map of the base with machines coloured by uptime, and
  per-zone machines, power, uptime and output.
- **Flow diagram** on the Planner: the plan drawn as a layered DAG with throughput-
  weighted edges.

- Belt, pipe and power-line routes in `WorldSnapshot`, transformed from the splines and
  wire endpoints in the save into world-space polylines.
- Display names for every placeable building, so maps name "The HUB" and "Miner Mk.1"
  rather than `TradingPost` and `MinerMk1`.
- `groupNearby` in the layout package: reusable single-linkage grouping.

### Fixed

- Solver no longer manufactures raw ore through late-game Converter recipes. It answered a
  Tier 2 request with 22 Converters and 733 SAM/min before this.
  ([ADR 0004](docs/adr/0004-raw-resources-terminate-the-solve.md))
- Extractor no longer drops variable-power machines. The Converter, Particle Accelerator
  and Quantum Encoder leave `mPowerConsumption` at zero and declare an estimated range
  instead, so every recipe they make was being discarded.
- Extractor no longer drops ammo recipes. Those item descriptors live under native classes
  that do not contain the word "Descriptor".
- Zod schema no longer silently strips `powerRangeMW`. Added a compile-time
  key-completeness check in both directions so a schema can't omit a domain field again.
- Building ids in `WorldSnapshot` now match machine ids in `GameDatabase`; the `Build_`
  prefix was only being stripped on one of the two paths.
- The base map is drawn from belt and power routes rather than a dot per building. The
  first version was an unreadable star field: no structure, no names, four identical
  "Iron Ingot" labels. Machines running the same recipe now merge into one mark with a
  count, labels try four positions and are dropped rather than stacked, and buildings
  the game ships without a display name fall back to a humanised class name.
- Progression no longer reports more milestones researched than exist. It counted every
  purchased schematic — tutorials and customiser unlocks included — against a
  denominator of numbered milestones only.
- Uptime values are no longer printed in their status colour. Contrast for the warning
  step falls below the 4.5:1 text threshold in light mode; the bar carries the state
  and the number stays in text ink.
