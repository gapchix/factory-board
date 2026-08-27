# 12. The canvas takes the shape of the base

**Status:** superseded by [ADR 21](0021-one-map-not-two.md) · 2026-08-26
**Refines:** the fixed canvas in [ADR 9](0009-the-map-redraws-at-the-view.md)

## Context

ADR 9 fixed the canvas at 1180 units wide so that one unit stays about one pixel and
nothing inside the SVG is ever scaled by the browser. That invariant is what keeps a
10.5 px label 10.5 px at every zoom, and it is not in question here.

What was in question is the other dimension. Height was derived from the width and the
world's aspect ratio, then clamped between 420 and 860 units. Width was never derived
from anything. For a base wider than it is deep that is fine, and for the reference save
it was: the framed content filled 85% of the canvas on both axes.

For a base deeper than it is wide it is a disaster. The "Everything" view pulls back to
include the outliers, and on this save that is 463 m of ground across and 1011 m down.
Fitting 1011 m into 860 units of height leaves the width fitting 463 m into 1180 — the
factory drew as a **thin ribbon using 30% of the canvas width**, with two thirds of a
very large white rectangle either side of it. The map looked broken, and the reason it
looked broken is that it was drawing a portrait subject on a landscape sheet.

## Decision

Both canvas dimensions are computed from the content:

```
fit      = min((MAX_W − 2·PAD) / worldW, (MAX_H − 2·PAD) / worldH)
canvasW  = clamp(worldW · fit + 2·PAD, MIN_W, MAX_W)
canvasH  = clamp(worldH · fit + 2·PAD, MIN_H, MAX_H)
```

with the box bounded at 1180 × 880 units. The world is fitted into the largest sheet
allowed, and then the sheet is cut back to what the fit actually used — on both axes, so
neither is left holding a band of empty ground.

The SVG is rendered at its natural size (`width` and `height` in units, `max-width: 100%`
for narrow viewports), and the surface it sits in is `width: fit-content; margin: auto`,
so a portrait canvas is a portrait panel centred in the page rather than a drawing
stranded in the middle of a wide box.

## Why

The alternative is to keep a fixed canvas and shape the _viewBox_ to the world, which is
one attribute and is what `viewBox` is for. It is also exactly what ADR 9 refused: the
SVG is then upscaled to its container by whatever the aspect ratio demands, and the same
upscale lands on the type. Shaping the canvas instead keeps the projection honest and
moves the aspect decision to the one place where it costs nothing.

Clamping stays because both extremes are real. A base a kilometre deep should not produce
an eight-thousand-unit canvas, and a base that is nearly a line should not produce a
canvas thirty units tall.

The toolbar, legend and hint stay at the width of the section rather than the width of
the canvas. They are the map's controls, not part of the drawing, and a 430-unit portrait
map has nowhere near enough room for a row of buttons.

## Consequences

- "Everything" went from 30% of the canvas width used to effectively all of it, as a
  centred portrait panel. The base view lost the last of its horizontal slack.
- Canvas width is no longer a constant, so it travels on `Home` beside the scale and the
  bounds, and every place that measured against it — pan clamping, wheel anchoring, zone
  focus, keyboard panning, the edge pointers, the scale bar — reads it from there.
- The map's height now changes with the save. That is the point, and the surrounding page
  is a single column, so nothing below it moves sideways.
- `PAD` and the frame margin were both cut, since the space they were holding for labels
  is largely bought back by leader lines.
