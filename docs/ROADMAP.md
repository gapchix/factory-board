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

## Phase 2 — candidate tracks

Three coherent slices. They are independent; the order is a product call.

### A. History — the factory over time

Autosaves are already a time series, and nothing else in the ecosystem treats them as
one. The dev watcher produces a new snapshot every few minutes; keep them.

- Persist snapshots to IndexedDB, keyed by session and save time
- Uptime, machine count and power over the session
- A burn-down against the current Space Elevator phase
- "What changed since last time" — lines added, lines that stopped
- Likely the point where a charting library starts earning its place
  ([ADR 0006](adr/0006-no-charting-library.md))

### B. Zones — the factory in space

Every building in the save carries coordinates. Group production lines by where they
actually are, so the board matches the base rather than a flat list.

- Cluster buildings by position into named zones
- Per-zone power, uptime and output
- Assign plan targets to a zone, so "build 6 more smelters" says _where_
- Groundwork for a lightweight map view

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
