# 25. A grid is checked before a buffer

**Status:** accepted, 2026-08-28

## Context

[ADR 24](0024-the-buffers-say-why.md) taught the board to say why a line is slow, and left
one verdict deliberately empty: `unexplained`, for a line that is fed, not backed up and
still not running. It named what would fill it —

> The likeliest remaining cause is a power circuit that cannot meet its demand, and that is
> not read yet.

There is a second reason this could not wait. **A machine whose grid has died looks exactly
like a starving one.** It stops drawing, so its input buffer fills; it makes nothing, so
its output buffer stays empty. Full input, empty output, low uptime — which is precisely
the shape ADR 24 reads as "short of something". The board would have been confidently wrong
again, in a new way.

Satisfactory does not blend power. A generator only feeds what it is physically wired to,
so a base can have one grid browning out while another idles. Nothing in the snapshot could
see that.

## Decision

**Read the grids, and check them first.**

The save states three things and they are enough: `FGPowerCircuit` carries `mCircuitID` and
the connection components wired to it; every powered building points at an
`FGPowerInfoComponent`; and that component carries `mTargetConsumption` for what the
building asks and `mDynamicProductionCapacity` for what a generator can supply. A circuit's
component list is walked back to the owning buildings — the same step every inventory takes
— and both numbers are totalled per grid.

`WorldSnapshot` gains `circuits`, and each placement gains the `circuit` it is on.

**Power is checked before the buffers**, and it is the only thing that outranks them.
Everything else in `diagnose` is inference from a level; this is two stated numbers
compared, so checking it first costs nothing in confidence and prevents the false
starvation above. A grid is at fault when `capacityMW < demandMW`, and a machine on no grid
at all is not slow, it is off.

**Deduplicated per grid.** A power pole carries several connections; counting its draw once
per wire would invent a load that is not there.

**And it will not cry wolf on a fresh save.** "On no grid" only counts when there are grids
to be off — a save read before any power was built must not report every machine as
unwired.

## Consequences

The base's real power is now readable, and it is not what the board was saying. The old
figure totalled nominal draw per production line out of the database, which misses
everything without a recipe — miners, pumps, the radar tower. On the reference save:

```
grid 0   81 buildings   166 / 490 MW    34% loaded
grid 1    9 buildings    16 /  30 MW    54% loaded
grid 4    2 buildings     5 /  30 MW    17% loaded
                        ---------------
whole base             188 / 550 MW
```

**188 MW, against the 125 MW the board reported** — understated by a third, and with no
sense of headroom at all. The Overview tile now reads `188 MW · of 550 MW built`, and a
panel breaks it down per grid, because a base-wide total hides exactly the failure this
was built to catch: one grid over capacity while the average looks fine.

Nothing on the reference save is currently overloaded or unwired, which is the right answer
and was worth being able to state.

`unexplained` now means what it says: powered, fed, not backed up, and still slow. It is a
much smaller box than it was, and everything left in it is genuinely unaccounted for.

## Alternatives considered

**Trusting `mIsProducing`.** Every machine carries it, and it would seem to answer "is this
running" outright. It is false for all 23 machines and all 14 generators on the reference
save, because the save was written on exit — it records an instant, not a condition. The
productivity measurement is the honest signal and is what the board already uses.

**Deriving capacity from the database instead.** A coal generator's nameplate is 75 MW, so
five of them is 375 MW without reading anything new. But a generator with no fuel supplies
nothing, and the save's `mDynamicProductionCapacity` already accounts for that — it is the
live figure, not the nameplate.

**Reporting a fuse as tripped.** The game trips a circuit when demand exceeds supply, and
no object in the save carries that state; `mHasPower` does not exist. So this compares the
two numbers itself and says "over capacity" rather than claiming to have read a fuse.
