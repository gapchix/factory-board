# Roadmap

## Shipped — phase 1

**Foundations.** npm workspaces monorepo, TypeScript strict
(`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`),
Vitest, ESLint flat config, Prettier, GitHub Actions.

**`@factory-board/planner`.** Recursive solver producing machine counts, power, raw
inputs, production balance and structured warnings. Zero dependencies.

**`@factory-board/game-data`.** Reads `Docs.json` (UTF-16LE, escaped structs),
normalises fluids to m³, prunes unreferenced items, validates with Zod, ships an
auto-detecting CLI. Yields 291 recipes / 168 items / 11 machines / 42 milestones from a
real install.

**`@factory-board/save-reader`.** Reduces a `.sav` to production lines with uptime and
clock, a building census, milestones and Space Elevator progress. Browser-safe.

**The app.** Next.js 16 static export, React 19, Chakra UI v3, light and dark. Three
views — Overview, Planner, Progression. Saves load by drag-and-drop, file picker, or
automatically from `SATISFACTORY_SAVE` / `SATISFACTORY_SAVES_DIR`, parsed in a Web
Worker. `npm run dev` watches the save folder so the dashboard follows autosaves. Plans
persist to `localStorage` and are re-validated with Zod on read.

**Verification.** 53 unit tests, plus an integration test pinning Space Elevator
Phase 2 to exactly 44 machines, 344 MW and 300.75 iron ore/min against a real extracted
database.

## Phase 2

### B. Zones — the factory in space · shipped

**`@factory-board/layout`** — a fourth package, pure geometry and graph work with no
dependencies. Single-linkage zone clustering over building coordinates, and Sugiyama-style
layering for the production graph. 26 tests.

**Base view** — a top-down map drawn from the save, machines coloured by the uptime of
the line they run, zones named after what they mostly make, with per-zone machines,
power, uptime and output.

**The plan as a schematic** — the Planner now leads with the production flow as a layered
DAG rather than a list: raw ore on the left, targets on the right, edge weight showing
throughput.

**The map became a map** — it pans and zooms, and redraws at the view rather than
magnifying, so zooming in splits merged marks apart and brings back labels there was no
room for ([ADR 9](adr/0009-the-map-redraws-at-the-view.md)). Belts carry direction
chevrons. Clicking a zone — on the map or on its card below — focuses it, and the two stay
in step. The frame is decided from everything the map draws rather than from the zones
alone, and whatever is still too far out gets a pointer at the edge saying what it is and
how far ([ADR 10](adr/0010-the-frame-reaches-for-its-content.md)).

Remaining tracks. They were independent, and the order was a product call. B3, B4, B2 and
A are done, which leaves **C** — publishing, and with it this repository's first push to a
remote.

### B3. The map — a visual pass · shipped

> **The map this describes was deleted on 2026-08-27** ([ADR 21](adr/0021-one-map-not-two.md)).
> Kept as the record of what it cost to learn. `frameContent` and its seed rule ([ADR 11](adr/0011-reach-is-bought-with-buildings.md)) carried over and still decide what the surviving map opens on; the label rings, the leader lines, the survey grid and the margin rail did not.

Confirmed on 2026-08-26 against the list below: the whitespace, the label collisions and
the flatness were the three that landed. The chrome was not — the toolbar and legend are
fine as they are.

**Whitespace.** Reach in `frameContent` is now bought with buildings rather than handed
out flat, so a lone outlier can no longer widen the frame around a factory
([ADR 11](adr/0011-reach-is-bought-with-buildings.md)) — on the save it was written
against that was 28% of the width for one water extractor. The canvas takes the content's
shape on both axes and the surface is cut to it, which is what ended the letterbox: the
"Everything" view went from using 30% of the canvas width to effectively all of it, as a
portrait panel ([ADR 12](adr/0012-the-canvas-takes-the-shape-of-the-base.md)). Frame
margin and canvas padding both came down.

**Labels.** Three rings of candidate positions instead of one, with diagonals past the
first, and a leader line joining any label that had to move out to the mark it names.
Zone captions moved inside their own zone, into a band cut out of the top of the box so
no machine is ever drawn under its own zone's name, and they are drawn after the belts
rather than before — a conveyor crossing a cell used to strike its name through. A
landmark no longer outranks a starving machine when the two want the same space.

**Flatness.** A survey grid on round world coordinates, so the ground between the cells
reads as somewhere rather than as nothing — the buildings touch under 3% of the frame,
so that space is most of the drawing. Zones are washed with the tone of the work going on
inside them, the same one their card carries below. Belts are cased so crossings read as
one run passing over another. Type carries a casing too, so it survives whatever it
crosses. The scale bar is one square of the grid.

Two of the three left open were closed on 2026-08-26; see B4 below. The third was closed
on 2026-08-27 by measuring it rather than building it:

- **The empty ground was never the diagonal, and the map is not rotated.** The buildings
  touch 2.5% of the frame. The tightest rotation over every angle is 64°, and it buys
  13.6% of area, takes the ground covered to 2.9%, and points north down and to the left
  — so it was declined. The emptiness comes from the base being three places hundreds of
  metres apart, which no rotation makes adjacent. What was built instead is the margin:
  outposts leave the frame and are drawn in a rail beside it, at their own scale, saying
  how far away they are and which way
  ([ADR 20](adr/0020-outposts-go-in-the-margin.md)). On the reference save that took the
  frame from 417 × 145 m to the factory's own 151 × 145 m, and the scale from 2.53 to
  **5.22 units per metre** — everything at more than twice the size, in a frame it fills.

### B4. The map — the wiring · shipped

> **The map this describes was deleted on 2026-08-27** ([ADR 21](adr/0021-one-map-not-two.md)).
> Kept as the record of what it cost to learn. `joinRuns` carried over. Drawing the fitting rather than reaching across the gap carried over too, and further than this asked for: splitters and mergers are now drawn at their real footprint instead of as beads on a line. The hover card is shared code and survived intact.

**Belts read as runs.** `joinRuns` joins what actually continues, end-to-start and never
reversed: 101 belt objects become 59 runs and 25 pipes become 16, and direction chevrons
space themselves along a route instead of per segment.

**What is standing in the gap is drawn** rather than reached across. Every belt end on the
reference save was measured: 44 meet another and are joined, 20 have a splitter or merger
in the gap, 21 have a machine, 3 a container. Joining _through_ a fitting was built and
measured before being thrown away — it bought one join in a hundred, because a splitter
has two belts leaving it and the link is genuinely ambiguous
([ADR 15](adr/0015-runs-are-joined-fittings-are-drawn.md)). So the fittings are drawn as
beads on the line, arriving with the zoom, and they explain 64 of the 118 run ends.

**A real hover card**, in place of the native `<title>` that took a second to appear and
could not be styled: what the mark is, what it is made in or what it handles, its uptime
as a bar, and the zone it stands in. It is placed where the pointer arrived and flips to
whichever side has room.

Still not built, and now the honest next step for the wiring: **machines are drawn at a
fixed size in pixels**, so the further you zoom in, the further a machine's mark sits from
the belt that feeds it. Drawing buildings at their true footprint needs a size per
building class out of `Docs.json` and the rotation of each placement out of the save.

### B5. The factory view — the map, on a canvas · shipped

The schematic map abstracted: merged marks, placed labels, a frame that reaches. That is
what made it good at "what is broken and roughly where", and what stopped it answering
"what did I actually build". So this arrived as a second map beside it
([ADR 17](adr/0017-a-second-map-on-a-canvas.md)) — and two days later became the only one
([ADR 21](adr/0021-one-map-not-two.md)), because everything worth building landed here.

The factory view draws **every building at its real size and angle**. The game's
`Docs.json` states the ground each one stands on in `mClearanceData` — a Constructor is
8 × 10 m, a Coal-Powered Generator 10 × 26 m — and every placement in the save carries
the quaternion it was built at, so the yaw falls out of it. On the reference save 499 of
546 building classes have a footprint, and all 408 placements have a heading; the four
iron smelters read the same 310°, which is what a row built side by side should look
like.

It is drawn with **PixiJS on WebGL**, loaded only when the view is opened. The camera
moves the world instead of the drawing being rebuilt at each view — the opposite bargain
to [ADR 9](adr/0009-the-map-redraws-at-the-view.md), and the reason it drags and zooms at
sixty frames a second. Type is counter-scaled so it stays the size it says, the grid is
drawn in screen space, and outlines are redrawn on a scale change so a hairline stays a
hairline.

Belts carry chevrons that travel downstream, machines are coloured by uptime, zones are
washed and named, and hovering gives the same card the schematic gives — hit-tested
against each building's own rotated rectangle. Selection, the `?zone=` link and the card
are shared between both maps.

**What it is making now reads off the map.** The colour channel stays on uptime — that is
the one question this map is best at, and spending it twice answers neither — so the
product arrives as type instead. Machines making the same thing within 30 m are one
block carrying one caption, `Iron Ingot ×4`, and a caption appears when there is room for
it rather than at a fixed zoom ([ADR 19](adr/0019-a-name-per-block-not-per-machine.md)).
That is what the old rule cost: names were held back until 320%. On the reference save
the whole iron chain — ingot, plate, rod, screws, reinforced plate, rotor, Smart Plating —
now names itself at 304%, while the five-generator coal plant is named from 40%, where it
is 90 m of ground with nothing near it.

Next for it, in rough order: drawing the belts a run at a time so a whole route can be
traced, and the clearance boxes that sit off-centre. Captions hanging below their own
block was the third, and it was closed on 2026-08-28 — see B9.

### B6. Trace the chain · shipped

The board could say a line was at 60%. It could not say why — which is the question a
player actually has.

The save answers it. Every connection component names the one it is plugged into, and
every connection is declared from both ends: 422 of them on the reference save, none
one-way. So `WorldSnapshot` now carries **what feeds what**, and clicking a machine on the
factory map lights its whole chain — what feeds it, what it feeds — and fogs the rest of
the base ([ADR 18](adr/0018-the-save-says-what-feeds-what.md)).

The panel names the **weakest link**: the worst-running thing upstream, how many machines
back it is, and a button that takes the camera there. It says nothing when nothing
upstream is running worse than the machine asked about, because then the trouble is here.
Tried on the reference save, clicking a smelter at 83% names the iron miner feeding it at
67%, and follows its output four machines downstream to Smart Plating sitting at 0%.

Belts, splitters and mergers are walked through rather than counted, so a hop is a
machine. Pipes are walked in both directions, because which way fluid moves depends on
the pumps — which is how a water extractor is found behind a coal generator.

Next for the chain: rates rather than uptimes, once the throughput of a belt can be worked
out rather than guessed.

### B7. One map, not two · shipped

[ADR 17](adr/0017-a-second-map-on-a-canvas.md) shipped the factory map beside the
schematic and warned itself that the two would have to agree. Two days later the score
was in: trace-the-chain went to the factory map, block captions went to the factory map,
true footprints were never possible on the other one. Nothing had gone the other way.

So the schematic is gone — `base-map.tsx`, the outpost margin rail, the toggle, about
2,100 lines ([ADR 21](adr/0021-one-map-not-two.md)). What it was good at, the survivor
already does: uptime colour, washed and named zones, and merging what wants merging by
product rather than by pixel.

One thing went with it. The schematic drew a pointer at the frame edge for anything too
far out, and then a whole rail of them; the factory map opened on the factory and said
nothing at all about the coal outpost. That was the first thing fixed — see B8.

### B8. Signposts — what is off the map · shipped

The regression B7 left open, closed the same day
([ADR 22](adr/0022-signposts-are-worked-out-at-the-camera.md)).

Every place entirely off screen gets a chip on the edge it lies beyond: name, an arrow,
how far in metres, how it is running, and a click that flies there. It is worked out
against the **current camera** rather than the opening frame, which is the whole
difference between this and the rail it replaces — pan into the water extractors and the
chip for them goes away while one for the factory appears behind you.

On the reference save the opening view draws two: **COPPER ORE, 460 m, 75%** and
**COAL, 615 m, 50%** — which are exactly the far ends of the two belt runs that used to
leave the frame and never explain themselves. Zoom into the iron factory and there are
six. Four to an edge, and the rest become one chip counting them.

**And it turned out you could not get there anyway.** Panning was bounded by the opening
frame plus a screen of slack, and the opening frame deliberately refuses to include the
far-flung ([ADR 11](adr/0011-reach-is-bought-with-buildings.md)). At 900% that slack is a
couple of metres, so flying to the coal outpost pinned the camera on the edge of the
factory and drew empty ground — the outposts were unreachable at any useful zoom, by any
means, and nothing said so. The frame is bought with buildings; the leash is not.

### B9. Captions are placed, not hung · shipped

B5 left this open and named the fix: candidate positions and leader lines, which is how
the deleted schematic map answered it. That is what was ported
([ADR 23](adr/0023-a-caption-is-placed-not-hung.md)).

A name tries three rings of positions around the thing it names — touching, a step out, a
stride out — and takes the first that is clear. Past the first ring it is joined back by a
hairline that starts on the block's **edge**, not its centre, because a leader drawn
through the machines it points at is worse than no leader.

Doing it properly pulled in two more things. **Every drawn building is reserved**, not
just the blocks: the map draws storage, the HUB and the Space Elevator as solid shapes,
and a name across one of those is as unreadable as a name across a smelter. And **zone
names go through the same search**, hugging their box's top-left corner rather than
centring on a side, walking round the box when a building is standing on that corner —
which on the reference save is exactly what struck `IRON INGOT` through.

The two kinds trade differently when they lose. A block caption is dropped, because
hovering still names the machine and zooming in makes the room. A zone name is drawn
crowded anyway, because an unnamed cell says nothing at all.

On the opening view that took **12 block captions to 15, and 7 crowded zone captions to 7
clear ones — 22 names, none overlapping anything**. Zoom into the iron factory and the
ones that lost out come back.

Still not built for the map: **pinch-zoom** — the wheel is the only way in, so a tablet
cannot use it. And the clearance boxes still ignore `RelativeTransform`, so a few
buildings sit a metre or two off where they stand.

### B2. Zones — the rest · shipped

**Power and extraction anchor zones.** A coal plant, a pump house and a mining outpost
are places you built, and the map used to report them as buildings belonging to nothing.
They are clustered in a pass of their own, because letting them anchor alongside machines
welds two factory cells into one blob — the same failure belts caused, arriving through a
second door ([ADR 13](adr/0013-zones-are-clustered-in-passes.md)). On the reference save
that took the base from 4 zones and a stray to 9 zones and none, with all four production
zones untouched.

The save says more about those buildings than the snapshot was keeping: a miner's output
buffer names the ore it stands on even when a belt has drained it, a generator names its
fuel, and both measure their own productivity. So zones are named for what they are for —
"Coal Power", "Water", "Iron Ore" — and five coal generators averaging 79% is a fuel
problem the map now shows in the colour of the mark.

**Zones are nameable, and every reference to one is a point on the ground**
([ADR 14](adr/0014-a-zone-reference-is-a-point.md)). Zone ids are positional and derived
names move with what is built, so a hand-given name and a plan target's assignment are
both pinned to a coordinate and resolved against whatever stands there now. A name
survives the autosave watcher swapping the save out from under the page.

**Deep links.** `/base?zone=coal-power` focuses that zone on load; focusing one writes the
link. Renaming the zone you are looking at moves the link with it.

**Plan targets are assigned to a zone**, so "build 6 more smelters" says where. Each zone
card shows what the plan wants built there against what is already standing — the two
numbers being in different places was the reason it was hard to act on — and the planner's
line cards carry the zone they are destined for. Targets sharing a zone are rounded up
together, because two lines in one cell share a machine and two lines 900 m apart cannot.

### A. History — the factory over time · shipped

Autosaves are a time series nobody keeps: three rotating slots, so a quarter of an hour
later the moment is gone. The board sees every one of them — `npm run dev` hands the page
a new snapshot on each autosave — so now it writes them down, whichever view is open.

**A digest, not the save** ([ADR 16](adr/0016-history-keeps-a-digest.md)). A snapshot is
40 KB and nearly all of it is placements and routes, which answer _where_. History asks
_how is this going_, and that answer is about a kilobyte: counts, power, uptime,
milestones, phase deliveries, and a count and uptime per line. In IndexedDB, keyed by the
session's own clock, capped at 2000 saves a session, parsed on the way back out so a
later release upgrades old points instead of discarding them.

**Since the last save** — the diff the roadmap asked for, ordered by what you would want
to be told first: a line that has stopped outranks one that was merely built, because the
first costs you production you thought you had.

**Over the session** — machines, power drawn, uptime and buildings as lines, with a
readout that follows the pointer to the nearest save.

**A burn-down** against the current Space Elevator phase, with a straight-line estimate of
what is left that says nothing at all until something has been delivered to judge a rate
by. The rate is measured within one phase only — the counter resets when a phase is
delivered, and measuring across that reads as going backwards.

The save reader also learned `savedAt` — the header's `saveDateTime`, sanity-checked
rather than trusted, because it has been a string, a number and Unreal's own tick count
across versions of the format.

**Seeded from disk since 2026-08-29.** History used to begin the day the board was first
opened, which on a fresh browser meant one point and every chart saying "one save so far".
The three rotating autosave slots were a series nobody was reading; the sync script now
reads the rest of the session too, as trimmed snapshots the browser digests with the same
rule as any other save. The reference save opens on four points rather than one.

A charting library was the open question here, and
[ADR 6 was revisited on the evidence](adr/0006-no-charting-library.md): still no, at about
140 lines for the chart.

### D. Why, not how much · shipped

[SPEC.md](SPEC.md) opens by saying no other tool will "open your save and tell you that
your Rotor assembler ran at 60% because screws are starving it". The board reported the
60%. It said _because screws_ nowhere, and what it said instead was wrong: everything
between 60% and 95% was labelled **starving**, which on the reference save was the
opposite of the truth for the two largest lines in the base.

The save knew. Every machine carries an input buffer and an output buffer, and the reader
already walked them — to learn _what_ ore a miner stands on, throwing the counts away.

Now it keeps them ([ADR 24](adr/0024-the-buffers-say-why.md)). A slow line is read in
**runs rather than items**, because a recipe wanting 25 screws and one wanting 2 wire are
not comparable in items and are exactly comparable in runs — which is also what names the
culprit. Output is checked before input, because a machine that cannot put anything down
stops drawing what it is fed and its input buffer fills up looking healthy.

    0%  Smart Plating   STARVING   No Rotor arriving.

60% Rotor STARVING Short of Screws — 25 left, 25 per run.
67% Iron Rod BACKED UP Output full — 399 waiting, 5,178 more in storage.

And it refuses to guess: fed, not backed up and still slow reads _"check power"_ rather
than a story, because the likeliest remaining cause is a power circuit that cannot meet
its demand and that is not read yet.

Two more answers fell out of the same data — **34 Smart Plating built and sitting in a
container** against a Space Elevator that wants 500 and has received 0, and **one coal
generator out of fuel** while its four neighbours hold 155 to 263.

**The grids, and why they are checked first**
([ADR 25](adr/0025-a-grid-is-checked-before-a-buffer.md)). A machine whose grid has died
looks exactly like a starving one: it stops drawing, so its input fills, and it makes
nothing, so its output stays empty. Reading the buffers first would have been confidently
wrong again, in a new way.

Satisfactory does not blend power — a generator feeds only what it is wired to — so the
snapshot now carries each `FGPowerCircuit` with what it draws and what it can supply, and
every placement knows its grid. The base's real figures turned out not to be the board's:

    grid 0   81 buildings   166 / 490 MW
    grid 1    9 buildings    16 /  30 MW
    grid 4    2 buildings     5 /  30 MW
    whole base             188 / 550 MW

**188 MW against the 125 MW reported**, because totalling nominal draw per production line
misses miners, pumps and everything else without a recipe.

Next for it: nothing pressing. `unexplained` now means powered, fed, not backed up and
still slow — a much smaller box, and everything left in it is genuinely unaccounted for.

### E. The plan writes itself · shipped

The board's thesis is plan against world. Half of it was built and the other half was never
used: after five days the Overview still read _"No plan yet"_ and all twelve lines were
marked `unplanned`.

The Planner was not broken — it opened on an empty box and asked what you wanted the factory
to make, which is a blank page. The presets beside it could not answer that either, because
a fixed list knows nothing about the save: `Phase 2` set 5 : 5 : 1 whether you had
delivered none of the phase or all but the last twenty.

So the Planner now leads with what the elevator is waiting for, read from the save
([ADR 26](adr/0026-the-plan-writes-itself.md)):

    THE ELEVATOR IS WAITING FOR                                    PHASE 2
    Smart Plating        466 to make  0 of 500 delivered, 34 in a box · making 0/min
    Versatile Framework  500 to make  0 of 500 delivered · making 0/min
    Automated Wiring     100 to make  0 of 100 delivered · making 0/min

    [ PLAN THIS ]  5/min · 5/min · 1/min — landing together in about 1h 40m.

Storage counts against what you must make, every part is scaled to land at the same moment
because a phase is delivered when its _last_ part arrives, and rates are whole units a
minute. One click gives 44 machines, 344 MW and **21 still to build** — the number the whole
board exists to produce, arrived at without anyone typing a target.

The two static phase presets are gone rather than left to disagree with it.

**And they stand on the ground** ([ADR 27](adr/0027-the-plan-stands-on-the-ground.md)).
What the plan is missing is drawn on the map as dashed outlines at real footprint, facing
the way the neighbours face, in the cell that already makes the thing. On the reference save
one click puts nine dashed machines on the base; eleven more have nowhere honest to go,
because nothing there makes steel yet, and the board says so rather than scattering them.

Verifying that needed a plan that survived opening the map, and one did not — see the
Fixed note in the changelog. **A plan did not survive a page load at all**, so every
observation this project made about the Planner going unused was taken through that bug.

**And the Planner stopped being a calculator**
([ADR 28](adr/0028-the-planner-plans-against-the-world.md)). It solved the targets and
reported the answer, and the answer did not know the factory existed — so it told you to
build three more Iron Rod constructors while the Overview, two panels up, said the rod line
was backed up with five thousand of them in a container.

Now a card that disagrees with the diagnosis says so; the warehouse is credited as _time_,
because a plan is a rate and a stock is a quantity and only their ratio is honest; the flow
says how much of each step is standing and dashes what is not; power is answered per grid,
where a fuse actually blows; and the missing machines are put in the order that unblocks the
most — Steel Ingot first, because five other steps are waiting behind it.

### C. Publish — the packages stand alone

All three are designed to be useful outside this app.

- Publish `planner`, `game-data`, `save-reader` to npm
- README and API docs per package, provenance in the release workflow
- A worked example: solve a factory from Node in ten lines

### Housekeeping, folded into whatever goes next

- Playwright E2E covering load → solve → compare
- Favicon and app icons
- Alternate-recipe picker: show what a swap costs in machines and power
- Export/import a plan as JSON
- A small fixture game database so CI can type-check and build `apps/web`, which today
  it cannot ([ADR 0003](adr/0003-do-not-commit-game-data.md))

## Later

- **Node budget.** How many miners at what purity a plan needs. Blocked: node type and
  purity are world-generation data and are not in save files — see
  [SPEC.md](SPEC.md#what-saves-do-not-contain).
- **Power modelling.** Generators, fuel burn and headroom, not just draw.
- ~~**Multi-save comparison.**~~ Shipped 2026-08-29, but not as written. History can now
  compare **any two saves of one session** — a from/with picker over what it has recorded —
  which is the question a player actually has: _what changed in the last hour_. Two
  **sessions** side by side was the original wording and is a category error: diffing the
  production lines of two different worlds reports every line as added and removed. Switching
  between sessions, which is the useful half, already worked.

## Not planned

Save editing, an interactive map replacing SCIM, accounts, or a hosted backend. See
[SPEC.md](SPEC.md#non-goals).
