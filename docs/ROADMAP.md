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

Remaining tracks. They are independent; the order is a product call.

### B3. The map — a visual pass · next up

The mechanics are right and the map is not yet handsome. Called out on 2026-08-25: it
reads well, it needs to _look_ well. No brief beyond that yet, so treat the list below as
what an eye found rather than as a specification — confirm before building.

- **Labels crowd at the default zoom.** Machine names run into zone captions, and the
  four-position search gives up rather than trying harder. Leader lines, or a caption
  placed inside its zone, would both buy room.
- **Whitespace.** Two thirds of the default frame is empty on a real base, because the
  frame is a rectangle and a factory is not. Worth testing a tighter margin, or letting
  the canvas take the content's aspect within bounds.
- **"Everything" letterboxes badly.** A base 450 m wide and 1000 m deep hits the 860-unit
  canvas ceiling, and the result is a thin ribbon of factory in a wide white field.
- **Belts read as confetti.** Each conveyor is its own object, so a single run draws as
  a dozen short strokes with a gap at every join. Joining collinear runs end-to-start
  before drawing would give the base its skeleton back.
- **Hover is the browser's.** Detail comes from a native `<title>`, which takes a second
  to appear and cannot be styled. A real hover card would carry uptime and recipe.
- **The controls are plain.** Toolbar, legend and hint are three separate rows of small
  type under a large drawing.

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
