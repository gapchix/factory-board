# 21. One map, not two

**Status:** accepted · 2026-08-27

Supersedes [ADR 9](0009-the-map-redraws-at-the-view.md),
[ADR 12](0012-the-canvas-takes-the-shape-of-the-base.md),
[ADR 20](0020-outposts-go-in-the-margin.md), and the "beside, not instead of" half of
[ADR 17](0017-a-second-map-on-a-canvas.md).

## Context

[ADR 17](0017-a-second-map-on-a-canvas.md) added the WebGL factory map beside the SVG
schematic and argued the two were incompatible bargains: the schematic buys legibility
with abstraction, the factory buys fidelity with literalism, and "a single map trying to
do both would do neither". It closed with a warning to itself — _the two maps must
agree; anything added to one should be looked at twice before it is added to only one._

Two days of work is what it took to find out that warning was the finding. Everything
built after it went to one map only:

| Shipped after ADR 17                                         | Schematic | Factory |
| ------------------------------------------------------------ | --------- | ------- |
| [Trace the chain](0018-the-save-says-what-feeds-what.md)     | no        | yes     |
| [A name per block](0019-a-name-per-block-not-per-machine.md) | no        | yes     |
| True footprints and rotation                                 | no        | yes     |

The roadmap recorded both gaps as future work — "the same thing on the schematic map,
which has nowhere to put the panel yet" — which is the roadmap saying, in its own words,
that the abstraction had no room for the answer. The schematic was not a second view
being maintained. It was a view that had stopped receiving work while still costing a
toggle, a mental model, and a promise to keep two drawings in agreement.

The premise turns out to be wrong in the interesting direction. The factory map is not
worse at "what is broken and roughly where": it colours by uptime like the schematic did,
washes and names zones like the schematic did, and then answers _why_ it is broken, which
the schematic never could.

## Decision

One map. The WebGL factory map is **the** map of the base, and the schematic is deleted —
`base-map.tsx`, the outpost margin rail, and the Schematic/Factory toggle on the Base
view. Roughly 2,100 lines and one of the two things that had to agree.

## Why

- **The abstraction was buying less than it cost.** Merged marks and placed labels earn
  their keep when a mark is five pixels and a label cannot fit. A free camera answers
  that by moving, and [ADR 19](0019-a-name-per-block-not-per-machine.md) already merged
  what wanted merging — by product, at 30 m, with a caption drawn when there is room.
- **Two maps meant every question was answered twice or once.** In practice, once.
- **The bargain ADR 9 paid for was the SVG bargain.** Redrawing at the view is how you
  keep type readable when the browser is scaling a `viewBox`. Moving a container over a
  world does not have that problem, and the counter-scaled text in `scene.ts` is a
  dozen lines against `base-map.tsx`'s several hundred.

## Consequences

- **No map without WebGL.** The schematic was the fallback and there is no longer one.
  The surface says so, and points at the zone cards below, which carry the same figures
  in text. Accepted rather than solved: WebGL is fifteen years old and the app already
  requires a browser that can parse a 40 MB save.
- **Off-screen outposts lost their signpost.** The schematic drew a pointer at the frame
  edge for anything too far out ([ADR 10](0010-the-frame-reaches-for-its-content.md)) and
  then a whole margin rail ([ADR 20](0020-outposts-go-in-the-margin.md)). The factory map
  opens on the factory — `frameContent` and [ADR 11](0011-reach-is-bought-with-buildings.md)
  still decide that — and a coal outpost 700 m out is simply off-screen with nothing
  saying so. It is reachable: the zone cards below list it and "show on map" flies the
  camera there. **This is the one real regression, and the first thing to fix.**
- **`frameContent`, `joinRuns` and `groupNearby` survive**; they were always the factory
  map's too. [ADR 11](0011-reach-is-bought-with-buildings.md),
  [ADR 13](0013-zones-are-clustered-in-passes.md),
  [ADR 14](0014-a-zone-reference-is-a-point.md),
  [ADR 15](0015-runs-are-joined-fittings-are-drawn.md) and
  [ADR 19](0019-a-name-per-block-not-per-machine.md) are untouched. Splitters and mergers
  are now drawn better than ADR 15 asked for — at their real footprint, not as beads.
- **`sampleAlong` in `@factory-board/layout` has no caller left in this app.** It stays in
  the package: it is a general polyline utility with its own tests, and `layout` is
  written to be useful outside this app. The map animates its chevrons along a run
  instead.
- **The theme-colour probe, the hit-testing and the choice of PixiJS are unaffected** —
  those parts of ADR 17 describe the map that survived.
- **`ZoneBoard` lost `names` and `uptimes`.** They existed to hand the schematic lookups
  it could not derive; every survivor reads `zones` directly.
