# Factory Board

Plan a Satisfactory factory, then check it against your actual save file.

Most Satisfactory tools do the maths — you type in what you _want_, and they tell you how
many machines it takes. None of them look at what you actually built. Factory Board does
both, and puts them side by side: **plan vs. actual**, per production line.

Drop a `.sav` in and it tells you which lines are starving, how far off your plan you are,
and what to build next. Your save is parsed in the browser and never leaves your machine.

**Try it: [factory-board.gapchix.io](https://factory-board.gapchix.io)** — drop your save on
the page. Saves are in `%LOCALAPPDATA%\FactoryGame\Saved\SaveGames`.

> **Status:** usable. Five views, a demo base for anyone without the game, and the top of the
> page says what to fix first. What is next is in [docs/ROADMAP.md](docs/ROADMAP.md).

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
page at any time, including over the demo — or several autosaves at once, and the
History view fills in.

## Bring your own recipe book — no install, no setup

You do not need `npm run extract`, or even this repository, to see your own factory: the
same extraction runs in the browser. Drop your game's `Docs/en-US.json` on the page and
it becomes the recipe book, exact for your game version, and is remembered in that
browser. It lives inside every Satisfactory install:

| Where | Path                                                                |
| ----- | ------------------------------------------------------------------- |
| Steam | `steamapps/common/Satisfactory/CommunityResources/Docs/en-US.json`  |
| Epic  | `Epic Games/Satisfactory/CommunityResources/Docs/en-US.json`        |
| Linux | `~/.steam/steam/steamapps/common/Satisfactory/CommunityResources/…` |

Nothing is uploaded either way. The file is read in a Web Worker in your tab, and the
230 KB result is kept in IndexedDB ([ADR 34](docs/adr/0034-the-recipe-book-can-arrive-at-runtime.md)).

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

|                 |                                                                                                                                                                                                                                                                                                                                                                            |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Overview**    | What the factory is doing now: bottlenecks ranked worst-first, power draw, machine census, progress against the plan                                                                                                                                                                                                                                                       |
| **Base**        | The factory drawn as it stands, every building at the size and angle you built it, coloured by uptime — click one to trace what feeds it. Grouped into zones named for what they make, mine or burn, nameable and linkable                                                                                                                                                 |
| **Planner**     | The plan as a flow diagram, then the board of lines, inputs and surplus. Every alternate recipe priced against the whole plan in machines, power and ore — ranked, and split by what your save has actually unlocked. Power per grid, what to build where one would go over, the fuel a minute it all costs, and whether the belts and the mine can carry what it asks for |
| **History**     | Every autosave kept, so the session draws itself: what changed since the last save, machines, power and uptime over time, and a phase burn-down                                                                                                                                                                                                                            |
| **Progression** | Milestone research by tier and Space Elevator delivery                                                                                                                                                                                                                                                                                                                     |

## Hosting a copy

The app is a static export: `apps/web/out` after a build, served by anything that serves
files. **Build it with the demo**, or the export carries _your_ save and _your_ extracted
database:

```bash
FACTORY_BOARD_DEMO=1 npm run build     # bakes the demo base and the demo recipe book
```

A plain `npm run build` on a machine with the game bakes whatever `npm run dev` would
show you — your session name and play time included. Set `NEXT_PUBLIC_SITE_URL` to the
address the copy will live at, so links and previews point there. Visitors bring their
own save, and it never leaves their browser.

The deployed copy at factory-board.gapchix.io adds two things:

- **A real recipe book**, from `FACTORY_BOARD_BOOK=/path/to/game-database.json`, so a
  visitor only has to drop their save. The file is an extract kept on the server, never
  in this repository ([ADR 38](docs/adr/0038-the-hosted-copy-ships-a-recipe-book.md)).
- **A visit counter**, with `FACTORY_BOARD_UMAMI_ID`: page views, and whether a save was
  dropped, failed to read (with a one-word reason), a recipe book was loaded, the demo was
  opened or the diagnosis was copied. No file names, no session names, nothing from the
  save ([ADR 37](docs/adr/0037-the-hosted-copy-counts-visits.md)).
- **A donate link**, with `FACTORY_BOARD_DONATE_URL`, in the footer. Nothing is behind it.

## Why extract instead of ship the data?

The recipe database is Coffee Stain's content, so it is **not committed to this repo**
(the hosted copy ships one from outside it, see above).
Every install already contains a machine-readable dump of it at
`CommunityResources/Docs/en-US.json`, and the extractor reads that.

This is also just better: the data is exact for _your_ game version, including whatever
the last patch changed, rather than whatever a maintainer last got round to updating.

The demo database is a different thing: sixteen items, fifteen recipes and a burner, **typed out by hand**
in `packages/game-data/src/demo.ts` rather than extracted from anywhere. The rates and
footprints match the real game because a demo that lies is worse than no demo, but nothing
is copied from Coffee Stain's files.

## What's in the box

| Package                                              | What it does                                                                                                                                                                          |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`@factory-board/planner`](packages/planner)         | Expands production targets into machine counts, power and ore rates, prices what generators burn to supply them, and says what belts and miners it would take. Pure, no dependencies. |
| [`@factory-board/game-data`](packages/game-data)     | Reads `Docs.json` from your install into a typed, validated database. Ships the `factory-board-extract` CLI, and a hand-written demo database and base for running without the game.  |
| [`@factory-board/save-reader`](packages/save-reader) | Reduces a `.sav` to the production lines, buildings and progress it contains. Runs in the browser.                                                                                    |
| [`@factory-board/layout`](packages/layout)           | Clusters buildings into zones and lays out the production graph. Pure geometry, no dependencies.                                                                                      |
| [`apps/web`](apps/web)                               | The board itself — Next.js, React, Chakra UI.                                                                                                                                         |

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

MIT. Satisfactory is a trademark of Coffee Stain Studios; this project is unaffiliated.
This repository contains none of the game's content; the hosted copy serves recipe data
extracted from the game's own `Docs.json` ([ADR 38](docs/adr/0038-the-hosted-copy-ships-a-recipe-book.md)).
