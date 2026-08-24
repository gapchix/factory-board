# 4. Raw resources terminate the solve

**Status:** accepted · 2026-08-24

## Context

The planner expands a target recursively: to make X, pick a recipe, then expand each of its
ingredients. The obvious stopping rule is "stop when nothing produces this item".

That rule is wrong, and it produced a genuinely absurd plan in the first prototype.

Satisfactory ships late-game Converter recipes that manufacture raw resources — SAM into
iron ore, copper ore, limestone and so on. Crucially, **they are not named
`Recipe_Alternate_*`**, so a "prefer the non-alternate recipe" heuristic picks them up as
if they were the standard way to obtain ore.

Asked for 5 Smart Plating/min, the prototype answered: 73 machines, 22 of them Converters,
consuming 733 SAM/min. For a factory at Tier 2.

## Decision

Any item flagged `isRaw` in the database ends the expansion and is reported as a raw
input. This holds even when the caller explicitly pins a recipe for it.

`isRaw` comes from the game's own `FGResourceDescriptor` native class, so the list is the
game's, not a hand-maintained one.

## Why

Ore is mined. Converting SAM is a distinct, deliberate late-game decision about an
alternative ore _source_, not a step in a production chain — and modelling it as one makes
every plan below Tier 8 nonsense.

## Consequences

- SAM-to-ore conversion cannot currently be planned. If that is ever wanted it should be a
  separate, explicit "ore source" concept, not a recipe the solver stumbles into.
- Two regression tests guard this, one on fixtures and one on the real recipe book.
