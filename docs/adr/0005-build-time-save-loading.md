# 5. The default save is resolved at build time

**Status:** accepted · 2026-08-24

## Context

Opening a save by hand every session is friction, so the app should start with one
already loaded, configured by an environment variable.

Except the app is a static export with no server ([ADR 0001](0001-client-side-only.md)),
and a browser cannot open a path from an environment variable. It has no access to the
filesystem at all, which is a feature rather than a limitation — nothing served from
this page is allowed to read your disk.

## Decision

Resolve the save in **Node, before Next runs**, and inline the parsed _snapshot_ into
the bundle.

`scripts/sync-save.mjs` reads `SATISFACTORY_SAVE` (one file) or
`SATISFACTORY_SAVES_DIR` (newest `.sav` wins), falling back to auto-detection, and
writes `src/generated/default-snapshot.json`. `npm run dev` additionally watches the
save folder and re-runs it, so Next hot-reloads and the dashboard follows autosaves.

## Why

- It is the only way to honour the request without a server or a filesystem API.
- Only the reduced snapshot ships, not the save — a few KB rather than megabytes.
- The privacy property is preserved exactly: the _page_ still never reads a file it
  was not handed.

## Consequences

- The baked-in save is only as fresh as the last build. `npm run dev` closes that gap
  during development; a production build is a point-in-time snapshot.
- The watcher watches the **directory**, not the file. The game writes a new file and
  swaps it, which drops a watch bound to the original. Writes are debounced 750 ms
  because one autosave arrives as several events.
- Anyone deploying a build with a save baked in is publishing that save's contents.
  Deploy without the variables set unless that is intended.
- Dropping a file into the page still overrides the default, and remains the only path
  that works in a deployed build.
