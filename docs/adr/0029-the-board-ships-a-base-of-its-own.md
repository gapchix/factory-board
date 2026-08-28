# 29. The board ships a base of its own

**Status:** accepted, 2026-08-29

## Context

[ADR 0003](0003-do-not-commit-game-data.md) says the recipe database is Coffee Stain's
content and is not committed. That is right, and it stays right. What it did not weigh is
what the rule costs everyone who does not already have the game open on the same machine.

Without a Satisfactory install, the first command failed:

```
$ npm run dev
  No game database found.
  It is generated from your own Satisfactory install and is not committed.
  Run this from the repository root:  npm run extract
```

That is `process.exit(1)`. Not a degraded view, not a page saying what to do — nothing. And
even past it, every view needs a _save_ to say anything at all, and a save is something you
can only produce by playing.

So the project had a floor under it that nobody had noticed:

- **Anyone the repository is shared with** sees an error, not an app.
- **CI could not type-check the web app**, and could never build it. `docs/ROADMAP.md`
  carried "a small fixture game database so CI can type-check and build `apps/web`, which
  today it cannot" as an open item for weeks.
- **Nothing could ever be hosted**, because hosting needs something to serve.
- And the README's first instruction was, in effect, _install a game you may not own_.

A tool that only runs for people who already have the thing it inspects is not shareable,
not testable end to end, and not demonstrable.

## Decision

**Ship a base of our own.** Two committed artefacts, both written from scratch:

`packages/game-data/src/demo.ts` is fifteen items and eleven recipes of the early game,
typed out by hand. The rates and footprints match the real game — a demo that lies is worse
than no demo — but nothing is copied from `Docs.json` and it goes nowhere near complete
against a real database's 168 items and 291 recipes. This is the same thing
`packages/planner/src/fixtures.ts` has always done for the tests, larger and exported.

`packages/game-data/src/demo-save.ts` is a base that does not exist. Written to be
**interesting rather than merely valid**: a base where everything runs at 100% demonstrates
nothing, so this one carries every case the board exists to tell apart.

```
Concrete       UNPOWERED        grid 1 is over capacity — 9 MW asked for, 0 MW built
Cable          STARVING         short of Wire — 900 sitting in a container
Rotor          STARVING         short of Screw — 640 sitting in a container
Iron Rod       BACKED UP        800 waiting, 2,400 more in storage
Iron Ingot     NO REASON FOUND  powered, fed, not backed up, yet still slow
Smart Plating  never measured   12 built and boxed, 18 delivered of 50
```

Both sync scripts fall back instead of refusing. Neither artefact is generated at build
time from anything on disk, so the fallback is deterministic and offline.

**And it says so, permanently.** A banner across every page: _"Every number on this page is
from a base that does not exist."_ Numbers about a fictional factory are indistinguishable
from numbers about a real one once they are on screen, and the whole board is numbers. The
header chip reads `Showing · a demo base` rather than a filename, in the accent colour.

This does not amend ADR 3. Nothing of Coffee Stain's is committed or served; the demo is
ours, and `npm run extract` still replaces it with the real thing the moment the game is
present.

## Consequences

**`npm install && npm run dev` now works on any machine.** That is the headline, and it is
what makes the repository shareable at all.

**CI type-checks and builds the web app**, both for the first time. The app's own
`typecheck` script no longer skips itself — there is always a database now — and
`npm run build` is a CI step. A static export that only ever built on the maintainer's own
machine is one nobody else can be sure still works. That closes the roadmap item that had
been open since ADR 3 was written.

**The integration tests still skip in CI**, deliberately. They pin real numbers — 44
machines, 344 MW, 300.75 iron ore/min — against the real extracted database, and the demo
is not it. Pointing them at the demo would turn a check on reality into a check that the
fixture matches itself.

**Hosting is now possible without a data question**, though it remains parked. What would
be served is the demo, which is ours; a visitor drops their own `.sav` on the page to see
their own factory, and their save never leaves the browser.

A demo is also a maintenance burden with teeth: it is a second database that can drift from
the first. It is small on purpose to keep that cheap, and it is typed, so a change to
`GameDatabase` breaks it at compile time rather than at runtime.

## Alternatives considered

**Committing a trimmed extract of the real database.** Smaller to write and no risk of
wrong rates — and it is exactly what ADR 3 forbids. A subset of someone's data is still
their data.

**Generating the demo from the real database at build time.** Would keep the two in step
automatically, and would mean the committed artefact is derived from `Docs.json` after all,
which is the same problem wearing a script.

**Asking the visitor for their own `Docs.json`** — the "BYO game data" idea in the roadmap.
Still worth doing for hosting, and it does not help here: someone without the game has no
`Docs.json` to bring.

**A screenshot in the README.** Answers "what does it look like" and not "does it work",
which is the question a repository has to answer.
