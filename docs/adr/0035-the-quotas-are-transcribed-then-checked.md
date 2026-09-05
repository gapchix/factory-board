# 35. The elevator's quotas are transcribed, then checked against the save

**Status:** accepted, 2026-09-05

## Context

The Space Elevator's delivery quotas drive three things: the plan the board writes for
itself ([ADR 26](0026-the-plan-writes-itself.md)), the Progression view's denominators,
and the History view's phase burn-down. `lib/phases.ts` held two of them, Phases 1 and
2, with a comment saying only verified phases were listed. Every other player is past
Phase 2, and for them all three fell silent.

Two facts about where the numbers live, both checked rather than assumed:

- **They are not in `Docs.json`.** Probed: 114 native classes, and the elevator appears
  once, as a building with a display name.
- **They are not in the save.** The phase manager records the current and target phase
  and what has been _paid_ towards the target — never the total. What the game state
  does carry is `mSpacePartsCostMultiplier`, a float a new game can set anywhere from
  0.25× to 100× and cannot change afterwards, and the game only writes it when it is not
  the default. Confirmed against the modding SDK's `FGGameState.h` and the reference
  save, where it is absent.

And one fact about what was already there: the wiki gives Phase 2 as **1,000 Smart
Plating, 1,000 Versatile Framework, 100 Automated Wiring** at the default multiplier, on
two separate pages. The transcription said 500 / 500 / 100 — the numbers the game
shipped with before 1.0. Every "466 to make", every 5 : 5 : 1, every "1h 40m" the board
had shown on the reference save was half the real distance.

## Decision

**Transcribe all five phases at 1×, scale by the save's multiplier, and withdraw a quota
the save has already exceeded.**

- `PHASES` carries Phases 1 to 5 from the wiki, with every part id looked up by display
  name in a real extracted database rather than guessed from the pattern — the numbering
  is not in phase order (Magnetic Field Generator is part 6 and Assembly Director System
  part 7; Ballistic Warp Drive is 11 and AI Expansion Server 12). A test pins every id
  against the real database where one is present.
- The reader gains `phase.costMultiplier`, read off the game state and 1 when absent.
  `requiredFor(phase, multiplier)` rounds to whole parts, floor of one; every consumer
  goes through it, including the history digest, which carries the multiplier so the
  burn-down scales too.
- `quotaFor` answers `null` when there is no target, when the phase is not transcribed —
  and **when the save has delivered more of a part than the quota says**. A transcription
  the world has exceeded is wrong for that world, whatever the cause: a multiplier the
  reader could not see, a game update, a mistake in the table. A progress bar past 100%
  is a lie about the elevator, and every caller already had an honest fallback: delivered
  amounts with no denominator. The Progression view says which of the two reasons applies.
- Phase 2 is 1,000 / 1,000 / 100.

## Consequences

**The plan the board writes doubles on the reference save**: 966 Smart Plating to make,
not 466, over 200 minutes rather than 100. The integration test that pins 44 machines
for a 5 : 5 : 1 plan is untouched — it pins the solver's arithmetic for those rates, not
where the rates come from.

**The wiki is the source, and the wiki can be wrong.** The guard is what makes that
survivable: the failure mode is a missing denominator, not a wrong one. The in-game
elevator screen is the ground truth and takes ten seconds to check; the reference save
is on Phase 2 now, so the owner can.

**A non-default multiplier has never been seen by this code.** The property name and
its default are from the header; a save started at 2× would be the first confirmation.
Rounding follows `Math.round`, which is a guess about the game's arithmetic that the
guard also covers.

## Alternatives considered

**Leaving Phases 3 to 5 out until each is verified in-game.** That is how Phase 2 came
to be wrong for a week: a verified-looking number with no check against the world.
The guard is the verification, continuously, on every save.

**Reading `mGamePhaseCosts` off the phase manager.** It exists and is marked
`SaveGame`, keyed by the pre-1.0 phase enum, and it is empty on a 1.x save. Legacy.

**Asking the player.** A field for the multiplier would be the first thing on the page
that a save could have answered.
