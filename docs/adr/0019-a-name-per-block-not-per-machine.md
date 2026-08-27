# 19. A name is drawn once per block, and room decides when it appears

**Status:** accepted · 2026-08-27

## Context

The factory map drew a name under every machine, and held all of them back until the
camera passed 320%. Both halves of that were wrong, and for the same reason.

Four smelters standing in a row are one answer to "what is this" — "Iron Ingot" — and
drawing the answer once per machine draws it four times on top of itself. At any zoom
loose enough to see a factory cell whole, those four labels are a smear. The fixed
threshold was the workaround: hold every name back until the machines have spread far
enough apart that four copies of the same word no longer collide. It works, and it costs
the reader the answer at every zoom they would actually want it at. On the reference
save the map showed no product at all until it was magnified past the point where a
single machine fills a fifth of the canvas.

So the map could say a line was at 83%, and could not say what it made without being
taken apart.

## Decision

Machines making the same thing, standing within 30 m of one another, are one **block**,
and a block carries one caption: `Iron Ingot ×4`.

A block is named when there is room, and nothing else gates it:

- its footprint must be at least 22 px across on screen, so a two-pixel speck is never
  captioned by something forty times its size; and
- the space the caption wants must not already be taken.

Every caption on the map is placed against one list of what is spoken for. Zone names go
down first, because a zone names a whole cell and losing it to one of the blocks inside
it is the worse trade. Blocks follow, largest first, so when two want the same strip of
screen the one standing for more machines keeps it.

There is no zoom threshold left in the machine labels at all.

## Why

Room is the thing that was actually being rationed, so room is what the rule should be
about. Deciding on it directly gets both ends right: a five-generator coal plant is named
at 40%, where it is 90 m of ground and there is nothing near it, and a lone constructor
waits until the base has spread out around it. A single number could only ever be right
for one of those.

Grouping first is what makes that affordable. Naming per machine, the label count is the
machine count and collisions are quadratic in it; naming per block, the reference save's
45 machines become 19 captions, and most of the collisions were four copies of one word
arguing with itself.

The grouping is `groupNearby` from `@factory-board/layout`, already written and tested
for zone clustering — single-linkage over a radius, which is the same question asked at a
smaller scale. The reach is 30 m because a Coal-Powered Generator is 26 m long, so
anything shorter cannot group two of them side by side.

This is [ADR 9](0009-the-map-redraws-at-the-view.md)'s bargain arriving on the other map.
The schematic map rebuilds its labels at every view and gets back the ones that lost a
collision; the factory map cannot rebuild — its whole point is that the camera moves the
world at sixty frames a second ([ADR 17](0017-a-second-map-on-a-canvas.md)) — so the
labels are built once and only their visibility is decided per view. Same property, paid
for differently.

## Consequences

- **A generator is named by what it is, not by what it makes.** A machine and a miner
  are both named by what comes out of them; a generator produces power, which is not an
  item, so a coal plant reads "Coal-Powered Generator ×5". Long, and it earns its length
  by being a wide block.
- **A machine with no recipe set says nothing**, and neither does a foundation. Producing
  nothing is not the same as producing something unnamed, and captioning idle machines
  would spend the map's scarcest resource on its least interesting buildings.
- **Captions cross machines and belts**, because a block's name hangs below the block and
  something else may be standing there. They are cased in the surface colour, which is
  the treatment the schematic map already gives its type and for the same reason — a
  conveyor running through a caption strikes it through. Candidate positions and leader
  lines, which is how the schematic map answers this properly, are not built here.
- **Two cells making the same thing stay two blocks.** This is the point rather than a
  limitation: "Iron Ingot ×8" spanning two factories 900 m apart would sit in the field
  between them and name neither.
- Captions can appear and disappear as the camera moves and collisions resolve
  differently. Ordering blocks by size keeps it stable in practice; it is the ordinary
  behaviour of dynamic map labelling, and [ADR 9](0009-the-map-redraws-at-the-view.md)
  accepted it on the other map for the same reason.
