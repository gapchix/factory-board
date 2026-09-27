#!/usr/bin/env node
/**
 * Copies the extracted game database into the app so the bundler can inline it.
 *
 * The database is generated from the developer's own Satisfactory install and is
 * never committed (see docs/adr/0003). Where there is none, the built-in demo
 * goes in instead (docs/adr/0029).
 *
 * What is written is an envelope, `{ source, database }`, because the page has
 * to be able to say which of the two it is holding and the database itself
 * cannot: the demo says `sourceBuildId: 0`, and so does a real extract from an
 * Epic install, or from a browser (docs/adr/0034).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
 * project can look at is one that quietly rots. It is also what a hosted build
 * is made with: a plain build bakes the maintainer's own save and database.
 */
const forced = process.env.FACTORY_BOARD_DEMO === '1';

/**
 * The recipe book a hosted build ships, from a file outside the repository.
 *
 * A hosted copy opens on the demo base, and without a real book every save a
 * stranger drops reads as lines nobody can explain until they find and drop a
 * second file. So the hosted build is given an extract, copied onto the server
 * once and never committed: ADR 3 still holds for the repository, and ADR 38
 * says why the hosted copy is the exception.
 */
const hostedBook = process.env.FACTORY_BOARD_BOOK;

mkdirSync(dirname(target), { recursive: true });

if (hostedBook) {
  if (!existsSync(hostedBook)) {
    console.error(`FACTORY_BOARD_BOOK points at ${hostedBook}, which does not exist`);
    process.exit(1);
  }
  const database = JSON.parse(readFileSync(hostedBook, 'utf8'));
  writeFileSync(target, JSON.stringify({ source: 'hosted', database }));
  console.log(`game database: the hosted book from ${hostedBook}`);
} else if (existsSync(source) && !forced) {
  const database = JSON.parse(readFileSync(source, 'utf8'));
  writeFileSync(target, JSON.stringify({ source: 'extracted', database }));
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
  writeFileSync(target, JSON.stringify({ source: 'demo', database: demoDatabase }));
  console.log(
    forced
      ? 'game database: the built-in demo, because FACTORY_BOARD_DEMO=1'
      : 'game database: none found, using the built-in demo\n' +
          '  Run `npm run extract` with Satisfactory installed to use your own,\n' +
          '  or drop your Docs/en-US.json on the page once it is open.',
  );
}
