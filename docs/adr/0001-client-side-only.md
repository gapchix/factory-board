# 1. The app is client-side only

**Status:** accepted · 2026-08-24

## Context

The tool needs to read the player's save file. The obvious architecture is an upload
endpoint: POST the `.sav`, parse it server-side, return JSON.

## Decision

Everything runs in the browser. No server, no upload, no database, no accounts. The app
is a static export deployable to any file host.

## Why

- **Saves are personal.** They contain a session name, play time and an account identity
  string. Uploading them creates a data-protection obligation that buys nothing.
- **The parser is pure JavaScript.** Verified: it parses a real save in a sandbox with no
  `require`, no `Buffer`, no `zlib`. There is no technical reason to need a server.
- **No running costs.** An OSS tool nobody has to pay to host is an OSS tool that stays up.
- **It is faster.** ~200 ms to parse locally, versus an upload round-trip.

## Consequences

- No cross-device sync. Plans live in `localStorage`; export/import is the escape hatch.
- No "share my factory" link without adding a backend later.
- The game database has to be small enough to bundle. At ~120 KB, it is.
