# Contributing

## Setup

```bash
npm install
npm run extract   # needs Satisfactory installed; see below
npm test
```

`npm run extract` reads `CommunityResources/Docs/en-US.json` from your own install and
writes `packages/game-data/generated/game-database.json`. That file is gitignored on
purpose — see [ADR 0003](docs/adr/0003-do-not-commit-game-data.md). Set `SATISFACTORY_DIR`
if auto-detection misses.

You can work on the planner without the game installed; only the integration tests need
it, and they skip cleanly.

## Before you push

```bash
npm run typecheck && npm run lint && npm test
```

CI runs the same three.

## House rules

**Domain rules get a test.** Every rule in [SPEC.md](docs/SPEC.md#domain-rules) exists
because getting it wrong produced a visibly wrong answer. If you change one, change the
test that pins it and say why in the PR.

**Fixtures use real game numbers.** A Constructor makes 15 Iron Rod/min in the fixtures
because it makes 15 Iron Rod/min in the game. That way assertions check the maths against
reality rather than against themselves.

**The planner stays pure.** No I/O, no file formats, no dependencies. If the solver needs
to know something, it arrives as an argument.

**Parse at the boundary.** Anything crossing a process or file boundary goes through Zod
once, at the edge. Inside, types are trusted.

**Decisions worth remembering go in an ADR.** Short: context, decision, why, consequences.
Number it, don't rewrite history — supersede instead.

## Commit messages

Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`). The scope
is the package where useful: `fix(planner): …`.
