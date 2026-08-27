# 20. Outposts go in the margin, and the map is not rotated

**Status:** superseded by [ADR 21](0021-one-map-not-two.md) · 2026-08-27

Supersedes the open question left by [ADR 11](0011-reach-is-bought-with-buildings.md)
and closes the last item of roadmap B3.

## Context

The base map had one defect larger than all the others: on the reference save the
buildings touch **2.5% of the frame**. Everything else is ground.

The roadmap said rotating the drawing onto the base's principal axis was "the only real
answer", and that it would cost a map that no longer points north. That was a guess, and
it was wrong. Measured over every angle:

|                        | frame        | area      | occupancy |
| ---------------------- | ------------ | --------- | --------- |
| north-up               | 463 × 1011 m | 0.468 km² | 2.5%      |
| tightest rotation, 64° | 1065 × 380 m | 0.405 km² | **2.9%**  |

Rotation buys **13.6% of area** and takes the ground actually covered from 2.5% to 2.9%,
in exchange for north pointing down and to the left. The emptiness was never caused by
the base sitting on a diagonal. It is caused by the base being three places rather than
one, hundreds of metres apart, and no rotation makes a mining outpost adjacent to a
smelting wing.

The real cost is visible in the frame the map opens on. The factory is 151 × 145 m and
holds 36 of the 46 framed buildings. The frame is **417 × 145 m**, because a six-machine
copper wing sits 185 m east and a four-building water outpost 194 m west. Ten buildings
stretch the frame to nearly three times the factory's width, and the scale falls from
5.22 units per metre to **2.53**. Thirty-six buildings are drawn at half size so that ten
can be drawn in the right place.

## Decision

The map is not rotated. It keeps north up.

Instead, the outlying pieces come out of the frame and go in a **rail down the right-hand
side**, each in its own box at its own scale, named for the zone it is and labelled with
how far away it lies and in which direction — `190 m E · 6 bldg`. The way an atlas insets
an island it cannot fit on the plate.

A group leaves the frame when the factory would keep less than **three fifths of the
map's longest side** by including it. The longest side is what sets the scale, so the
rule is a direct bound on how much of itself the factory gives up.

Two protections, both borrowed from what `frameContent` already learned:

- **A group holding a fifth or more of the buildings is never lifted**, whatever it
  costs. The same reasoning as ADR 11's seed rule: a factory built in two halves must not
  have one half turned into a margin note. Cost is the wrong question for something that
  is half of what you built.
- **A group that cannot pay does not block the ones behind it.** A cheap wing further out
  is still worth framing.

`canvasW` continues to mean _the map_. The rail is taken off the width allowance before
anything is fitted and drawn outside the clip that holds the map, so every projection,
clamp and hit test below is still measured against the thing it was always measured
against.

## Why

Because the numbers say the map has one problem and it is not the one the roadmap
guessed at. Rotation addresses the shape of the bounding box; the margin addresses the
reason the bounding box is that shape.

It also keeps the map honest, which rotation does not. Nothing is moved and nothing is
dropped — the main map simply stops paying for ground it has nothing to put on, and the
reader is told exactly how far the ground it stopped paying for stretches. A rotated map
lies about direction on every single mark to save 13.6%.

On the reference save the factory goes from 2.53 to **5.22 units per metre**: every
machine, label and belt at more than twice the size, in a frame it fills.

## Consequences

- **The arrows at the edge and the boxes in the margin are one list.** They are grouped
  by which outpost a building belongs to rather than by where they landed on the edge, so
  there is exactly one arrow per box and the arrow carries the box's name. They did
  disagree while this was being built: the arrow measured to the furthest building and
  the box to the centre, and the same copper wing was announced as 220 m and 190 m in the
  same picture. Distance is now the margin's to state, once.
- **The map gets taller.** The factory is nearly square, so the canvas becomes nearly
  square and reaches the 880-unit cap that [ADR 12](0012-the-canvas-takes-the-shape-of-the-base.md)
  set. That cap was already reached by the portrait "Everything" view, so this is not a
  new kind of page, but the base view is now about twice the height it was.
- **The "Everything" view is unchanged** and takes no rail. It is the honest wide shot,
  and it is where the true distances still read directly off the drawing.
- **Belt runs leaving the frame are drawn to the edge and clipped.** A run to an outpost
  now crosses empty ground and stops, which is the correct account of what is there.
- **An outpost is named for the zone most of it stands in**, and a lone miner belonging to
  no zone is named for what it is. Two outposts can therefore share a name if the base has
  two zones with the same name; they are still separate boxes at separate distances.
- The insets share whatever height the map turned out to need, between a floor and a
  ceiling, so the rail neither overflows nor leaves a column of empty margin.
