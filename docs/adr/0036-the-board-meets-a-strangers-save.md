# 36. The board meets a stranger's save

**Status:** accepted, 2026-09-05

## Context

Until now the board had one reader, one save and one build machine. The reference
session is 408 buildings on Phase 2; the demo is a base that does not exist. A hosted
copy meets late-game bases with trains, nuclear and mods, files of tens of megabytes,
saves from old versions, and readers who have never seen `npm`.

What that reader found on the first day, in the order they would have:

- **A throw was a blank page.** No `error.tsx`, no `global-error.tsx`; React unmounts
  the tree and the board is gone, with nothing to say what happened or where to say it.
- **The failure text said the wrong thing.** "That file couldn't be read" and a line about
  Update 5, with no file name, no size, and no word for the modded case.
- **Drops took one file.** `files?.[0]` in both the header and the drop zone. The three
  rotating autosave slots are the series the History view is about, and without the dev
  server's watcher there was no way to give it one.
- **The copy talked to the maintainer.** The banner told a visitor to run
  `npm run extract`; the History view told them `npm run dev` would fill the charts.
- **The page had no face.** No favicon (the one console error on every route), no
  preview image, no canonical address, no footer saying what this is or where its source
  lives, and a README that called the app "in progress".
- **Nothing proved a browser could open it.** `test:e2e` was a script with no
  configuration and no tests.

## Decision

**Fail somewhere better than nowhere, and say the true thing in the reader's words.**

- **Two error boundaries.** `error.tsx` wraps every view and keeps the header, so the
  reader can still load another save or clear the one that broke it; it shows the
  message, a _Try again_, and a link to a prefilled GitHub issue carrying the message,
  the version, the game build and the browser — never the save, which is personal and is
  asked for only if needed. `global-error.tsx` is the boundary of last resort, in plain
  elements, because it replaces the layout that would have styled it.
- **The snapshot says whether the save is modded**, from the header's `isModdedSave`.
  The session chip carries it, and the coverage notice explains that mod recipes are in
  no `Docs.json` rather than let the count read as a fault.
- **Failures name the file and its size** and then the three reasons a save turns up
  unreadable: too old for the parser, mod content, a half-written autosave slot. The
  parser's own message comes first, because it names the version it choked on. A failed
  drop is shown in the header as well as the drop zone, since the drop zone is not on
  screen once a save is loaded, and can be dismissed.
- **Drops take every file.** A recipe book dropped alongside is read first, saves are
  parsed in series, the newest by the session's own clock becomes the board and the rest
  go into the history. The header's picker accepts `.sav,.json` and several at once.
- **No `npm` anywhere a visitor reads.** The banner says where `Docs/en-US.json` lives
  on Steam, Epic and Linux; the History view says to drop a newer autosave, and mentions
  the watcher only in development.
- **A face.** An SVG favicon and a generated Apple icon from the same shapes, a generated
  preview card, `metadataBase` with a canonical address overridable by
  `NEXT_PUBLIC_SITE_URL`, a `robots.txt`, and a footer with the version, the licence, the
  source and the one promise: _runs entirely in your browser, nothing is uploaded_.
- **A browser test on the export.** Playwright opens the built site, walks the five
  views, drops a hand-written `Docs.json` and sees the chip change and survive a reload,
  drops a JSON that is not a book and a file that is neither, and looks for the map's
  canvas. Data-agnostic on purpose, so it passes against the demo in CI and against the
  maintainer's own data locally. CI runs it after the build it just made.
- **`scripts/check-saves.mjs`** reads every save in a folder and prints a table: time,
  size, objects, lines, phase, multiplier, modded — or the throw. It is how the reader
  meets other players' saves before they do.

## What the first corpus said

Nine local saves across two sessions and three game builds (455399, 463028, 502094),
0.1 to 0.3 MB, all read in under 100 ms. Two public saves from the Update 3 era, 1.9 MB
each, refused by the parser in 0 ms with _"Game Version < U6 is not supported"_ — which
is the sentence the failure copy now leads with. No save larger than a megabyte has been
through the reader yet; the Worker is the mitigation, and the size in the parsing status
is the honesty.

## Consequences

**A blank page is no longer a possible outcome of a bad save.** What is still possible
is a wrong page: a base the reader misclassifies rather than fails on. The corpus script
is for finding those, and it needs saves this project does not have — from other
players, other versions, mods.

**Every failure message is now three sentences.** That is long for a drop zone and right
for a stranger.

**Playwright is a devDependency and a 115 MB browser download**, in CI and on every
machine that runs the suite. The unit tests do not need it and do not run it.

## Alternatives considered

**One boundary at the root.** It would have replaced the header along with the view,
taking the way out with it.

**A modal for failures.** The board has never had one, and the strip under the header
already carries every other thing the page has to say about itself.

**Committing a real save as an e2e fixture.** A save is personal and not ours to publish
even trimmed; the load path is exercised locally through `E2E_SAVE` instead, and the
old-version path through `E2E_OLD_SAVE`.
