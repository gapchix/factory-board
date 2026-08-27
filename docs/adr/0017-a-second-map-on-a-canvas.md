# 17. A second map, drawn on a canvas, beside the schematic — not instead of it

**Status:** accepted · 2026-08-26 · partly superseded by [ADR 21](0021-one-map-not-two.md)

## Context

The map that exists is a schematic. It merges machines running the same recipe into
one mark, places labels by fighting for space, redraws the whole picture at every view
so type stays the size it says, and frames itself on what is worth looking at. It is
good at one question: _what is broken, and roughly where?_

It is not good at another: _what did I actually build?_ Every building is a mark of the
same fixed size, so the further in you zoom the further a machine drifts from the belt
feeding it, and a factory reads as a dot cloud with a spine.

Two things arrived that make the second question answerable. The game's `Docs.json`
states `mClearanceData` — the hard clearance box, which is the ground a building stands
on: a Constructor is 8 × 10 m, a Coal-Powered Generator 10 × 26 m, checked against the
wiki. And every placement in the save carries the quaternion it was built at, from which
the yaw falls out.

## Decision

Add a **second view of the same base**, on a WebGL canvas, and keep the schematic
exactly as it is. A control on the Base view switches between **Schematic** and
**Factory**; both share the zone selection, the deep link and the hover card.

The renderer is **PixiJS**, loaded only when the factory view is opened, through
`next/dynamic` with `ssr: false`.

The camera moves the world rather than the drawing being rebuilt at each view — the
opposite bargain to [ADR 9](0009-the-map-redraws-at-the-view.md).

## Why

**Two views rather than one, because the two bargains are incompatible.** The schematic
buys legibility with abstraction: merged marks, dropped labels, a frame that reaches.
The factory buys fidelity with literalism: every building where and as it is, nothing
merged, nothing moved. Neither is a better version of the other, and a single map trying
to do both would do neither. The schematic stays the default because "what is broken" is
still the question people open the tool with.

**A canvas, because the bargain flips.** Moving one container is how you drag a hundred
thousand rectangles at sixty frames a second; rebuilding SVG per frame is not. The cost
is that everything scales with the zoom, so type is counter-scaled by hand, the grid is
drawn in screen space, and outlines are redrawn when the scale changes so a hairline
stays a hairline instead of growing into a band.

**PixiJS specifically.** deck.gl is built around geographic projections and layers this
map does not need, and is twice the weight. three.js is a 3D engine asked to do 2D.
Plain Canvas 2D would serve today's 400 buildings but not a late-game base, and would
mean writing batching by hand. Pixi is a 2D scene graph over WebGL, which is exactly the
shape of the problem. It is loaded on demand, so a reader who never opens the factory
view never downloads it.

**Node-graph libraries were considered and rejected outright.** React Flow, Cytoscape
and d3-force lay out _graphs_ — they invent positions. Every building here already has a
true position, and a layout algorithm would destroy the only thing this map knows.

## Consequences

- The first runtime dependency the app has taken on for the sake of drawing, and the
  only one not on the house stack. It earns it by being the renderer, not a chart kit.
- Theme colours have to reach WebGL as numbers. Chakra inlines custom token colours into
  a generated class rather than publishing them as root variables, so they cannot be read
  from `:root` — the map renders one hidden element per token and asks each what colour
  it ended up. A `MutationObserver` on the document class re-reads them when the theme
  changes, and the scene is rebuilt with the camera left where the reader had it.
- Hit-testing is ours: a point is transformed into each building's own frame rather than
  handed to the DOM. That is what makes hovering a rotated rectangle work.
- The two maps must agree. Zone selection, the `?zone=` link and the hover card are
  shared; anything else added to one should be looked at twice before it is added to only
  one.
- Footprints are drawn centred on the placement and ignore a clearance box's
  `RelativeTransform` offset, so a handful of buildings sit a metre or two off their true
  outline. Worth fixing when it shows.
- Buildings that declare no clearance — belts, poles, wires — are not drawn as shapes at
  all. They are routes, and they were already drawn as routes.
