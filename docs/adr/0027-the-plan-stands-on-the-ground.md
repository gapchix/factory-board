# 27. The plan stands on the ground

**Status:** accepted, 2026-08-29

## Context

The board's thesis finishes here. [ADR 26](0026-the-plan-writes-itself.md) got a plan
written without anyone typing one; zones ([ADR 13](0013-zones-are-clustered-in-passes.md),
[ADR 14](0014-a-zone-reference-is-a-point.md)) got it assigned to a cell. What was left was
the part that turns a number into an instruction:

> "Build six more constructors" is only half an instruction. The other half is _where_.

The zone cards answered "where" as far as a name — _six more, in SCREWS_ — and then stopped.
The map, which knows the ground each machine stands on to the metre, said nothing about the
plan at all.

## Decision

**Draw the missing machines on the base, at the size and angle they would really be, on
ground that is really free.**

`lib/ghosts` answers three questions in order, and refuses the third rather than guessing:

**Which cell?** The zone the target was pinned to, if it was pinned. Otherwise **the zone
that already runs this recipe** — more iron rod constructors go where the iron rod
constructors are, and saying so is inference from the base, not invention. A recipe nothing
in the world makes yet has no home and is _reported_, not dropped on the nearest patch of
grass. On the reference save that is eleven of twenty-four machines: Steel Ingot, Modular
Frame, Stator and the rest of a steel chain that does not exist yet.

**Which way round?** However the machines already there face. The four iron smelters read
the same 310° because a row built side by side does; a ghost at some house angle would read
as a mistake.

**Where exactly?** The first free cell of a grid over the zone, in reading order, skipping
anything a building stands on and anything an earlier ghost took. Reading order rather than
nearest-to-anything, so ghosts for one recipe come out as a row — which is how a factory is
laid out, and how a reader tells six machines from six coincidences. Inside the cell before
outside it, then up to 28 m past its edge, because a full cell is the _normal_ case for a
plan that says to build more and refusing to leave the box would answer "no room" almost
every time.

Drawn as **dashed outlines, never filled and never coloured by uptime**. A machine that
does not exist has no health to report, and giving it one would put it in the same visual
language as the machines that do. The dash is worked out in pixels and converted back to
metres on every scale change, like the hairlines — a dash measured in metres becomes a solid
line when you zoom out and a row of bricks when you zoom in.

The toolbar gains `Plan · N`, which appears only when there is a plan to show.

## Consequences

On the reference save, one click on the Planner's proposal puts **nine dashed machines on
the map** — three more iron rod constructors, three more screw constructors, two more Smart
Plating assemblers and the rest — each in the cell that already makes that thing, facing the
way its neighbours face. Hovering one says `Screws · Constructor · Planned, not built · in
SCREWS`.

Eleven more have nowhere honest to go, because nothing in the base makes steel. That is the
right answer and the board says it rather than scattering them.

`placeGhosts` is pure — placements and boxes in, boxes out, no Pixi — and tested without a
GPU like `geometry`, `blocks`, `signposts` and `captions` beside it.

## The bug this uncovered

Verifying it needed a plan that survived opening the map, and one did not.
`BoardProvider` restores from `localStorage` in an effect and persists in two more, and all
three run on the same mount. The restore is a _dispatch_, so it does not take effect until
the next render — while the writers ran immediately, with the initial empty state, straight
over what had just been read.

**A plan did not survive a page load.** Set targets, reload, and they were gone. Every
observation this project has made about the Planner being unused was taken through that
bug; "no plan yet" may have meant "the board cannot remember a plan" all along.

The guard has to be state, not a ref. A ref set at the end of the restore effect is already
true when the writers run in that same commit, which is the bug wearing a guard — state
makes them wait for the render that actually holds the restored plan.

## Alternatives considered

**Placing ghosts by belt reach rather than by zone.** Truer to how a factory grows, and it
needs a model of what a belt could reach, which is a much larger thing than "the cell this
recipe lives in" and would be wrong in ways that are hard to see.

**Filling the ghosts in a pale version of the uptime colour.** Reads as a machine running
badly. Outline only is the whole point.

**Placing the homeless somewhere anyway.** A steel chain that does not exist has no natural
home, and putting one on the nearest free ground would be the board inventing a factory
layout — which is [SPEC.md](../SPEC.md)'s "not an optimiser" line, arriving through a
side door.
