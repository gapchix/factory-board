# 10. The frame reaches for its content, not just the zones

**Status:** accepted · 2026-08-25
**Supersedes:** the closing section of [ADR 8](0008-machines-anchor-zones.md)

## Context

ADR 8 framed the map on the **zones**, because framing the whole world let one power line
to a distant miner stretch the extent to 690 m and squash the factory into a corner.

That fixed the squashing and introduced a quieter fault. Zones are anchored on machines
with a recipe, so nothing else helps decide the frame — and generators, miners, the HUB
and the Space Elevator have no recipe. On the save this was written against, the frame
covered the three zones and cropped **five** buildings, including one of the four coal
generators, six metres past the edge of the last one. They were reported as a count in
the legend and drawn nowhere. Two thirds of the framed area was empty while real
buildings sat just outside it.

## Decision

`frameContent` in `@factory-board/layout` decides the frame from everything the map would
draw a mark for — machines, landmarks and strays alike — in two steps:

1. **Seeding.** Group the points at 80 m. Any group holding at least four points _and_ a
   fifth of the largest group's is part of the base, and its bounds go into the frame.
   The largest group always counts.
2. **Reaching.** Absorb the nearest remaining group while it lies within reach of what is
   framed so far, where reach is `max(120 m, 0.6 × the frame's longest side)`. Each
   addition enlarges the frame, which lengthens the reach for the next one.

Whatever is still out of reach is _returned_, not discarded.

## Why

Both steps earn their place on real shapes.

Seeding alone would let a shack define the extent. Reaching alone starts from whichever
cluster happens to be biggest, so a factory built in two halves 800 m apart would frame
one half and call the other an outlier — which is why the seed rule exists and why it has
both an absolute and a relative test: the absolute one stops a pair of buildings counting
on a small base, the relative one stops a five-machine outpost counting against a
two-hundred-machine factory.

On the reference save this frames 292 × 145 m, covering all three zones, all five coal
generators and three of the four miners, and leaves out exactly one miner 544 m south.

## Consequences

- What falls outside is drawn as a pointer at the edge of the canvas, labelled with what
  is out there and how far, and clicking it switches the map to a view that includes it.
  Cropping is now something the map admits to rather than something it does quietly.
- The frame is only a _default_. Zoom and pan ([ADR 9](0009-the-map-redraws-at-the-view.md))
  are what make a generous frame safe to choose: nothing is unreachable, so the default
  can optimise for legibility rather than completeness.
- Three constants are judgement calls, all exposed as options: the 80 m grouping radius,
  the 120 m floor on reach, and the 0.6 ratio.
- `frameContent` is pure and lives in `layout` with the rest of the geometry, so the rule
  is tested against shapes — a satellite, two halves, a far outlier — rather than eyeballed
  against one save.
