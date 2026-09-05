# 34. The recipe book can arrive at runtime

**Status:** accepted, 2026-09-05

## Context

Every number the board shows is a save read against a recipe database, and the
database has always been a build artefact: extracted from the maintainer's own install
by `npm run extract`, copied into the bundle by `sync-game-data.mjs`, imported as a
module constant by seven files. [ADR 3](0003-do-not-commit-game-data.md) keeps that
extract out of the repository because it is Coffee Stain's content, and
[ADR 29](0029-the-board-ships-a-base-of-its-own.md) put a hand-written demo in its place
wherever the game is absent — which is where CI builds, and where a hosted copy would be
built.

So a hosted build carries the demo book: fifteen recipes. Opened against it, a real save
reads as a base where nothing can be explained — every line _No reason found_, every
label a class name — because `diagnose` answers `unexplained` for a recipe it has never
heard of and `itemName` falls back to the id. It looks like the board is broken. The
board is holding the wrong book.

Three ways out were on the table:

- **Bake the maintainer's extract into the hosted bundle.** Fastest, and exactly what
  ADR 3 declines to do, now on a public page instead of in a public repository. Also
  stale on every game patch, with no way for a visitor to fix it.
- **Serve the demo and let a real save read badly.** Not viable for the stated goal,
  which is other players working with their own base.
- **Ask the visitor for their own `Docs.json`.** Named in ADR 29 as the answer for
  hosting, and deferred there because it does not help someone without the game.

## Decision

**The recipe book is state, not a constant.** A `GameDataProvider` holds the database
the page runs on. It opens on whatever the build baked in and swaps to a `Docs.json`
dropped on the page — the same file the CLI reads, off the same disk the save comes
from, so the marginal cost to the visitor is one more file from a folder they already
know.

What that took:

- **`@factory-board/game-data` runs in a browser.** The extractor never touched Node;
  the decoder did (`Buffer`), and the package's main entry drags in the install locator
  (`node:fs`). `decodeDocs` now reads the encoding off the first bytes and uses
  `TextDecoder`, and a third entry, `./browser`, exposes the extraction half alone —
  the same split, for the same reason, as `./schema`.
- **The extraction runs in a Worker**, like save parsing: ten megabytes of UTF-16 and a
  walk over every class is a second or two, and a page frozen for it reads as broken.
- **The result is remembered in IndexedDB**, in its own database. The history's is the
  one store that cannot be recovered if it is lost, and it is not version-bumped for the
  sake of something that can be dropped on the page again. The record is parsed on the
  way out with the same Zod schema as the baked book; one an older extractor wrote is
  removed and the visitor asked for the file again.
- **The sync script writes an envelope, `{ source, database }`.** The page has to say
  which book it is holding and the database cannot: the demo says `sourceBuildId: 0`,
  and so does a real extract from an Epic install, or from a browser, where there is no
  Steam manifest to read. Nothing may read `0` as "the demo" any more.
- **The board says when the book is wrong for the save.** `unknownLines` counts the
  lines a save runs that the book does not know, and the banner leads with it: _"This
  save runs 12 lines the demo recipe book does not know — drop your game's
  Docs/en-US.json."_ Once the visitor's own book is in, the count is zero, which is also
  how they know the two match. On a modded save it never is, and the banner says why.

A `Recipes` chip in the header names the book — `demo · 15`, `your install · 291`,
`en-US.json · 291` — with _Load yours_ or _Forget_ beside it.

## Consequences

**A hosted copy needs no data decision.** It serves the demo, which is ours; the visitor
brings their own book, which is theirs, and it never leaves their browser. ADR 1 and
ADR 3 both stand unamended. ADR 1's "the game database has to be small enough to
bundle" is no longer the whole constraint: it has to be small enough to _keep_, and at
230 KB it is.

**The book is exact for the visitor's game version**, which is better than any baked
copy could be — and every consumer of the database is a hook now, which is what makes
that true: a memo that read the book without listing it kept solving against the old
one after a new one was dropped in, silently, until something else changed.
`eslint-plugin-react-hooks` is on for that reason, with the two classic rules; its
compiler-era rules argue with "restore before you persist" and are not.

**Local development lost nothing.** `npm run extract` still bakes the real book where
the game is installed, and the page opens on it. Dropping a book works there too.

**A second Worker, a second IndexedDB database, a fourth chip.** The header is busier.
The chip earns its place: it is the only thing on the page that says which recipe book
a number came from.

## Alternatives considered

**Reading `Docs.json` on the main thread.** Simpler, and a two-second freeze on first
use — which is exactly the moment a visitor decides whether the thing works.

**Keeping the book in `localStorage`.** 230 KB is within most quotas and outside some,
and a quota failure there is a thrown exception in the middle of a drop. IndexedDB
answers rather than throws, and the history store already knew how.

**Fetching the book from the hosted copy's own server.** That is baking it with extra
steps, and a network call at runtime — the one thing the architecture has never had.
