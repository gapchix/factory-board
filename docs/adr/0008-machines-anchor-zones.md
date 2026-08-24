# 8. Machines anchor zones; belts only join them

**Status:** accepted · 2026-08-25

## Context

Every building in a save carries coordinates, so a base can be grouped into the areas it
was actually built in. Single-linkage clustering is the obvious fit — a factory cell is
"machines near each other", not "machines near a centre".

Run it over _every_ placed object and it collapses. Conveyor belts are stored as a
segment every few metres along their run, so one belt from a remote miner is a chain of
points linking two unrelated areas at every step. Single linkage follows that chain
happily, and a whole base becomes one zone. Power lines do the same thing over even
longer distances.

## Decision

Only **machines** anchor zones — by default, anything with a recipe selected. Everything
else is attached afterwards to whichever zone's footprint it falls inside, and counted
there.

The radius is 32 m, about four foundations.

## Why

Infrastructure describes a zone; it does not define one. A belt passing through says
nothing about whether two areas are the same factory, whereas six constructors in a
huddle plainly are.

Attaching rather than discarding keeps the information: a zone still reports how much
belt and how many poles sit in it, which is a fair proxy for how built-out it is.

## Consequences

- A zone needs at least two machines. Lone machines are reported as strays rather than
  becoming single-machine zones — configurable via `minAnchors`.
- Buildings far from any zone belong to none, and are counted as unassigned.
- 32 m is a judgement call, exposed as `radiusM`. On a real base, 24 m gave 4 zones,
  32 m gave 3, and 48 m merged the factory into 2 oversized blobs.
- Anything the game does not record a recipe for — storage, generators, miners — is not
  an anchor today. Extending `isAnchor` to include power and extraction would give those
  their own zones, and is the obvious next step if it proves useful.

## A related trap, in the drawing rather than the clustering

Fitting the map's viewBox to the world bounds looks right and is wrong twice over. One
power line to a distant miner stretched the extent to 690 m, squashing the factory into
the top 15% of the drawing; and because the SVG is then upscaled to the container width,
an 11px label rendered at 45px and collided with everything.

Both are fixed by drawing onto a fixed-size canvas — one unit is about one pixel, so type
is the size it says — and framing that canvas on the **zones** rather than the world,
reporting how many buildings fall outside.
