#!/usr/bin/env node
/**
 * Copies the extracted game database into the app so the bundler can inline it.
 *
 * The database is generated from the developer's own Satisfactory install and is
 * never committed (see docs/adr/0003), so this fails loudly with instructions
 * rather than letting the build die on a missing import.
 */
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const source = resolve(here, '../../../packages/game-data/generated/game-database.json');
const target = resolve(here, '../src/generated/game-database.json');

/**
 * Ask for the demo even where the real data exists.
 *
 * Without this the demo can only be seen by *not having the game*, which makes
 * it unreachable for exactly the people who maintain it — a demo nobody on the
 * project can look at is one that quietly rots.
 */
const forced = process.env.FACTORY_BOARD_DEMO === '1';

mkdirSync(dirname(target), { recursive: true });

if (existsSync(source) && !forced) {
  copyFileSync(source, target);
  console.log('game database synced');
} else {
  /*
   * No install, so the demo. This used to exit 1, which was correct about the
   * licence and wrong about everything else: anyone without the game — anyone
   * the repository is shared with, and CI — hit a wall on the first command and
   * could not look at the app at all. The demo is written from scratch rather
   * than extracted, so nothing of Coffee Stain's is redistributed.
   */
  const { demoDatabase } = await import('@factory-board/game-data');
  writeFileSync(target, JSON.stringify(demoDatabase));
  console.log(
    forced
      ? 'game database: the built-in demo, because FACTORY_BOARD_DEMO=1'
      : 'game database: none found, using the built-in demo\n' +
          '  Run `npm run extract` with Satisfactory installed to use your own.',
  );
}
