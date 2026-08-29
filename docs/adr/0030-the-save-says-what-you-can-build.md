# 30. The save says what you can build

**Status:** accepted, 2026-08-29

## Context

The planner has taken a `recipeChoices` option since the first commit, and the app has put
a dropdown in front of it since the first Planner. The dropdown listed every recipe that
produces the item, marked `(alt)`, in database order. On a real extracted database that is
**110 alternates offered whether or not you have found the hard drive**, ranked by nothing,
priced at nothing. Picking one changed the plan and the board never said by how much.

Measuring it against the reference save turned a nice-to-have into a correctness problem.
Of 291 recipes, that save has unlocked **16**. Of 110 alternates, **none** — no hard drive
has been researched. And the plan the board is proudest of, the 44-machine Phase 2 factory
[ADR 26](0026-the-plan-writes-itself.md) writes in one click, contains **six lines and nine
machines behind two milestones nobody has bought**: Basic Steel Production and Advanced
Steel Production. The board was telling a player to build three Foundries they do not own,
in the same calm type as everything else.

[ADR 28](0028-the-planner-plans-against-the-world.md) said the planner should stop being a
calculator and answer against the world. This is the same argument one step further back:
a plan made of recipes you cannot build is not a plan.

## Decision

**The database records what unlocks a recipe.** `Docs.json` states it and the extractor was
throwing it away: `buildMilestones` walked every `FGSchematic`, kept the 42 matching
`Schematic_<tier>-<n>_C`, and dropped the rest — which is where hard drives and MAM research
live. `GameDatabase` gains `schematics`: every schematic that hands out at least one recipe
the database kept, with its display name, its kind, its tech tier and what it unlocks. On a
real install that is **197 entries and 37 KB** on a 222 KB database, and it covers every one
of the 291 recipes.

It overlaps `milestones` on purpose. That record is the tier ladder with its costs, which is
what the Progression view shows; this one answers a different question — what stands between
you and a recipe — and has to cover research and hard drives to answer it at all.

**The save already knew.** `mPurchasedSchematics` on the schematic manager holds everything
the player has acquired, not only milestones: the reference save's nineteen entries include
tutorial steps and two customizer unlocks. The reader has always kept all of them, under a
field named `milestones`. Nothing to change but the comment.

**A running line is proof.** The unlocked set is what the schematics say _union what the
factory is visibly making_. No save on this machine has ever completed a MAM research node,
so that one path is reasoned about rather than observed — and this is the check that keeps
being wrong about it from mattering. The worst error available here is calling a line the
player is looking at impossible, and a line with machines on it can never be called that.

**Not knowing is not "locked".** `unlockedRecipes` returns `null` rather than an empty set
when the database records no unlocks, so a database built by an older extractor says
nothing instead of saying everything is impossible. A recipe nothing is known to unlock is
never called locked either. Both are the same rule: an absent fact is not a negative one.

**A swap is priced against the whole plan.** `priceSwaps` re-solves with the candidate
pinned and reports the difference in machines, in power, and per raw resource. It has to be
the whole plan — Cast Screws removes the rod constructors that only ever existed to feed the
screw constructors, so pricing the screw line alone reports a saving of nothing and misses
five machines. `priceAllSwaps` does it for every product in the plan: 55 candidate solves in
34 ms on the reference plan, which is cheap enough to do on every change.

**The planner is not gated.** `solve` still plans exactly what it is asked for. Planning
ahead of your tech tree is a thing people do on purpose, and refusing would be worse than
useless — treating a locked recipe as absent would silently turn Steel Ingot into a raw
input and quietly shrink the plan. So the board _says_ what you cannot build yet, on the
card, and leaves the choice alone.

## Consequences

The Planner grew a section, **Other ways to build it**, and the reference save's answer to
it is a sentence the board could not have produced before:

```
YOURS ALREADY        Nothing you have unlocked would improve this plan.

WORTH GOING AFTER    what each would be worth to this plan, if you found it
  Alternate: Steel Screws          -9 machines  -24 MW   -40 Iron Ore · +18 Coal
  Alternate: Plastic Smart Plating -9 machines   -3 MW   -58 Iron Ore · +11 Crude Oil
  Alternate: Steel Rotor           -7 machines  -27 MW   -41 Iron Ore · +15 Coal
  Alternate: Cast Screws           -5 machines  -20 MW   same ore
```

Seventeen swaps would build this factory with fewer machines and the player has none of
them, which turns the list into what it should always have been: **a ranked shopping list
for hard drives**, in the currency the rest of the board counts in.

Each line card now carries the price in its own dropdown — `Alternate: Cast Screws · -5
machines · locked` — and the six unbuildable lines say so:

```
STEEL INGOT   plan 3
NOT UNLOCKED  This save cannot build it yet — it needs Tier 3 · Basic Steel Production.
```

The check that says the model is not lying: **all twelve lines the reference base is
actually running read as unlocked.** If the unlock reading were wrong, a line with machines
standing in it would read as impossible, and none does.

The demo grew a Foundry and a fourth alternate so both halves are visible without the game
([ADR 29](0029-the-board-ships-a-base-of-its-own.md)): its save has found the Cast Screws
drive, which saves it a machine, and has not found the Iron Alloy Ingot drive, which would
save another by spending copper ore. It also turned out to be **lying about itself** — its
base ran Rotor and Reinforced Iron Plate while its save owned neither of the schematics that
grant them. A test now pins that: no demo line may be running a recipe the demo save says is
locked.

## Alternatives considered

**Filtering locked recipes out of the picker.** Tempting and wrong. Planning the factory you
are about to unlock is the main reason to open a planner before you have unlocked anything,
and a picker that silently omits options is harder to trust than one that labels them.

**Trusting the class name for hard drives.** Three of 197 schematics are named
`Schematic_Alternate_*` and declare `EST_Custom` — Turbofuel, Compacted Coal and Distilled
Silica. Guessing from the name would label them correctly today and is exactly the kind of
inference that rots. Their type is reported as the files state it, and two of the three name
a second, correctly typed route anyway.

**Summing the raw column into one number.** Iron ore, water and crude oil are not addable,
and a single "raw" figure would make Pure Iron Ingot's 54 m³ of water look like ore. Deltas
stay per resource; the table shows the two biggest movers.

**Renaming `snapshot.milestones` to `purchasedSchematics`.** It is the better name and it
is load-bearing now. It also runs through the history digest, the generated default
snapshot, its Zod schema and the demo — a rename touching five files for no behaviour, in a
commit that already changes what the board claims. Documented where it is declared instead,
and left for a commit of its own.
