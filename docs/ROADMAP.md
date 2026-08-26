# Roadmap

## Shipped — phase 1

**Foundations.** npm workspaces monorepo, TypeScript strict
(`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`),
Vitest, ESLint flat config, Prettier, GitHub Actions.

**`@factory-board/planner`.** Recursive solver producing machine counts, power, raw
inputs, production balance and structured warnings. Zero dependencies.

**`@factory-board/game-data`.** Reads `Docs.json` (UTF-16LE, escaped structs),
normalises fluids to m³, prunes unreferenced items, validates with Zod, ships an
auto-detecting CLI. Yields 291 recipes / 168 items / 11 machines / 42 milestones from a
real install.

**`@factory-board/save-reader`.** Reduces a `.sav` to production lines with uptime and
clock, a building census, milestones and Space Elevator progress. Browser-safe.

**The app.** Next.js 16 static export, React 19, Chakra UI v3, light and dark. Three
views — Overview, Planner, Progression. Saves load by drag-and-drop, file picker, or
automatically from `SATISFACTORY_SAVE` / `SATISFACTORY_SAVES_DIR`, parsed in a Web
Worker. `npm run dev` watches the save folder so the dashboard follows autosaves. Plans
persist to `localStorage` and are re-validated with Zod on read.

**Verification.** 53 unit tests, plus an integration test pinning Space Elevator
Phase 2 to exactly 44 machines, 344 MW and 300.75 iron ore/min against a real extracted
database.

## Phase 2

### B. Zones — the factory in space · shipped

**`@factory-board/layout`** — a fourth package, pure geometry and graph work with no
dependencies. Single-linkage zone clustering over building coordinates, and Sugiyama-style
layering for the production graph. 26 tests.

**Base view** — a top-down map drawn from the save, machines coloured by the uptime of
the line they run, zones named after what they mostly make, with per-zone machines,
power, uptime and output.

**The plan as a schematic** — the Planner now leads with the production flow as a layered
DAG rather than a list: raw ore on the left, targets on the right, edge weight showing
throughput.

**The map became a map** — it pans and zooms, and redraws at the view rather than
magnifying, so zooming in splits merged marks apart and brings back labels there was no
room for ([ADR 9](adr/0009-the-map-redraws-at-the-view.md)). Belts carry direction
chevrons. Clicking a zone — on the map or on its card below — focuses it, and the two stay
in step. The frame is decided from everything the map draws rather than from the zones
alone, and whatever is still too far out gets a pointer at the edge saying what it is and
how far ([ADR 10](adr/0010-the-frame-reaches-for-its-content.md)).

Remaining tracks. They are independent; the order is a product call. B3 and B2 are done,
which leaves **A** and **C** — the next decision.

### B3. The map — a visual pass · shipped

Confirmed on 2026-08-26 against the list below: the whitespace, the label collisions and
the flatness were the three that landed. The chrome was not — the toolbar and legend are
fine as they are.

**Whitespace.** Reach in `frameContent` is now bought with buildings rather than handed
out flat, so a lone outlier can no longer widen the frame around a factory
([ADR 11](adr/0011-reach-is-bought-with-buildings.md)) — on the save it was written
against that was 28% of the width for one water extractor. The canvas takes the content's
shape on both axes and the surface is cut to it, which is what ended the letterbox: the
"Everything" view went from using 30% of the canvas width to effectively all of it, as a
portrait panel ([ADR 12](adr/0012-the-canvas-takes-the-shape-of-the-base.md)). Frame
margin and canvas padding both came down.

**Labels.** Three rings of candidate positions instead of one, with diagonals past the
first, and a leader line joining any label that had to move out to the mark it names.
Zone captions moved inside their own zone, into a band cut out of the top of the box so
no machine is ever drawn under its own zone's name, and they are drawn after the belts
rather than before — a conveyor crossing a cell used to strike its name through. A
landmark no longer outranks a starving machine when the two want the same space.

**Flatness.** A survey grid on round world coordinates, so the ground between the cells
reads as somewhere rather than as nothing — the buildings touch under 3% of the frame,
so that space is most of the drawing. Zones are washed with the tone of the work going on
inside them, the same one their card carries below. Belts are cased so crossings read as
one run passing over another. Type carries a casing too, so it survives whatever it
crosses. The scale bar is one square of the grid.

Two of the three left open were closed on 2026-08-26; see B4 below. Still open:

- **A diagonal base still leaves corners empty.** No rectangle frames an L-shape tightly.
  Rotating the drawing onto the base's principal axis is the only real answer and it
  costs the reader a map that no longer points north — worth asking about before building.

### B4. The map — the wiring · shipped

**Belts read as runs.** `joinRuns` joins what actually continues, end-to-start and never
reversed: 101 belt objects become 59 runs and 25 pipes become 16, and direction chevrons
space themselves along a route instead of per segment.

**What is standing in the gap is drawn** rather than reached across. Every belt end on the
reference save was measured: 44 meet another and are joined, 20 have a splitter or merger
in the gap, 21 have a machine, 3 a container. Joining _through_ a fitting was built and
measured before being thrown away — it bought one join in a hundred, because a splitter
has two belts leaving it and the link is genuinely ambiguous
([ADR 15](adr/0015-runs-are-joined-fittings-are-drawn.md)). So the fittings are drawn as
beads on the line, arriving with the zoom, and they explain 64 of the 118 run ends.

**A real hover card**, in place of the native `<title>` that took a second to appear and
could not be styled: what the mark is, what it is made in or what it handles, its uptime
as a bar, and the zone it stands in. It is placed where the pointer arrived and flips to
whichever side has room.

Still not built, and now the honest next step for the wiring: **machines are drawn at a
fixed size in pixels**, so the further you zoom in, the further a machine's mark sits from
the belt that feeds it. Drawing buildings at their true footprint needs a size per
building class out of `Docs.json` and the rotation of each placement out of the save.

### B2. Zones — the rest · shipped

**Power and extraction anchor zones.** A coal plant, a pump house and a mining outpost
are places you built, and the map used to report them as buildings belonging to nothing.
They are clustered in a pass of their own, because letting them anchor alongside machines
welds two factory cells into one blob — the same failure belts caused, arriving through a
second door ([ADR 13](adr/0013-zones-are-clustered-in-passes.md)). On the reference save
that took the base from 4 zones and a stray to 9 zones and none, with all four production
zones untouched.

The save says more about those buildings than the snapshot was keeping: a miner's output
buffer names the ore it stands on even when a belt has drained it, a generator names its
fuel, and both measure their own productivity. So zones are named for what they are for —
"Coal Power", "Water", "Iron Ore" — and five coal generators averaging 79% is a fuel
problem the map now shows in the colour of the mark.

**Zones are nameable, and every reference to one is a point on the ground**
([ADR 14](adr/0014-a-zone-reference-is-a-point.md)). Zone ids are positional and derived
names move with what is built, so a hand-given name and a plan target's assignment are
both pinned to a coordinate and resolved against whatever stands there now. A name
survives the autosave watcher swapping the save out from under the page.

**Deep links.** `/base?zone=coal-power` focuses that zone on load; focusing one writes the
link. Renaming the zone you are looking at moves the link with it.

**Plan targets are assigned to a zone**, so "build 6 more smelters" says where. Each zone
card shows what the plan wants built there against what is already standing — the two
numbers being in different places was the reason it was hard to act on — and the planner's
line cards carry the zone they are destined for. Targets sharing a zone are rounded up
together, because two lines in one cell share a machine and two lines 900 m apart cannot.

### A. History — the factory over time

Autosaves are already a time series, and nothing else in the ecosystem treats them as
one. The dev watcher produces a new snapshot every few minutes; keep them.

- Persist snapshots to IndexedDB, keyed by session and save time
- Uptime, machine count and power over the session
- A burn-down against the current Space Elevator phase
- "What changed since last time" — lines added, lines that stopped
- Likely the point where a charting library starts earning its place
  ([ADR 0006](adr/0006-no-charting-library.md))

### C. Publish — the packages stand alone

All three are designed to be useful outside this app.

- Publish `planner`, `game-data`, `save-reader` to npm
- README and API docs per package, provenance in the release workflow
- A worked example: solve a factory from Node in ten lines

### Housekeeping, folded into whichever track goes first

- Playwright E2E covering load → solve → compare
- Favicon and app icons
- Alternate-recipe picker: show what a swap costs in machines and power
- Export/import a plan as JSON
- A small fixture game database so CI can type-check and build `apps/web`, which today
  it cannot ([ADR 0003](adr/0003-do-not-commit-game-data.md))

## Later

- **Node budget.** How many miners at what purity a plan needs. Blocked: node type and
  purity are world-generation data and are not in save files — see
  [SPEC.md](SPEC.md#what-saves-do-not-contain).
- **Power modelling.** Generators, fuel burn and headroom, not just draw.
- **Multi-save comparison.** Two sessions side by side.

## Not planned

Save editing, an interactive map replacing SCIM, accounts, or a hosted backend. See
[SPEC.md](SPEC.md#non-goals).
