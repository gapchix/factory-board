# 33. The map names its landmarks, and the warehouse gets a place

**Status:** accepted, 2026-08-29

## Context

[ADR 19](0019-a-name-per-block-not-per-machine.md) settled how the map names things: a
machine is named by what comes out of it, once per block rather than once per machine. That
rule has one hole and it swallowed the base's landmarks.

A building says nothing unless it has a **role** — production, extraction or power. On the
reference save that leaves 36 of the 79 drawn buildings anonymous, including the four
largest things on it:

```
645 m²   Space Elevator      no caption
364 m²   The HUB             no caption
 55 m²   Storage Container   ×15, no caption
 64 m²   Lookout Tower       no caption
```

The Space Elevator is the biggest object anyone builds, the thing the Progression view is
entirely about, and the map drew it as an unlabelled grey slab.

The second half is a decision that aged. The reader summed every container into one
base-wide `stored` total, with this comment against it:

> A stock level for the whole base rather than per container: which box the five thousand
> rods are in is not a question anyone asks.

[ADR 24](0024-the-buffers-say-why.md) made it one. It found that **three of the reference
save's five starving lines are waiting for something the base already holds thousands of**,
and the board has been saying _"2,029 Wire sitting in a container — this is routing, not
production"_ ever since. Advice with nowhere to walk to is half of one.

## Decision

**A building that produces nothing is still a place, so it names itself.** Anything drawn
gets a caption unless it is one of two things: the **floor** — foundations, walls, ramps —
and a **fitting**, the splitters, mergers, junctions and pumps a belt runs through. Forty-one
captioned power poles is not a map, and a fitting is a hole in a belt rather than somewhere
to stand.

**A store is named by what is in it.** `Storage Container` is the one thing about a box a
reader can already see; it is a box, drawn as a box. What they cannot see is that this is
where 4,800 iron rods went. An empty one falls back to its own name because there is nothing
else to say about it.

**A stack of boxes is one place.** Stores are grouped by where they stand rather than by
what they hold, because a base stacks them: two containers on the reference save stand at
exactly the same point holding 2,705 Cable and 2,029 Wire, and bucketing by contents puts
two captions on one rectangle for the placement to drop one of. The block is named for what
it mostly holds, and says how many other things are in it.

**A store never joins the machines beside it.** A box of iron rods next to the constructors
making them is not a fifth constructor, and one bucket for both would caption it
`Iron Rod ×5`. Machines are _counted_; a store is _measured_, which is also why the caption
reads `4,800 Iron Rod` rather than `Iron Rod ×2`.

**The reader keeps both numbers.** `snapshot.stored` is unchanged — every panel that asks
what the base holds still gets one answer — and `placement.holding` is what this one box has
in it. An empty record rather than a missing one, the same rule the input buffers follow
since [ADR 24](0024-the-buffers-say-why.md): _this box is empty_ is a fact, and it is what
tells a caption that the grey rectangle is a box at all.

**Fittings hold things too.** A splitter sits on two ore in transit and has a storage
inventory like any container, so the question "is it a fitting" has to be asked before "does
it hold anything" — or the base sprouts a caption reading `2 Iron Ore` at every fork.

## Consequences

The map's landmarks name themselves. On the reference save, at the opening view: `Space
Elevator`, `The HUB`, `Equipment Workshop`, `Fluid Buffer ×2`, `Storage Container ×2` for the
empty ones — and where a box holds something, what it holds:

```
5,174 Iron Rod +1 more        1,016 Copper Ingot +1 more        63 Rotor +1 more
```

The Space Elevator carries its phase in the hover card — _Phase 2 · 3 parts still to
deliver_ — which is the one thing it has to add beyond its name.

**And the warehouse has a place.** The Overview's storage panel gains a link per starving
line, `/base?holding=Desc_Wire_C`, and the map flies to the fullest box holding it and rings
it. The board's most actionable sentence finally points somewhere:

```
Wire      2,029      Cable is starving for these.  find the box →
```

A flight is framed to a fixed thirty metres rather than to the building's own footprint: a
container is 5 × 11 m, and filling a 1,200 px canvas with one arrives at 4,000% zoom looking
at a brown rectangle with no ground around it. It also fires once per request rather than on
every scene rebuild, because toggling the plan or the theme rebuilds the scene and a flight
that re-fires snatches the camera back from wherever the reader had panned to.

One number moved: the map says `5,174 Iron Rod` where the Overview says 5,178. Both are
right. The four missing ones are sitting on a splitter and a merger, in transit, and a
fitting is not a box.

Fixed on the way past: the floor sort tested `FLOOR` against a building's _detail_, which is
a recipe's machine or a miner's ore and is empty for every foundation there has ever been —
so foundations have never actually been drawn first. It tests the name now, which is the same
question the captions needed answered.

## Alternatives considered

**Naming every drawn building.** Tried in the head and abandoned: the reference save would
grow eleven `Conveyor Splitter` captions and four `Conveyor Merger` ones in the densest part
of the base, competing for space with the machine names that carry the answers.

**Naming a store by its own name.** `Storage Container ×15` is true, useless, and already
visible — the map draws them.

**Keeping only the per-container contents and summing on demand.** The total is read by four
panels and the history digest; making each of them reduce a 400-building array to get a
figure they had for free is a cost with no reader.

**Flying to the zone instead of the box.** Cheaper — zones already fly — and it answers a
different question. A zone is 49 × 58 m and holds a dozen buildings; the point of the link
is _that_ box.

**A caption listing everything a stack holds.** `2,705 Cable · 2,029 Wire` on a 5 × 11 m
footprint is a caption three times the width of what it names. The biggest, and a count of
the rest, with the hover card for the whole list.
