# 2. TypeScript 6, not 7

**Status:** accepted · 2026-08-24

## Context

House style is "always the latest stable version". At the time of writing that is
TypeScript 7.0.2, and the codebase compiles cleanly on it — every package, strict mode,
`exactOptionalPropertyTypes` included.

But `typescript-eslint@8.68.0` declares `peerDependencies.typescript: ">=4.8.4 <6.1.0"`.
Installing TypeScript 7 fails resolution outright.

## Decision

Pin TypeScript to `^6.0.3` — the newest release the rest of the toolchain supports.

## Why

Type-aware linting is worth more than a major version number. The rules that need type
information are the ones that catch real bugs (floating promises, unsafe `any` flow,
misused promises); losing them to run a newer compiler is a bad trade.

This is the "unless a specific constraint forces otherwise" clause doing its job.

## Revisit when

`typescript-eslint` widens its peer range to include 7.x. The codebase is already known to
build on 7, so the upgrade should be a one-line change plus a test run.
