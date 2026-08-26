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

- **The base map pans and zooms.** Drag, scroll, arrow keys, or the toolbar. It redraws
  at the current view rather than magnifying, so type stays the size it says, marks drawn
  as one split apart once there is room, and labels dropped for want of space come back
  ([ADR 9](docs/adr/0009-the-map-redraws-at-the-view.md)).
- **Belt direction chevrons.** A conveyor's spline is stored in build order, which runs
  input to output — verified against miners, the one building that can only be a source.
  Pipes get none: fluid direction depends on the pumps.
- **Focus a zone** by clicking it on the map or its card underneath. The two stay in
  step, the rest of the base dims, and the view flies to it.
- `frameContent` and `sampleAlong` in `@factory-board/layout` — choosing what a map should
  frame, and spacing markers along a polyline. 22 more tests.
- `route.arrow` theme token, so chevrons keep contrast against the belt in both themes.
- `npm run typecheck` now covers `apps/web` as well, where the extracted game database is
  present. It skips itself in CI, which has no database, exactly as the integration tests
  do.
- Display names for every placeable building, so maps name "The HUB" and "Miner Mk.1"
  rather than `TradingPost` and `MinerMk1`.
- `groupNearby` in the layout package: reusable single-linkage grouping.

- **A survey grid** under the base map, on round world coordinates, so the ground between
  the cells reads as somewhere rather than as nothing. The scale bar is one grid square.
- **Zones are washed with the tone of the work inside them** — the same one their card
  carries — so the map says which part of the base is struggling before a label is read.
- **Leader lines.** A label with no room beside its mark now moves out a ring or two and
  keeps a line back to what it names, instead of being dropped.

### Changed

- **Reach in `frameContent` is bought with buildings**, not handed out flat: a group pulls
  the frame 55 m per building plus a share-weighted term for the size of the base. One
  water extractor 115 m out was widening the reference save's frame by 28%
  ([ADR 11](docs/adr/0011-reach-is-bought-with-buildings.md)). `FrameOptions.minReachM`
  is replaced by `reachPerBuildingM`.
- **The map canvas takes the shape of the base** on both axes, and its surface is cut to
  it. A base 463 m across and 1011 m deep used 30% of the canvas width in the "Everything"
  view; it is now a portrait panel that fills it
  ([ADR 12](docs/adr/0012-the-canvas-takes-the-shape-of-the-base.md)).
- Zone captions sit in a band cut out of the top of their own zone, and are drawn after
  the belts — a conveyor crossing a cell used to strike its name through.
- Belts and map type are cased in the surface colour, so crossings read as one run over
  another and a label survives whatever it crosses.
- A landmark no longer outranks a starving machine for label space. At a flat bonus a
  lookout tower took the room a cell running at 0% needed.

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
- The map no longer crops buildings that anchor no zone. It framed the zones, and zones
  are anchored on machines with a recipe — so one of four coal generators, six metres
  past the edge of the last one, was counted in the legend and drawn nowhere. The frame
  is now grown from everything the map draws
  ([ADR 10](docs/adr/0010-the-frame-reaches-for-its-content.md)), and what is still out
  of reach gets a labelled pointer at the edge instead of a silent crop.
- Belt direction chevrons no longer all stack on the origin. `transform` is a Chakra
  style prop, so an SVG transform list passed to a chakra element is read as CSS, found
  invalid, and dropped. Positioning moved to a plain `<g>` wrapper.
- Clicking a zone works. The map took pointer capture on `pointerdown`, which retargets
  the `pointerup` and moves the resulting `click` to the common ancestor — so the map
  swallowed every click meant for a zone. Capture is now taken on the first drag
  movement.
- Belts that pass through the view no longer vanish when both their ends leave it. Route
  points were filtered against the frame, which dropped the crossing segment; routes are
  now drawn whole and clipped.
- `humanise` produces "Miner Mk.1" rather than "Miner Mk1". Its regex had been written
  with escape sequences that were interpreted before they reached the file, leaving two
  literal backspace bytes around a pattern that matched "Mkd".
