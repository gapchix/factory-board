# 11. Reach is bought with buildings

**Status:** accepted · 2026-08-26
**Supersedes:** step 2 of [ADR 10](0010-the-frame-reaches-for-its-content.md)

## Context

ADR 10 decided the map's frame in two steps — seed on the groups big enough to count as
part of the base, then absorb the nearest remaining group while it lies within reach. It
set reach at `max(120 m, 0.6 × the frame's longest side)`, on the reasoning that at the
scale of a base a hundred metres is nothing and a big factory should reach further than a
small one.

The flat floor is the problem. It is the same allowance whatever is standing out there,
so the cheapest possible neighbour — one building — pulls as hard as half a factory. In
the reference save a single water extractor 115 m west of the factory was comfortably
inside it, and bought itself **28% of the frame's width**. The base drew in the right
three quarters of its own map with a rectangle of nothing beside it, which is the fault
ADR 10 set out to fix, arriving by a different road.

Empty frame is not free. It is the difference between a factory you can read and a smear
in a white field, and the reader was the one paying for that extractor.

## Decision

A group's reach is

```
reachPerBuildingM × members  +  reachRatio × longestSide × (members / framed)
```

with `reachPerBuildingM` 55 m and `reachRatio` 0.6, both options as before.

Each building in a group buys the frame a fixed pull, so a wing of six drags it a few
hundred metres and a lone shack has to be practically touching. The second term keeps
ADR 10's scale-awareness but pays it out in proportion to how much of the base the group
actually is, so it does nothing for an outlier however large the factory beside it.

Reach is also now evaluated **per candidate** before choosing the nearest, rather than
against the nearest one only. A group the frame cannot afford must not screen off one
behind it that can pay its own way.

## Why

55 m is a little further than the next cell over — a machine is about ten metres across
and zones cluster at thirty-two ([ADR 8](0008-machines-anchor-zones.md)). It is the
distance at which a building is plainly attached to what is beside it rather than sited
apart from it.

Three candidate rules were measured against the shapes already pinned by tests. Judging
the _area_ a group adds, or the _density_ the frame loses, both separate the two cases on
a real base but not on the small dense ones the tests use, where any absorption multiplies
a tiny area several times over. Scaling reach by share of buildings alone does separate
them — one of forty-two against two of six — but the flat floor still swallowed the
extractor before the share term was consulted. Making buildings the currency for the
whole of reach, rather than a modifier on it, is what leaves a clear margin: the extractor
is refused at 59 m of reach against a 115 m gap, where the old rule allowed 120 m.

## Consequences

- On the reference save the base frame narrowed from 407 × 145 m to 292 × 145 m and the
  drawing grew 47%. A later autosave put four buildings out there rather than one — two
  water extractors and two burners — and they are framed, correctly: four buildings 81 m
  out are a part of the base, and one is not.
- `minReachM` is gone from `FrameOptions`, replaced by `reachPerBuildingM`. The package
  is unpublished, so nothing outside this repo is broken.
- What is refused is still returned rather than dropped, and still drawn as a labelled
  pointer at the edge of the canvas, so the map admits to the extractor it left out.
- Three tests pin the rule: a lone building 130 m out is refused, six buildings at the
  same distance are reached for, and a shack does not screen off the wing behind it.
