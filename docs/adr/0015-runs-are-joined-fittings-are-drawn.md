# 15. Runs are joined where they meet; where they don't, the thing in the gap is drawn

**Status:** accepted · 2026-08-26

## Context

A conveyor is a building, and a belt across a base is a dozen of them. Drawn one
object at a time the map's wiring reads as confetti — short strokes with a gap between
them, and direction chevrons landing per segment instead of along the route.

The obvious repair is to join runs end-to-start before drawing, which
[`joinRuns`](../../packages/layout/src/path.ts) does: on the reference save it takes 101
belt objects to 59 runs and 25 pipes to 16, and the chevrons space themselves along the
whole route.

That leaves a question the roadmap did not ask: what about the gaps that are left? Every
belt end on the reference save was measured against the nearest start of another:

| What is in the gap                                 | Ends |
| -------------------------------------------------- | ---- |
| Nothing — ends meet, and are joined                | 44   |
| A splitter, merger or lift                         | 20   |
| A machine                                          | 21   |
| A storage container                                | 3    |
| Nothing found within 12 m — the end of the network | 7    |
| Unexplained, 6–10 m                                | 6    |

## Decision

**Join only where two runs actually meet**, within a metre of rounding.

**Draw what is standing in the gap** instead of reaching across it. Splitters, mergers,
lifts and containers are drawn as small beads in the belt's own colour, and they arrive
with the zoom like every other detail on this map ([ADR 9](0009-the-map-redraws-at-the-view.md)).

## Why

Reaching across the gaps was implemented and measured before being rejected. Allowing a
join through a nearby fitting bought **one** extra join out of a hundred: a splitter has
two belts leaving it, so the link is genuinely ambiguous, and the rule that keeps a
splitter a splitter refuses it — correctly. Worse, adding those reaches initially _cost_
joins by making settled ends look ambiguous, which took a second rule to undo.

So the geometry cannot say which way a route goes through a fitting, and guessing draws a
line that does not exist. Drawing the fitting says the true thing instead: the run stops
here, and this is why. On the reference save that explains 64 of the 118 run ends, and
the machines already drawn explain most of the rest — a belt that ends at a smelter ends
there because the smelter is what it feeds.

## Consequences

- The map is drawn from far fewer, far longer strokes, and chevrons are spaced along the
  route rather than per segment.
- Joining never reverses a run, because for a belt the point order is the direction the
  items travel ([SPEC](../SPEC.md#a-belts-spline-runs-downstream)).
- Beads appear below about 3.5 px per metre of zoom. The whole-base view stays a
  skeleton; the detail is there when you go looking for it.
- The remaining gaps are at machines, drawn at a fixed size in pixels — so the more you
  zoom in, the further a machine's mark sits from the belt that feeds it. Drawing
  buildings at their true footprint would close that, and needs two things the snapshot
  does not carry yet: a size per building class, and the rotation of each placement.
- The save does know exactly which belt feeds which, in `mConnectedComponent`. Reading
  that would beat any amount of geometry, and is the way to do this properly if the
  measured joins ever stop being enough.
