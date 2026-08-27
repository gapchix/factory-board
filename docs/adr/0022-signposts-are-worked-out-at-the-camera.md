# 22. Signposts are worked out at the camera, and the frame is not the leash

**Status:** accepted · 2026-08-27

Answers the regression recorded in [ADR 21](0021-one-map-not-two.md).

## Context

[ADR 21](0021-one-map-not-two.md) deleted the schematic map and, with it, the two
things that said anything about what lay outside the view: the labelled pointers at the
frame edge ([ADR 10](0010-the-frame-reaches-for-its-content.md)) and the outpost margin
rail ([ADR 20](0020-outposts-go-in-the-margin.md)). Its own consequences section called
that the one real regression.

Both of those were built for a map that **fits**: one frame, decided once, everything
placed against it. The surviving map has a camera. What is off screen changes every time
the reader drags, so a rail decided at load time is wrong within one gesture — it would
still say "WATER, 194 m, west" while the reader was standing in the water extractors.

## Decision

**Every place entirely off screen gets a chip on the edge it lies beyond, recomputed
against the current camera.** The chip sits where the line from the middle of the view to
the place leaves the view, so position carries direction; an arrow carries it again for
anything near a corner; the distance is in metres from the middle of the view; and a bar
down the side carries how the place is running. Clicking one selects that zone, which is
already how the camera, the ring and the `?zone=` link move together.

The unit is the **zone**, not the building. Zones are the named, coloured, meaningful
places on this board already, and 79 drawn buildings would be a wall of chips.

It is drawn in the Pixi overlay rather than in the DOM, alongside the grid and the scale
bar. Those are the other things that live in screen space, and it is the reason panning
still costs no React render at all.

**And the frame is not the leash.** `frameContent` refuses to frame the far-flung — that
is [ADR 11](0011-reach-is-bought-with-buildings.md) doing its job, and it is why the map
opens on the factory rather than on a smudge in a field. Bounding the _pan_ by the same
box meant the places it refused to frame could not be reached at all: at 900% the slack is
a couple of metres, so flying to the coal outpost pinned the camera against the edge of
the factory and drew empty ground. The camera may now roam over everything drawn.

## Why

- **A pointer that goes stale is worse than no pointer**, because it is believed. The
  cost of recomputing is nine boxes tested against a rectangle, which is nothing next to
  what `update` already does each frame for the grid.
- **The answer is usually elsewhere.** A coal mine 655 m away at 50% is the reason a coal
  plant reads amber, and until this the only way to learn the mine existed was to drag
  there on a hunch. That is the question this board is for.
- **It says nothing when there is nothing to say.** On the reference save the opening view
  draws two chips, because seven of the nine zones are on screen; zoom into the iron
  factory and there are six. It earns its space by asking for none when the base fits.
- **A count rather than a wall.** Four chips an edge, and the rest become `+4 more`. A cap
  that drops things silently reads as "there is nothing else out there", which is the
  failure this whole decision exists to fix.

## Consequences

- Chips are hit-tested before the world is, because they are chrome sitting over the
  drawing. Hovering one suppresses the machine card and the ring.
- The distance is from the centre of the view, so it changes as you pan — which is the
  point, but it means two readers looking at the same base disagree about how far away
  the water is. They are both right.
- `signposts.ts` is pure and takes boxes, a camera and a size; the geometry is tested
  without a renderer. It is app code rather than a `layout` export because "chip" is a
  presentation idea, and `layout` does not know what a screen is.
- The pan limits now include route points, so a belt running 600 m to an outpost can be
  followed to its end rather than stopping at the edge of the factory.
