# 38. The hosted copy ships a recipe book

**Status:** accepted, 2026-09-27. Supersedes [ADR 3](0003-do-not-commit-game-data.md)
for the hosted build only.

## Context

ADR 3 keeps the extracted game database out of the repository: it is Coffee Stain's
content, and every install already has it. ADR 34 then let a visitor bring their own
`Docs.json` to a hosted copy, so a hosted build could ship only the hand-written demo
book and neither decision had to move.

That leaves a stranger two files to find before the board says anything true about their
base. With the demo book (fifteen recipes) a real save reads as twelve lines the book
does not know, every one of them "No reason found". The recipe book lives inside the game
install under `CommunityResources/Docs/`, which few players have ever opened, while the
save is in `%LOCALAPPDATA%`. The launch is one Reddit post. If the second file is where
visitors give up, that shows up in the week-one numbers, when the post's traffic is
already gone and there is nobody left to measure the fix against.

## Decision

**The hosted build bakes a real extracted recipe book. The repository still never
contains one.**

- `scripts/sync-game-data.mjs` takes `FACTORY_BOARD_BOOK`, a path to an extractor output
  (`packages/game-data/generated/game-database.json` from a machine with the game).
  When set, that book is baked with the source `hosted`, whatever `FACTORY_BOARD_DEMO`
  says. The demo _base_ is still what the hosted copy opens on.
- The file is copied to the server once, outside the repository, and mounted into the
  build. It is never committed, and CI keeps building with the demo book.
- The header names it by the game build it came from (`game build 24656030 · 291`), so a
  reader on a newer patch can see why a new recipe is unknown.
- A `Docs.json` dropped on the page still replaces it for that browser (ADR 34). That is
  the answer to a patch landing between deploys, and to a modded install.

## Why

- **The first minute decides the launch.** One file, the save, is a demand test. Two
  files, one of them buried in an install folder, test whether a stranger will go looking,
  which is a different question.
- **The objection in ADR 3 is about redistribution in an MIT repository, and the
  repository is unchanged.** Serving a derived book from a hosted copy is what every
  community tool does (the planners, SCIM, the wiki), and Coffee Stain publishes the file
  in every install for exactly this use. The extractor, which is ours, is still the
  interesting part.
- **Staleness is visible, not silent.** ADR 3's second reason, that a copy goes stale
  with each patch, holds. Naming the build and keeping the override is how staleness
  gets said out loud rather than shown as wrong ratios.

## Consequences

- Each deploy that matters after a patch needs the book re-extracted and re-copied.
- `BakedSource` gains `hosted`. Code that asks "is this the demo book" still asks for
  `demo` by name, so the hosted book behaves like the maintainer's extract everywhere
  except the header label.
- If the week-one numbers show a stranger will fetch `Docs.json` anyway, this can be
  reversed by unsetting one variable.
