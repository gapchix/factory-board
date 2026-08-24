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
- Project documentation: spec, architecture, roadmap and four ADRs.

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
