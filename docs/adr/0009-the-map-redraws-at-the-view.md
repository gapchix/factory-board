# 9. The map redraws at the view rather than magnifying it

**Status:** accepted · 2026-08-25

## Context

The base map needed to zoom and pan. A base is hundreds of metres across, and at the
scale that fits the whole thing on screen a machine is a five-pixel square and most
labels have to be dropped for want of room.

The obvious implementation is to move the SVG `viewBox` and let the browser scale
everything inside it. It is one line, it is what `viewBox` is for, and it is wrong here.
Scaling the viewBox scales the _contents_: at 4× a 10.5 px label renders at 42 px, the
merge that draws four smelters as one mark stays merged because it is measured in metres,
and a dropped label stays dropped because the collision that dropped it was resolved
once, at fit scale. Zooming in would enlarge the picture without revealing anything —
the same information, bigger.

That is exactly backwards. The reason to zoom into a map is that there is more to see.

## Decision

The projection from world metres to canvas units depends on the current view, and the
whole model — routes, marks, merges, labels, the scale bar — is rebuilt from it on every
change. The canvas stays a fixed 1180 units wide and one unit stays about one pixel, so
nothing inside is ever scaled by the browser.

Two rules that were previously in world units became screen units, and that is where the
value is:

- **Marks merge by distance on screen**, not in metres. The threshold is 64 canvas units
  with a 2 m floor, which reproduces the old ~18 m merge at the default zoom and splits
  the group apart as soon as there is room to draw its members separately.
- **Labels are laid out afresh** at every view, so the ones that lost a collision come
  back as space appears.

## Why

Rebuilding is affordable. The work is linear in buildings and route points — a few
hundred of each on a real base — and lands well inside a frame at pan rates.

Fixing the canvas rather than the world also keeps the property [ADR 8](0008-machines-anchor-zones.md)
was written for: type is the size it says it is, at every zoom.

## Consequences

- Pointer and wheel handlers derive the next view from the current one, and both fire
  faster than React commits. The current view is therefore held in a ref and written
  synchronously; state follows for rendering.
- `wheel` has to be bound directly rather than through `onWheel`, because React registers
  it passively at the root and a passive listener cannot cancel the page scroll. The
  listener cancels _only_ when the zoom actually changed, so scrolling out at the widest
  view carries on down the page instead of trapping the reader on the map.
- Pointer capture is taken on the first real drag movement, never on the press. Capturing
  on `pointerdown` retargets the `pointerup`, which moves the resulting `click` to the
  common ancestor — and every click on a zone was being swallowed by the map.
- Routes are drawn whole and clipped by a `clipPath` rather than having their points
  filtered against the view. Filtering drops the segment that crosses the edge, so a belt
  passing through the view vanished the moment both of its ends left it.
- Labels can flicker slightly while panning as collisions resolve differently. Sorting by
  a stable priority keeps it to a minimum; it is the ordinary behaviour of dynamic map
  labelling.
