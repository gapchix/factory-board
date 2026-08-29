# Factory Board

Plan a Satisfactory factory, then check it against your actual save file.

Most Satisfactory tools do the maths — you type in what you _want_, and they tell you how
many machines it takes. None of them look at what you actually built. Factory Board does
both, and puts them side by side: **plan vs. actual**, per production line.

Drop a `.sav` in and it tells you which lines are starving, how far off your plan you are,
and what to build next. Your save is parsed in the browser and never leaves your machine.

> **Status:** early. The planner, extractor and save reader are done and tested; the web
> app is in progress. See [docs/ROADMAP.md](docs/ROADMAP.md).

## Quick start

```bash
npm install
npm run dev
```

That works with **no game and no save**: without a Satisfactory install the board runs on
a small hand-written demo — a base that does not exist, with a starving line, a backed-up
one and a dead power grid, so every view has something to show. It says so in a banner
across the top, permanently, because numbers about a fictional factory look exactly like
numbers about a real one.

There is a **Demo** button in the header too, so you can look at it with the game installed —
it swaps the base in the page, and your own save is one click back.

To see your own factory instead:

```bash
npm run extract      # reads game data from your own Satisfactory install
npm run dev
```

`npm run extract` finds Satisfactory automatically on Steam and Epic. If it can't:

```bash
SATISFACTORY_DIR="D:/Games/Satisfactory" npm run extract
```

The app then opens your most recent save on its own. You can also drop a `.sav` on the
page at any time, including over the demo.

## Open your save automatically

By default the app opens the most recent save it can find, and `npm run dev` watches
that folder — every autosave re-reads the file and hot-reloads the dashboard, so it
tracks your factory while you play.

To pin a specific one, copy `apps/web/.env.example` to `apps/web/.env.local`:

```bash
SATISFACTORY_SAVE=C:/Users/you/AppData/Local/FactoryGame/Saved/SaveGames/7656.../polska.sav
# …or a folder, where the newest .sav wins:
SATISFACTORY_SAVES_DIR=C:/Users/you/AppData/Local/FactoryGame/Saved/SaveGames/7656...
```

The save is read in Node, before Next runs, and only the resulting snapshot is put in
the bundle. The page itself never touches your disk — it cannot, and shouldn't.

## The views

|                 |                                                                                                                                                                                                                            |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Overview**    | What the factory is doing now: bottlenecks ranked worst-first, power draw, machine census, progress against the plan                                                                                                       |
| **Base**        | The factory drawn as it stands, every building at the size and angle you built it, coloured by uptime — click one to trace what feeds it. Grouped into zones named for what they make, mine or burn, nameable and linkable |
| **Planner**     | The plan as a flow diagram, then the board of lines, inputs and surplus. Every alternate recipe priced against the whole plan in machines, power and ore — ranked, and split by what your save has actually unlocked       |
| **History**     | Every autosave kept, so the session draws itself: what changed since the last save, machines, power and uptime over time, and a phase burn-down                                                                            |
| **Progression** | Milestone research by tier and Space Elevator delivery                                                                                                                                                                     |

## Why extract instead of ship the data?

The recipe database is Coffee Stain's content, so it is **not committed to this repo**.
Every install already contains a machine-readable dump of it at
`CommunityResources/Docs/en-US.json`, and the extractor reads that.

This is also just better: the data is exact for _your_ game version, including whatever
the last patch changed, rather than whatever a maintainer last got round to updating.

The demo database is a different thing: fifteen items and fifteen recipes, **typed out by hand**
in `packages/game-data/src/demo.ts` rather than extracted from anywhere. The rates and
footprints match the real game because a demo that lies is worse than no demo, but nothing
is copied from Coffee Stain's files.

## What's in the box

| Package                                              | What it does                                                                                                                                                                         |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`@factory-board/planner`](packages/planner)         | Expands production targets into machine counts, power and ore rates. Pure, no dependencies.                                                                                          |
| [`@factory-board/game-data`](packages/game-data)     | Reads `Docs.json` from your install into a typed, validated database. Ships the `factory-board-extract` CLI, and a hand-written demo database and base for running without the game. |
| [`@factory-board/save-reader`](packages/save-reader) | Reduces a `.sav` to the production lines, buildings and progress it contains. Runs in the browser.                                                                                   |
| [`@factory-board/layout`](packages/layout)           | Clusters buildings into zones and lays out the production graph. Pure geometry, no dependencies.                                                                                     |
| [`apps/web`](apps/web)                               | The board itself — Next.js, React, Chakra UI.                                                                                                                                        |

The three packages are independent of the app on purpose: each is useful on its own, and
each is separately publishable.

## Documentation

- [docs/SPEC.md](docs/SPEC.md) — what the product does, and the rules it follows
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — how the pieces fit together
- [docs/ROADMAP.md](docs/ROADMAP.md) — what's built, what's next
- [docs/adr/](docs/adr) — decisions worth remembering, and why
- [CONTRIBUTING.md](CONTRIBUTING.md) — how to work on this

## Commands

| Command             |                                                      |
| ------------------- | ---------------------------------------------------- |
| `npm run dev`       | Start the web app                                    |
| `npm run extract`   | Regenerate the game database from your install       |
| `npm run demo`      | Run against the built-in demo, whatever is installed |
| `npm test`          | Unit tests (Vitest)                                  |
| `npm run test:e2e`  | Browser tests (Playwright)                           |
| `npm run typecheck` | `tsc --build` across every package                   |
| `npm run lint`      | ESLint                                               |
| `npm run format`    | Prettier                                             |

## Licence

MIT. Satisfactory is a trademark of Coffee Stain Studios; this project is unaffiliated,
and ships none of the game's content.
