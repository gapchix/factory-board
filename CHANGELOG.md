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

- **Power and extraction anchor zones.** A coal plant, a pump house and a mining outpost
  are places you built, and they were being reported as buildings belonging to nothing.
  Clustering runs in passes now, because letting them anchor alongside machines welds two
  factory cells into one blob ([ADR 13](docs/adr/0013-zones-are-clustered-in-passes.md)).
  On the reference save, 4 zones and a stray became 9 zones and none, with the production
  zones unchanged.
- **A save says what a miner pulls and what a generator burns.** `BuildingPlacement`
  carries what the building is for, the resource it handles, and — for the extractors and
  generators no production line covers — its own uptime. Classified from the properties a
  building carries rather than from a list of class names.
- **Zones are named for what they are for**: the product their machines mostly make, the
  resource their extractors pull, or the fuel their generators burn. "Coal Power",
  "Water", "Iron Ore".
- **Zones can be named by hand.** The name is pinned to the ground rather than to a zone
  id, so it survives the next autosave renumbering everything
  ([ADR 14](docs/adr/0014-a-zone-reference-is-a-point.md)).
- **Deep links to a zone.** `/base?zone=coal-power` focuses it on load, focusing one
  writes the link, and renaming that zone moves the link with it.
- **Plan targets are assigned to a zone**, so "build 6 more smelters" says _where_. Zone
  cards show what the plan wants built there against what is already standing, and the
  planner's line cards carry the zone they are destined for. Targets sharing a zone are
  rounded up together, because two lines in one cell share a machine.
- `AnchorPass` in `@factory-board/layout`: cluster in rounds, earlier passes first, a
  later pass's cluster joining an earlier zone it sits wholly inside. `Zone` and
  `ClusterResult` are generic over the placement type, so a caller gets its own richer
  placements back on `anchors`.
- 33 more tests, including the app's zone naming, pinning and plan-by-zone rules —
  `apps/*/src/**/*.test.ts` is part of the suite now.

- **Belts and pipes are drawn as runs, not as buildings.** `joinRuns` in
  `@factory-board/layout` joins what continues, end-to-start and never reversed: 101 belt
  objects become 59 runs on the reference save, 25 pipes become 16, and direction chevrons
  space themselves along a route rather than per segment.
- **The fittings that break a run are drawn** — splitters, mergers, lifts and containers,
  as beads in the belt's own colour, appearing with the zoom. They explain 64 of the 118
  run ends; the machines already drawn explain most of the rest
  ([ADR 15](docs/adr/0015-runs-are-joined-fittings-are-drawn.md)).
- **A hover card on the map**, carrying what a mark is, what it is made in or what it
  handles, its uptime as a bar, and the zone it stands in. It appears where the pointer
  arrived and flips to whichever side of it has room.

- **History — the session over time.** The game keeps three rotating autosave slots, so a
  quarter of an hour later the moment is gone. Every save the board sees is now written
  down as a digest — about a kilobyte against the snapshot's 40 KB — in IndexedDB, keyed
  by the session's own clock ([ADR 16](docs/adr/0016-history-keeps-a-digest.md)). The
  write happens wherever the board is, because the page nobody has open records nothing.
- **"Since the last save"** — lines that stopped, started, grew or came back, ordered by
  what you would want to be told first, with what the session gained in buildings,
  machines, power, deliveries and milestones.
- **Machines, power, uptime and buildings over the session**, as lines with a readout that
  follows the pointer to the nearest save.
- **A Space Elevator burn-down** with a straight-line estimate of what is left, measured
  within the current phase only — the counter resets when a phase is delivered, and
  measuring across that reads as going backwards. It says nothing at all until something
  has been delivered to judge a rate by.
- `TimeChart` in the chart layer, hand-built at about 140 lines.
  [ADR 6 was revisited on the evidence](docs/adr/0006-no-charting-library.md) and still
  says no library.
- `WorldSnapshot.savedAt` — the header's `saveDateTime`, sanity-checked rather than
  trusted: it has been a string, a number and Unreal's own tick count across versions of
  the format, and a misread would file a save under the year 58000.
- 13 more tests, over the digest, the diff and the burn-down.

- **A second map: the factory itself, on a WebGL canvas.** Every building drawn at its
  real size and angle, switched from the Base view, with the schematic left exactly as it
  was — the two answer different questions and neither is a better version of the other
  ([ADR 17](docs/adr/0017-a-second-map-on-a-canvas.md)). Belts carry chevrons travelling
  downstream, machines are coloured by uptime, zones are washed and named, and the zone
  selection, the `?zone=` link and the hover card are shared with the schematic.
- **Building footprints in `@factory-board/game-data`.** `mClearanceData` in the game's
  own `Docs.json` states the ground each building stands on: a Constructor is 8 × 10 m, a
  Coal-Powered Generator 10 × 26 m, a Space Elevator 15 × 43 m. The hard box is taken over
  the soft one, which is the room a player needs to stand and use the machine and would
  draw everything half again as big. 499 of 546 building classes have one.
- **`BuildingPlacement.facing`** — the yaw out of the quaternion each building was placed
  at, in degrees clockwise from north. On the reference save all four iron smelters read
  310°, which is what a row built side by side should look like.
- `pixi.js`, the app's first runtime dependency taken on for drawing, loaded only when the
  factory view is opened.
- 19 more tests, over the clearance boxes, the yaw and the rotated-rectangle maths.

- **Trace the chain.** Click a machine on the factory map and it lights everything that
  feeds it and everything it feeds, fogging the rest of the base. The panel names the
  **weakest link** — the worst-running thing upstream, how many machines back — and takes
  the camera there. It says nothing when nothing upstream is running worse, because then
  the trouble is where you clicked
  ([ADR 18](docs/adr/0018-the-save-says-what-feeds-what.md)).
- **`WorldSnapshot.links`** — what feeds what, from the connections the save records.
  Every connection is declared from both ends (422 of them on the reference save, none
  one-way), and direction comes out of the component names rather than out of geometry.
  Pipes are undirected, because which way fluid moves depends on the pumps.
- **`BuildingPath.building`** — the belt or pipe that drew each route, so a chain can
  light the exact runs it passes through.
- Clicking the ground on the factory map picks out the zone you clicked in; clicking a
  machine traces it. 12 more tests.
- **What a machine is making reads off the factory map.** Machines making the same thing
  within 30 m are one block carrying one caption — `Iron Ingot ×4` — grouped with
  `groupNearby` from `@factory-board/layout`. 7 more tests.
- **Outposts are drawn in a margin beside the base map**, the way an atlas insets an
  island it cannot fit on the plate: each in its own box at its own scale, named for its
  zone and labelled with how far away it is and in which direction —
  `190 m E · 6 bldg`. A group leaves the frame when the factory would keep less than
  three fifths of the map's longest side by including it, and never when it holds a fifth
  or more of the buildings ([ADR 20](docs/adr/0020-outposts-go-in-the-margin.md)).
  On the reference save the frame goes from 417 × 145 m to the factory's own
  151 × 145 m, and the scale from 2.53 to 5.22 units per metre. 10 more tests.

### Changed

- **Map captions appear when there is room rather than at a fixed zoom.** Machine names
  used to be held back until 320% because four smelters in a row drew "Iron Ingot" four
  times on top of itself; named once per block, a caption needs only 22 px of block on
  screen and a space nothing has taken
  ([ADR 19](docs/adr/0019-a-name-per-block-not-per-machine.md)). Zone and block captions
  are placed against one list of what is spoken for, zones first and then blocks
  largest-first. On the reference save the whole iron chain names itself at 304% and the
  five-generator coal plant from 40%.
- Zone captions on the factory map are cased in the surface colour, like the schematic
  map's type, so a belt crossing one no longer strikes it through.
- **One arrow at the edge per outpost, carrying the name of the box it points at.**
  Pointers used to be grouped by where they landed on the edge and to state a distance of
  their own, measured to the furthest building while the margin measured to the centre —
  so the same copper wing was announced as 220 m and 190 m in one picture. Distance is
  now stated once, by the margin.
- **The base map is not rotated onto its principal axis**, and the roadmap item asking for
  it is closed. Measured over every angle: the tightest rotation is 64°, saves 13.6% of
  frame area, moves the ground actually covered from 2.5% to 2.9%, and costs north.

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
- Landmarks on the map carry state in their outline wherever they measure any: a coal
  generator at 67% reads amber, while the HUB and the Space Elevator stay grey.
- Zone uptime folds in extractors and generators, so a zone of fuel-starved burners can
  say so. It is worked out once, beside the zone cards, and handed to the map — the wash
  and the card can no longer disagree about it.
- The stored plan is version 2, carrying each target's zone. A v1 plan loads unchanged and
  is rewritten as v2.
- A lone machine standing inside a zone joins it instead of being counted as a stray. A
  stray is one that is alone _and_ nowhere near anything, which is the thing worth
  reporting.
- Map detail no longer comes from a native `<title>`, which took a second to appear,
  could not be styled and could not carry a bar. Marks keep the same text as an
  `aria-label`, so what a screen reader hears is unchanged.
- **One map, not two.** The SVG schematic and the Schematic/Factory toggle are gone; the
  WebGL factory map is the map of the base
  ([ADR 21](docs/adr/0021-one-map-not-two.md)). Everything built after the two maps
  shipped — tracing the chain, a name per block, true footprints — had landed on the
  factory map only, so the schematic was a view that had stopped receiving work while
  still costing a toggle and a promise to keep both drawings in agreement. About 2,100
  lines removed, including the outpost margin rail.
- A browser that cannot start WebGL now gets no map rather than the schematic, and is
  pointed at the zone cards below, which carry the same figures in text.

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
- The snapshot's Zod schema no longer strips fields it has not been told about. It knew
  nothing of what a placement was for, so the board drew a base with no miners, no
  generators and no coal plant out of a file that had all three — the same class of bug as
  `powerRangeMW`, and it now carries the same compile-time key-completeness check.
- `humanise` produces "Miner Mk.1" rather than "Miner Mk1". Its regex had been written
  with escape sequences that were interpreted before they reached the file, leaving two
  literal backspace bytes around a pattern that matched "Mkd".
- The map opens at the size it fits to. The surface was measured inside the init effect,
  before the browser had laid it out, so the first fit ran against the fallback width and
  the real one arrived too late to move the camera — the Base view opened at 161% of
  itself with the copper wing off the edge, and only Reset ever showed what it meant to
  show.
- `/base?zone=coal-power` flies to the zone rather than only selecting it. The effect that
  moves the camera bailed out while the surface had no measured size, which on arrival it
  never has, and nothing re-ran once it did.
- The zoom readout follows the camera when it flies to a zone. It only ever tracked the
  buttons and the wheel, so focusing a zone left it reading 100% at eight times that.
