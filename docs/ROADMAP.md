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

Remaining tracks. They are independent; the order is a product call — **this is the next
decision**, now that B3 is done.

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

Still open, and not part of what was asked for:

- **Belts read as confetti.** Each conveyor is its own object, so a single run draws as
  a dozen short strokes with a gap at every join. Joining collinear runs end-to-start
  before drawing would give the base its skeleton back.
- **Hover is the browser's.** Detail comes from a native `<title>`, which takes a second
  to appear and cannot be styled. A real hover card would carry uptime and recipe.
- **A diagonal base still leaves corners empty.** No rectangle frames an L-shape tightly.
  Rotating the drawing onto the base's principal axis is the only real answer and it
  costs the reader a map that no longer points north — worth asking about before building.

### A. History — the factory over time

Autosaves are already a time series, and nothing else in the ecosystem treats them as
one. The dev watcher produces a new snapshot every few minutes; keep them.

- Persist snapshots to IndexedDB, keyed by session and save time
- Uptime, machine count and power over the session
- A burn-down against the current Space Elevator phase
- "What changed since last time" — lines added, lines that stopped
- Likely the point where a charting library starts earning its place
  ([ADR 0006](adr/0006-no-charting-library.md))

### B2. Zones — what is left

- Assign plan targets to a zone, so "build 6 more smelters" says _where_
- Anchor on power and extraction too, so generators and miners get their own zones
- Name and pin zones by hand, overriding the derived name
- Deep-link a focused zone, so a view can be shared or reloaded into

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
