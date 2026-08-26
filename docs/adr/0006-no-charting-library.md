# 6. Charts are hand-built, not a library

**Status:** accepted · 2026-08-24

## Context

The Overview view needs bottleneck rankings, power breakdowns, machine censuses and
progress against a plan. The reflex is to add Recharts or visx.

The house stack does not name a charting library, and its rule is to propose an
addition explicitly rather than pull one in silently. So: is one needed?

## Decision

No library. A small set of primitives in `components/charts.tsx` — `StatTile`,
`BarRow`, `MeterRow`, `ChartFrame` — built from themed boxes.

## Why

- **Every figure here is a magnitude or a ratio against a limit.** Horizontal bars and
  meters cover all of it. There is no time series, no scatter, no interpolation, no
  axis maths — nothing that earns a rendering engine.
- **Theme tokens flow straight through.** Chart colours come from the same semantic
  tokens as the rest of the UI, so light and dark cannot drift apart. Theming a
  charting library to match is usually more work than the charts.
- **The accessibility rules are ours to enforce.** Status colour stays reserved, and
  values stay in text ink rather than the data colour — the warning step is 4.04:1 on
  the light surface, below the 4.5:1 text threshold. Every mark colour was checked
  against both surfaces and clears 3:1.
- Weight: a few hundred lines against tens of kilobytes of runtime.

## Revisit when

A real time series arrives — the planned history view over autosave snapshots. Line
charts with time axes, zoom and crosshair tooltips are the point at which a library
starts paying for itself. Revisit then, on evidence, and record the outcome here.

## Revisited · 2026-08-26 · still no

The history view arrived, and with it the time series this decision was waiting for.
The answer did not change.

`TimeChart` is about 140 lines: a path, a baseline, a label at each end of the span,
and a readout that follows the pointer to the nearest save. It draws at the width it
is measured at rather than being scaled into it, which is the rule
[ADR 9](0009-the-map-redraws-at-the-view.md) paid for on the map — a library scaling
its own viewBox would have had to be argued out of that. It takes the same theme
tokens as everything else, keeps status colour meaning machine state, and keeps the
number in text ink.

What a library would have added on top of those 140 lines is theming work to make it
look like the rest of the board, plus tens of kilobytes. What it would have bought is
zoom and interpolation, and neither has a question behind it: a session is one span
and it fits, and a gap between saves is a gap in the record rather than something to
smooth over.

Revisit again if a chart ever needs to compare two sessions on one axis, or to hold
more points than a screen has pixels.
