# 13. Power and extraction anchor zones, in a pass of their own

**Status:** accepted · 2026-08-26 · extends [ADR 8](0008-machines-anchor-zones.md)

## Context

[ADR 8](0008-machines-anchor-zones.md) left this open: _"Anything the game does not
record a recipe for — storage, generators, miners — is not an anchor today. Extending
`isAnchor` to include power and extraction would give those their own zones, and is the
obvious next step if it proves useful."_

It is useful. A coal plant is a place you built, and on the reference save its five
generators were reported as five buildings belonging to nothing.

Extending `isAnchor` is also wrong. Measured on that save, letting generators and miners
anchor alongside machines took the base from four zones to one 109 × 72 m blob plus
scraps: the burners and miners dotted between the Iron Ingot cell and the Concrete cell
chain-linked them, and Concrete — a zone with a name, three machines and its own uptime —
disappeared into a neighbour it had nothing to do with. That is ADR 8's own failure mode
arriving through a second door. Belts do it densely; generators do it sparsely, but far
enough to reach.

## Decision

Cluster in **passes**. Each pass groups only the anchors it accepts, in the order the
caller gives them:

1. **Production** — anything with a recipe. Exactly what ADR 8 clustered, unchanged.
2. **Support** — anything the save says is extracting or generating.

A placement both passes would take belongs to the earlier one. A later pass's cluster
that sits wholly inside a zone an earlier pass already found **joins** that zone instead
of becoming one, and so does any anchor left over on its own. A support cluster may stand
on a single anchor, where a factory cell still needs two.

The layout package knows none of these words: a pass is a predicate with two knobs, and
the domain is the app's business.

## Why

Machines define a zone; the miners and burners around them describe one. A burner
standing among the smelters it powers is part of that cell. A line of burners marching
out towards the coal is a place of its own. Clustering each kind among its own is what
tells those two apart, and it leaves the zones a reader already knows exactly as they
were.

One miner alone is still somewhere you built — an outpost, not a stray — which is why
the support pass needs no second anchor. And an anchor standing inside a zone belongs to
it whatever pass it came from, so a stray is now one that is alone _and_ nowhere near
anything, which is the thing worth reporting.

## Consequences

- On the reference save: 4 zones and 1 stray became 9 zones and none, with all four
  production zones unchanged in name and content. The new ones are the coal plant, the
  water pumps, two copper outposts and a remote coal mine.
- A zone is named after what it is for — the product its machines mostly make, the
  resource its extractors pull, or the fuel its generators burn. "Coal Power", "Water",
  "Iron Ore".
- A support zone can end up with a production name, when a lone machine standing in it
  joins: the copper outpost with a miner, a burner and one smelter is "Copper Ingot",
  which is what it is.
- Zone uptime now folds in extractors and generators, which measure their own
  productivity. Five coal generators averaging 79% is a fuel problem you can see.
- The order of the passes is load-bearing. Reverse them and the burners define the base.
