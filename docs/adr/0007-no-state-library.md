# 7. No state library

**Status:** accepted · 2026-08-24

## Context

The app has three views sharing one plan and one loaded save. The usual answer is
Zustand, Redux Toolkit or Jotai. The house stack names none of them, and requires a new
dependency to be proposed rather than assumed.

## Decision

A single `useReducer` behind a Context provider, in `state/board.tsx`.

## Why

The entire store is three fields: `targets`, `recipeChoices`, `snapshot` (plus a
transient load status). Everything else on screen — machine counts, power, raw inputs,
the diff against reality — is **derived**, by calling `solve()` inside a `useMemo`. It
is never stored, so it can never go stale or disagree with itself.

State that small, with a single writer and no async coordination, is what `useReducer`
is for. A store library would add a dependency and an idiom without removing any code.

## Consequences

- Every consumer re-renders when the plan changes. With this store size that is
  measurably free; a selector-based library would only matter if the store grew.
- Persistence is explicit: one effect writes to `localStorage`, and reads are validated
  with Zod because that storage is user-editable and survives deploys.

## Revisit when

The store grows past a handful of independent slices — for example if the planned
history view keeps a series of snapshots in memory alongside the current one, and
components start needing narrow slices of it.
