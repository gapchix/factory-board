# 37. The hosted copy counts visits

**Status:** accepted, 2026-09-27

## Context

The hosted copy goes up to answer one question: do Satisfactory players who are not the
maintainer drop their saves on it? The plan is one post in r/SatisfactoryGame, then a
decision a week later to keep building or to park it. That decision needs numbers, and
the board had none. It makes no network calls at all ([ADR 1](0001-client-side-only.md)),
which is also the privacy promise the post will lead with: the save never leaves the
browser.

A web server's access log counts page loads. It cannot count what happens after the
page has loaded, which is the part that matters: a save dropped, a save that failed to
read, a recipe book loaded, a diagnosis copied out.

## Decision

**The hosted build loads a self-hosted Umami counter and sends it five fixed events.
Nothing else leaves the page.**

- **The counter is only on the hosted build.** `components/analytics.tsx` renders the
  script only when `FACTORY_BOARD_UMAMI_ID` is set at build time. `npm run dev` and a
  local export never load it, and `data-domains` makes the script ignore every host but
  the hosted one, so a copy of the export served elsewhere counts nothing.
- **What it may send is fixed at compile time.** `lib/track.ts` is the only caller, with
  a union of event names (`save_dropped`, `save_failed`, `book_loaded`, `demo_opened`,
  `shared`), and `save_failed` carries one of four coarse reasons (`size`, `version`,
  `timeout`, `parse`). There is no parameter a file name, a session name or anything
  read from a save could travel through.
- **It fails silent.** An ad blocker removes the script, and gamers run ad blockers. A
  `track()` runs inside every drop handler, so a counter that could throw is a drop that
  could fail, and one nobody would see on their own machine. The wrapper checks for the
  script, catches everything, and an e2e test plants a counter that throws and blocks
  its host, then loads a file.
- **A person is counted once.** `save_dropped` fires once per browser session
  (`sessionStorage`), so five autosaves dropped by one player are one player trying the
  board. The launch is judged on a ratio, tries over desktop visitors, and both sides
  are undercounted alike by blockers.
- **Failures are counted too.** A save from a newer game build that the parser refuses
  looks exactly like no interest unless it is counted. A wave of `version` failures
  after a patch is a reader to update, not a reason to park.

## Why

- **Umami is already running** for gapchix.io (stats.gapchix.io). It sets no cookies,
  stores no personal data, and is ours, so the counts go nowhere else.
- **One wrapper is the whole surface.** Scattering `umami.track` calls would make "what
  does this page send" a grep across the codebase. Here it is one file with a type.

## Consequences

- AGENTS.md's "no runtime network calls" gains an exception with this ADR's number, and
  the SPEC's non-goals say the hosted copy counts visits. The README and the footer say
  exactly what is counted.
- The hosted vhost's Content-Security-Policy allows `stats.gapchix.io` for scripts and
  connections and nothing else, so the privacy claim can be checked in DevTools rather
  than taken on trust.
- If the launch parks the project, the ID is unset at the next build and the counter
  goes with it.
