# 14. A reference to a zone is a point on the ground

**Status:** accepted · 2026-08-26

## Context

Three things now need to refer to a zone and still mean it later: a name the player gave
it, a plan target assigned to it, and a link to it.

Neither obvious key survives. Zone ids are positional — they are handed out in size
order, so building two machines can renumber the base. Names are derived from what is
built there, so a cell renamed by its own growth takes its name with it. And the dev
watcher re-reads the save on every autosave, which is every few minutes while the player
is actually playing: whatever a reference is keyed on is re-keyed under it constantly.

## Decision

**Everything stored about a zone is pinned to a world coordinate** — the zone's centre at
the time it was written — and resolved against whichever zone is standing on that point
now, within 16 m. That covers hand-given names in `localStorage` and each plan target's
assigned zone.

**The URL carries the name instead**, slugified: `/base?zone=coal-power`. It is written
with `replaceState` and read once on load.

## Why

A coordinate is the one thing about a zone that neither the clustering nor the player can
renumber. The place is what is being referred to; the id and the name are labels that
happen to be attached to it today.

The URL is the exception because its reader is a person. `?zone=coal-power` says what it
will show; `?zone=-543,2410` says nothing, and a link is for sharing and for recognising
in a history list. Slugs are unique because duplicate zone names are numbered before they
are slugified.

`useSearchParams` is deliberately not used: it pushes a static export into a client-side
bailout, and focusing a zone is a change of view rather than somewhere to go back from.

## Consequences

- A hand-given name survives autosaves, renumbering, and the base growing around it.
- Renaming the zone you are looking at moves the link with it, so the two never
  disagree.
- A name pinned to ground nothing stands on any more is kept but unused. Rebuild there
  and it comes back; that is a feature, not a leak worth collecting.
- 16 m of reach is a judgement call: enough for a zone's centre to drift as it grows,
  not enough to reach the next zone along. Where two zones both cover a point, the
  nearest centre wins.
- Following a link into a save that has no such zone selects nothing, rather than
  guessing at a neighbour.
- The stored plan is versioned: v1 plans load and are rewritten as v2 with no
  assignments, because a plan without a zone is still a plan.
