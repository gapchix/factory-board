# Roadmap

## Done

**Foundations** — npm workspaces monorepo, TypeScript strict (`noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`, `verbatimModuleSyntax`), Vitest, ESLint, Prettier, CI.

**`@factory-board/planner`** — recursive solver with machine counts, power, raw inputs,
production balance and structured warnings. Zero dependencies. 18 unit tests.

**`@factory-board/game-data`** — reads `Docs.json` (UTF-16LE, escaped structs), normalises
fluids, prunes unreferenced items, validates with Zod, ships an auto-detecting CLI.
Produces 291 recipes / 168 items / 11 machines / 42 milestones from a real install.

**`@factory-board/save-reader`** — reduces a `.sav` to production lines with uptime and
clock, building census, milestones and Space Elevator progress. Browser-safe.

**Verification** — an integration test proves Space Elevator Phase 2 solves to exactly
44 machines, 344 MW and 300.75 iron ore/min against a real extracted database.

## Next — v0.1, the board

- [ ] Next.js app shell, Chakra UI v3 theme, light/dark
- [ ] Target editor with presets for each Space Elevator phase
- [ ] The board: one cell per line, grouped by machine, plan vs. actual, uptime bars
- [ ] Save loading via drag-and-drop, parsed in a Web Worker
- [ ] Inputs & surplus tables, milestone tracker, phase progress
- [ ] Plans persisted to `localStorage`, validated with Zod on read
- [ ] Playwright E2E covering load → solve → compare

## After that

- **Alternate recipe picker.** The data is already there; it needs UI and a way to see what
  a swap costs in machines and power.
- **Factory zones.** Group lines into named cells matching how the base is actually laid
  out, using building coordinates from the save.
- **History.** Autosaves are a time series. Machines built per session, uptime over time,
  a burn-down against the current phase.
- **Node budget.** How many miners at what purity a plan needs. Blocked on node data,
  which is not in save files — see [SPEC.md](SPEC.md).
- **Publish the packages.** All three are designed to stand alone.

## Not planned

Save editing, an interactive map, accounts, or a hosted backend. See
[SPEC.md](SPEC.md#non-goals).
