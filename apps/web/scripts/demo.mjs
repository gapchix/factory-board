#!/usr/bin/env node
/**
 * `npm run demo` — the board on its own base, whatever is installed.
 *
 * The demo otherwise only appears when the game is *absent*, which makes it
 * unreachable for everyone who maintains it: you would have to uninstall
 * Satisfactory to see the thing you are shipping to people who have not
 * installed it. A demo nobody on the project can look at is one that quietly
 * rots.
 *
 * So this asks for it outright. Nothing is moved or deleted — the extracted
 * database and your saves stay exactly where they are, and `npm run dev` goes
 * back to your own factory.
 *
 * A launcher rather than an inline environment variable in `package.json`,
 * because `FOO=1 npm run …` is not portable to Windows and the alternative is
 * a dependency on `cross-env` for one line.
 */
process.env.FACTORY_BOARD_DEMO = '1';

await import('./sync-game-data.mjs');
await import('./dev.mjs');
