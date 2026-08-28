# 23. A caption is placed, not hung

**Status:** accepted, 2026-08-28

## Context

Every name on the factory map hung at a fixed offset from the thing it named. A block
caption sat four pixels below its block's southern edge; a zone caption sat at the
top-left corner of its box. Neither had a second answer when that spot was occupied — a
block caption was dropped, and a zone caption was drawn anyway, through whatever was
standing there.

On the reference save, at the view the map opens on, that produced:

- `Solid Biofuel` struck through by the `IRON INGOT` zone caption
- `Iron Ingot ×4` running into `SCREWS`
- `Wire ×2` sitting under `WIRE`
- `Biomass Burner ×3` and `Concrete` lying across machines belonging to neither
- **12 block captions drawn** out of the blocks that were wide enough to deserve one

Most of those collisions would have been solved by moving a name three pixels. Nothing
tried.

[ADR 19](0019-a-name-per-block-not-per-machine.md) got the map to name a block once
rather than once per machine, and to name it when there was _room_ rather than at a fixed
zoom. It kept the fixed offset, and noted the gap it left: "candidate positions and leader
lines, which is how the schematic map answered this, are the honest fix and are not built
here — and now there is no second map to read them off."

The schematic map had answered it before it was deleted
([ADR 21](0021-one-map-not-two.md)): three rings of candidate positions around a mark, the
first clear one wins, and a leader line back to the mark for anything placed past the
first ring.

## Decision

**Port it, and give it to both kinds of caption.**

A caption tries a ring of positions around the thing it names and takes the first that is
clear. Three rings — touching at 4 px, a step out at 13, a stride out at 26. Past the
first ring the caption is far enough away to be ambiguous about what it names, so it is
joined back by a hairline that starts on the block's edge, not its centre: a leader
through the machines it points at is worse than no leader.

Three things follow from doing it properly:

**Every drawn building is reserved, not just the blocks.** Blocks are made of productive
machines, but the map also draws storage containers, the HUB and the Space Elevator as
solid shapes. A name lying across one of those is as unreadable as a name across a
smelter, and blocks alone did not cover them.

**Zone names are placed by the same search**, with a different first choice: they hug the
top-left corner of their box rather than centring on a side, because a zone box is a
hundred metres of factory and a name centred over it stops reading as a corner mark. When
that corner is standing on a building they walk round the box.

**The two kinds trade differently when they lose.** A block caption is dropped — hovering
the machine still names it, and zooming in makes the room. A zone name is drawn at its
corner anyway, crowded, because an unnamed cell says nothing at all and the type is cased
enough to survive.

Order is priority, and it is: zone names, then blocks biggest-first. A zone names a whole
cell; losing it to one of the machine blocks inside it would be the worse trade.

The search is `apps/web/src/components/factory-map/captions.ts` — pure, in screen pixels,
knowing nothing about Satisfactory or Pixi, and tested without a GPU like `geometry.ts`,
`blocks.ts` and `signposts.ts` beside it.

## Consequences

On the reference save's opening view, **12 block captions became 15, and 7 crowded zone
captions became 7 clear ones — 22 names, none overlapping anything**. Zoomed into the iron
factory the ones that lost out come back, which is the behaviour ADR 19 asked for and
could not deliver.

`LabelBlock` now carries the whole rectangle its machines stand on rather than a centre
and a width. A caption is placed _around_ a block, so the ground it covers is what the
placer needs; the centre, the southern edge and the width all fall out of it.

Two block captions were lost relative to placing blocks alone, because zone names now
occupy real space instead of being drawn over. That is the priority working, not a
regression.

The cost is a placement pass per camera change: roughly 80 building rectangles projected,
then up to 24 candidate positions tested against a growing list for each of ~20 captions.
It is a few thousand rectangle overlaps per frame on a drag, well inside budget, and it
buys back the thing the map is for — being read.

A gotcha worth keeping: `placeCaptions` keeps its own list of what it has claimed, and
returns placements rather than that list. The zone pass and the block pass are separate
calls, so the caller has to claim the zone captions into the block pass's list itself.
Not doing that put `Copper Ingot` straight through `COPPER INGOT` — the exact bug the
change was made to fix, reintroduced one layer up.

## Alternatives considered

**More rings.** Two block captions still lose on the opening view. A fourth ring would
place them 40 px from their block, which is far enough that the leader line is doing all
the work and the reader is following a thread rather than reading a map. Zooming in is the
better answer and it already works.

**Reserving belts and pipes as well.** They cross everywhere; reserving them would cost
most of the captions. Type is cased in the surface colour precisely so a conveyor crossing
a name does not strike it through, which is the cheaper fix and was already built.

**Shrinking or truncating a caption that does not fit.** `Iron Ing…` names nothing. Drop
it and let the zoom bring it back.
