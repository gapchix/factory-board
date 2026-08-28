# 26. The plan writes itself

**Status:** accepted, 2026-08-29

## Context

The board's thesis is plan against world. Half of it was built and the other half was
never used: after five days of work the Overview still read **"No plan yet — set production
targets in the Planner and this fills in"**, and every one of twelve production lines was
marked `unplanned`.

The Planner is not broken. It opens on an empty text box and asks what you want the factory
to make — which is a blank page, and a blank page is a reason not to start. The presets
beside it were supposed to answer that, and could not: they are fixed lists, and a fixed
list knows nothing about the save. `Phase 2` set 5 : 5 : 1 whether you had delivered none
of it or all but the last twenty.

Meanwhile the save says, outright:

- which phase you are on — `GP_Project_Assembly_Phase_2`
- what has been delivered towards it — 0 of 500 Smart Plating
- what is built and sitting in a container — **34 Smart Plating**, since
  [ADR 24](0024-the-buffers-say-why.md)
- what the factory produces of each part right now — 0/min

Everything needed to say _"466 Smart Plating still to make, and you are making none"_ was
already in the file the board parses on load.

## Decision

**Derive the plan from the save, and put it where the blank page was.**

Above the target editor, the Planner now leads with what the elevator is waiting for: per
part, what is still to make, what has been delivered, what is already built and boxed, and
what you produce of it today. One button turns that into targets.

Three rules decide the numbers:

**Storage counts against what you must make.** `toMake = required − delivered − stored`.
Parts in a container still have to reach the elevator, but nobody has to build them again,
and a plan that says otherwise is asking for 34 things you already own.

**Every part lands at the same moment.** A phase is delivered when its _last_ part arrives,
so finishing one of three early buys nothing. Rates are scaled to whichever part has
furthest to go — on a fresh Phase 2 that is 500 : 500 : 100, which gives 5 : 5 : 1, and is
exactly the ratio the hand-written preset used. It was right for a fresh phase and only for
a fresh phase; this stays right as deliveries accumulate.

**Whole units a minute.** 466 over 100 minutes is 4.66/min, which is a true number and a
useless instruction.

**And the two static phase presets are deleted.** A save-blind duplicate standing next to a
save-aware answer is two sources of truth that will disagree — the same argument that
deleted the second map in [ADR 21](0021-one-map-not-two.md). `Reinforced Plate 10/min`
stays, as a worked example of what a hand-written target looks like.

Quotas are still transcribed rather than extracted, so a phase with no verified quota
proposes nothing at all rather than inventing a denominator — the rule
[phases.ts](../../apps/web/src/lib/phases.ts) already followed.

## Consequences

On the reference save the Planner opens saying:

```
THE ELEVATOR IS WAITING FOR                                        PHASE 2
Smart Plating         466 to make   0 of 500 delivered, 34 built and in a box · making 0/min
Versatile Framework   500 to make   0 of 500 delivered · making 0/min
Automated Wiring      100 to make   0 of 100 delivered · making 0/min

[ PLAN THIS ]  5/min · 5/min · 1/min — every part lands together, in about 1h 40m.
```

One click gives 44 planned machines, 344 MW and **21 still to build** — which is the number
the whole board was built to produce, and the first time it has appeared without someone
typing a target first.

The rate shown per part is what the factory _actually_ makes, uptime included, not its
nameplate. That is why all three read 0/min: Smart Plating has an assembler that has not
run, and the other two have no line at all. A nominal figure would have said 2/min for
Smart Plating and been useless.

`planForPhase` is pure and tested against the real quotas; it needs a snapshot and a
database and nothing else.

## Alternatives considered

**Asking for a completion time.** "Finish Phase 2 in [2 hours]" is a better question than a
blank box, but it is still a question. The pace is set from the largest remaining part
instead, and the resulting time is _reported_ — the reader can still change any rate in the
editor below, which is what the editor is for.

**Proposing from the milestone tree as well.** The next milestone's cost is known and could
be planned the same way. It is a weaker prompt: milestones are paid once from a stock, not
fed at a rate, so a production plan is the wrong shape for them.

**Leaving the presets and adding the proposal beside them.** They would have disagreed
within one delivery.
