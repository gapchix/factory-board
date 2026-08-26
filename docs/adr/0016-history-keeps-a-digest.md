# 16. History keeps a digest of each save, in IndexedDB, keyed by play time

**Status:** accepted · 2026-08-26

## Context

The game writes an autosave every few minutes into three rotating slots, so a
quarter of an hour later the moment is gone. That makes a session a time series
nobody keeps — and the one question the board could not answer was the obvious
one: _is this getting better or worse?_

The board sees every one of those saves already. `npm run dev` watches the save
folder and hands the page a new snapshot on each autosave, whichever view is
open. All that was missing was somewhere to put them.

## Decision

**Keep a digest, not the save.** Each save is reduced to what a series needs —
counts, power, uptime, milestones, phase deliveries and a per-line count and
uptime — and the rest is thrown away.

**Keep it in IndexedDB**, in a store keyed by `[session, playSeconds]`, capped
at 2000 points per session.

**Order by the session's own clock.** `playDurationSeconds` is the x-axis;
`saveDateTime` is kept alongside it, for saying when in wall-clock terms.

**Record wherever the board is.** The write happens in the board's provider, not
on the history page, because the page nobody has open records nothing.

## Why

A snapshot is about 40 KB and nearly all of it is placements and routes — the
answer to _where_, which the map asks of the present. History asks _how is this
going_, and that answer is about a kilobyte: a day of play in the space of one
snapshot. Keeping whole snapshots would have cost 25 MB for a fifty-hour
playthrough to store facts nothing reads.

IndexedDB rather than `localStorage`, because this is the only thing the board
stores that grows without end, and the only thing that cannot be recovered once
it is lost. It is also the only store here that can fail for reasons that are
not the user's doing — a private window, a blocked origin, a full disk — so
every call answers rather than throwing, and the page says plainly when nothing
is being kept.

Play time rather than wall clock as the key, because it is the clock the series
is actually about: a break for lunch is not a gap in the factory's history. It
also dedupes on its own — loading the same save twice writes one point — and
`saveDateTime` has been a string, a number and Unreal's own tick count across
versions of the format, so a series keyed on it would be keyed on a guess.

## Consequences

- History begins the day the board is first opened. Saves made before that are
  not recoverable, and the page says so rather than implying a fuller record.
- A digest cannot answer a question it did not anticipate. Asking "how did the
  base grow across the map" later would need the placements, which are not
  kept — that would be a second, coarser store, not a change to this one.
- Records are parsed on the way out and given defaults for fields they predate,
  so a release that adds a field upgrades old points instead of discarding
  them. Discarding is reserved for a record that is not recognisably one.
- Reloading an older save and playing a different line of history overwrites
  the points at those play seconds. Latest wins, which is the only rule that
  does not require the board to have an opinion about which timeline is real.
- Nothing is sent anywhere, and a session can be thrown away from the page.
